import type { EmitterKind } from '../../engine/audio';

/** Something in the room that hums, whines or breathes where it stands. */
export interface Emitter {
  kind: EmitterKind;
  x: number;
  y: number;
}

const BY_SPRITE: Record<string, EmitterKind> = {
  ship_reactor: 'machine',
  ship_tank: 'machine',
  ship_capsule: 'machine',
  ship_machine: 'machine',
  ship_workbench: 'machine',
  ship_server: 'electronic',
  ship_server2: 'electronic',
  hack_server: 'electronic',
  hack_rack: 'electronic',
  hack_terminal: 'electronic',
  hack_console: 'electronic',
  ship_terminal: 'electronic',
  ship_console3: 'electronic',
  ship_console_b: 'electronic',
  ship_radar: 'electronic',
  med_monitor: 'electronic',
  ship_vent: 'vent',
  ship_vent2: 'vent',
};

/** Emitters for every placed prop (or container sprite) that makes a sound. */
export function emittersFrom(things: { sprite: string; x: number; y: number }[]): Emitter[] {
  const out: Emitter[] = [];
  for (const t of things) {
    const kind = BY_SPRITE[t.sprite];
    if (kind) out.push({ kind, x: t.x, y: t.y });
  }
  return out;
}

const RADIUS: Record<EmitterKind, number> = { machine: 260, electronic: 150, vent: 170 };

/**
 * How loud each kind is at the listener: the nearest few add up, walls halve them,
 * and the loudest one decides which ear it's in.
 */
export function emitterLevels(
  list: Emitter[], lx: number, ly: number, blocked: (x: number, y: number) => boolean,
): Partial<Record<EmitterKind, { level: number; pan: number }>> {
  const out: Partial<Record<EmitterKind, { level: number; pan: number; best: number }>> = {};
  for (const e of list) {
    const d = Math.hypot(e.x - lx, e.y - ly);
    const r = RADIUS[e.kind];
    if (d > r) continue;
    let v = (1 - d / r) ** 2;
    if (blocked(e.x, e.y)) v *= 0.4;
    const cur = out[e.kind] ?? { level: 0, pan: 0, best: 0 };
    cur.level = Math.min(1, cur.level + v);
    if (v > cur.best) {
      cur.best = v;
      cur.pan = (e.x - lx) / 200;
    }
    out[e.kind] = cur;
  }
  return out;
}
