import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../../engine/assets';
import type { AudioService } from '../../engine/audio';
import { TILE } from '../../engine/config';
import type { DoorDef, TileMap } from './tilemap';

const OPEN_TIME = 0.22; // seconds to slide fully open
const TRIGGER_DIST = 44; // px from door centre
const CLOSE_DELAY = 1.4;
/** Door is walkable once this far open. */
const PASSABLE_AT = 0.55;

interface DoorState {
  def: DoorDef;
  cx: number;
  cy: number;
  open: number; // 0..1
  wantOpen: boolean;
  idle: number;
  leaves: [Sprite, Sprite];
  /** Status lamp of a security door (red while locked). */
  lamp: Graphics | null;
}

const LOCKED_TINT = 0xd0584a;

export interface DoorUser {
  x: number;
  y: number;
  alive: boolean;
}

/**
 * Automatic sliding doors. They open when anyone is near and close after a delay.
 * The hiss is an audio cue, and a door the player opens can be heard by nearby enemies.
 */
export class Doors {
  readonly container = new Container();
  private doors: DoorState[] = [];

  constructor(
    private map: TileMap,
    private audio: AudioService,
    private onPlayerNoise: (x: number, y: number, radius: number) => void,
  ) {
    for (const def of map.doors) {
      const [a, b] = def.tiles;
      const kind = def.vertical ? 'v' : 'h';
      const la = new Sprite(tex(`door_${kind}_a`));
      const lb = new Sprite(tex(`door_${kind}_b`));
      la.position.set(a.tx * TILE, a.ty * TILE);
      lb.position.set(b.tx * TILE, b.ty * TILE);
      // Leaves retract toward the outer edges.
      if (def.vertical) {
        lb.anchor.set(0, 1);
        lb.y += TILE;
      } else {
        lb.anchor.set(1, 0);
        lb.x += TILE;
      }
      this.container.addChild(la, lb);
      const cx = ((a.tx + b.tx) / 2 + 0.5) * TILE;
      const cy = ((a.ty + b.ty) / 2 + 0.5) * TILE;
      let lamp: Graphics | null = null;
      if (def.locked) {
        la.tint = lb.tint = LOCKED_TINT;
        lamp = new Graphics();
        lamp.position.set(def.vertical ? cx : cx + TILE + 4, def.vertical ? cy - TILE - 8 : cy - 22);
        this.container.addChild(lamp);
      }
      this.doors.push({ def, cx, cy, open: 0, wantOpen: false, idle: 0, leaves: [la, lb], lamp });
      if (lamp) this.drawLamp(this.doors[this.doors.length - 1]);
    }
  }

  /** Swipe a keycard: the security door works like any other from now on. */
  unlock(def: DoorDef): void {
    const d = this.doors.find((q) => q.def === def);
    if (!d || !def.locked) return;
    def.locked = false;
    for (const t of def.tiles) this.map.setDoorLocked(t.tx, t.ty, false);
    for (const leaf of d.leaves) leaf.tint = 0xe8b0a0;
    this.drawLamp(d);
  }

  private drawLamp(d: DoorState): void {
    if (!d.lamp) return;
    const c = d.def.locked ? 0xff3a2a : 0x7dff9a;
    d.lamp.clear().rect(-3, -2, 6, 4).fill({ color: 0x14110e }).rect(-2, -1, 4, 2).fill({ color: c });
  }

  update(dt: number, player: DoorUser, others: readonly DoorUser[]): void {
    for (const d of this.doors) {
      if (d.def.locked) continue;
      const near = (u: DoorUser) => u.alive && Math.hypot(u.x - d.cx, u.y - d.cy) < TRIGGER_DIST;
      const playerNear = near(player);
      const anyone = playerNear || others.some(near);
      if (anyone) {
        d.idle = 0;
        if (!d.wantOpen) {
          d.wantOpen = true;
          this.audio.sfx('door', d.cx, d.cy);
          if (playerNear) this.onPlayerNoise(d.cx, d.cy, 140);
        }
      } else if (d.wantOpen) {
        d.idle += dt;
        if (d.idle > CLOSE_DELAY && !this.occupied(d, player, others)) {
          d.wantOpen = false;
          this.audio.sfx('door', d.cx, d.cy);
        }
      }
      const target = d.wantOpen ? 1 : 0;
      const step = dt / OPEN_TIME;
      d.open = d.open < target ? Math.min(target, d.open + step) : Math.max(target, d.open - step);

      const passable = d.open >= PASSABLE_AT;
      for (const t of d.def.tiles) this.map.setDoorOpen(t.tx, t.ty, passable);

      const s = 1 - d.open * 0.82;
      for (const leaf of d.leaves) {
        if (d.def.vertical) leaf.scale.y = s;
        else leaf.scale.x = s;
      }
    }
  }

  /** Something is standing in the doorway: never close on it. */
  private occupied(d: DoorState, player: DoorUser, others: readonly DoorUser[]): boolean {
    const inside = (u: DoorUser) => u.alive && d.def.tiles.some((t) =>
      u.x > t.tx * TILE - 8 && u.x < (t.tx + 1) * TILE + 8 && u.y > t.ty * TILE - 8 && u.y < (t.ty + 1) * TILE + 8);
    return inside(player) || others.some(inside);
  }
}
