import { Graphics } from 'pixi.js';
import type { AudioService } from '../../engine/audio';
import type { Effects } from './effects';

/**
 * The small signs that a place is still running: status LEDs blinking on servers and
 * consoles, damaged machines spitting sparks, pipes venting steam, and dust hanging in
 * the air that only shows where a light catches it.
 */

interface Led {
  x: number;
  y: number;
  color: number;
  period: number;
  duty: number;
  phase: number;
}

interface Emitter {
  x: number;
  y: number;
  timer: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

/** Where on a prop its lights are: [x0, x1, y0, y1] relative to the bottom-centre, count, colours. */
const LED_ZONES: Record<string, [number, number, number, number, number, number[]]> = {
  ship_server: [-8, 8, -40, -12, 5, [0x5fe08a, 0x5fe08a, 0xffb040, 0x4aa8ff]],
  ship_server2: [-8, 8, -40, -12, 5, [0x5fe08a, 0x4aa8ff, 0xff4a32]],
  hack_server: [-6, 6, -30, -10, 4, [0x5fe08a, 0xffb040]],
  hack_rack: [-7, 7, -34, -8, 5, [0x5fe08a, 0x5fe08a, 0xff4a32]],
  ship_terminal: [-6, 6, -40, -30, 2, [0x7dff9a]],
  hack_terminal: [-6, 6, -44, -34, 2, [0x7dff9a]],
  ship_console3: [-40, 40, -40, -26, 6, [0x5fe08a, 0xffb040, 0xff4a32, 0x4aa8ff]],
  ship_console_b: [-34, 34, -36, -24, 5, [0x5fe08a, 0xffb040, 0xff4a32]],
  med_monitor: [-8, 8, -22, -12, 2, [0x5fe0c8]],
  ship_radar: [-30, 30, -40, -20, 4, [0x5fe08a]],
  ship_reactor: [-4, 4, -40, -30, 2, [0xffb040]],
};

const SPARKING = new Set(['ship_machine', 'ship_workbench', 'ship_console_b', 'ship_robot', 'ship_tv']);
const STEAMING = new Set(['ship_pipe_v', 'ship_tank', 'ship_capsule']);

const MOTE_W = 360;
const MOTE_H = 220;

export class AmbientFx {
  /** Emissive LEDs, drawn above the darkness. */
  readonly glow = new Graphics();
  /** Dust in the air, drawn in the lit layer (only visible where light falls). */
  readonly dust = new Graphics();
  private leds: Led[] = [];
  private sparks: Emitter[] = [];
  private steam: Emitter[] = [];
  private motes: Mote[] = [];
  private t = 0;

  constructor(
    props: { sprite: string; x: number; y: number }[],
    private effects: Effects,
    private audio: AudioService,
    private flash: (x: number, y: number, radius: number, color: number, intensity: number) => void,
    seed = 1,
  ) {
    let r = seed >>> 0 || 1;
    const rand = () => {
      r = (r * 1664525 + 1013904223) >>> 0;
      return r / 4294967296;
    };
    for (const p of props) {
      const z = LED_ZONES[p.sprite];
      if (z) {
        const [x0, x1, y0, y1, n, colors] = z;
        for (let i = 0; i < n; i++) {
          this.leds.push({
            x: Math.round(p.x + x0 + rand() * (x1 - x0)), y: Math.round(p.y + y0 + rand() * (y1 - y0)),
            color: colors[Math.floor(rand() * colors.length)], period: 0.4 + rand() * 2.2, duty: 0.3 + rand() * 0.6, phase: rand() * 3,
          });
        }
      }
      // One machine in three is on its last legs.
      if (SPARKING.has(p.sprite) && rand() < 0.35) this.sparks.push({ x: p.x + (rand() - 0.5) * 16, y: p.y - 14 - rand() * 12, timer: 1 + rand() * 6 });
      if (STEAMING.has(p.sprite) && rand() < 0.5) this.steam.push({ x: p.x + (rand() - 0.5) * 8, y: p.y - 26 - rand() * 20, timer: 2 + rand() * 6 });
    }
    for (let i = 0; i < 46; i++) {
      this.motes.push({ x: rand() * MOTE_W, y: rand() * MOTE_H, vx: (rand() - 0.5) * 4, vy: (rand() - 0.5) * 3 - 1, phase: rand() * 6 });
    }
  }

  update(dt: number, camLeft: number, camTop: number, camW: number, camH: number): void {
    this.t += dt;
    const g = this.glow.clear();
    for (const l of this.leds) {
      if (l.x < camLeft - 4 || l.x > camLeft + camW + 4 || l.y < camTop - 4 || l.y > camTop + camH + 4) continue;
      const on = ((this.t + l.phase) % l.period) / l.period < l.duty;
      if (on) g.rect(l.x, l.y, 1, 1).fill({ color: l.color });
    }

    for (const s of this.sparks) {
      s.timer -= dt;
      if (s.timer > 0) continue;
      s.timer = 2 + Math.random() * 7;
      if (s.x < camLeft - 200 || s.x > camLeft + camW + 200 || s.y < camTop - 200 || s.y > camTop + camH + 200) continue;
      this.effects.sparkBurst(s.x, s.y, 5 + Math.floor(Math.random() * 6));
      this.flash(s.x, s.y + 10, 70, 0xbfe0ff, 0.6);
      this.audio.sfx('zap', s.x, s.y);
    }

    for (const s of this.steam) {
      s.timer -= dt;
      if (s.timer > 0) continue;
      s.timer = 3 + Math.random() * 7;
      if (s.x < camLeft - 150 || s.x > camLeft + camW + 150 || s.y < camTop - 150 || s.y > camTop + camH + 150) continue;
      this.effects.steam(s.x, s.y);
      this.audio.sfx('hiss', s.x, s.y);
    }

    // Dust: a field that wraps around the camera, drifting and twinkling slightly.
    const d = this.dust.clear();
    for (const m of this.motes) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const wx = camLeft - 20 + ((((m.x - camLeft) % MOTE_W) + MOTE_W) % MOTE_W);
      const wy = camTop - 20 + ((((m.y - camTop) % MOTE_H) + MOTE_H) % MOTE_H);
      const a = 0.25 + 0.2 * Math.sin(this.t * 1.7 + m.phase);
      d.rect(Math.round(wx), Math.round(wy), 1, 1).fill({ color: 0xe8dcc4, alpha: a });
    }
  }
}
