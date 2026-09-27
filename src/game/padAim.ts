/**
 * Aiming with a stick. The right stick sets the direction; how far it is pushed sets how
 * far out the reticle sits (and so where grenades land). The reticle turns toward the
 * stick fast but not instantly, which filters thumb jitter, and small deflections turn
 * slower for fine corrections. A mild magnetism bends the aim toward a visible hostile
 * close to the line, never through walls and never when the stick is at rest.
 *
 * Pure logic: the game supplies the stick, the gun position and the targets.
 */

/** Something worth aiming at, in the same space as the gun origin. */
export interface AimTarget {
  x: number;
  y: number;
  /** Body radius (px). */
  r: number;
}

export interface PadAimInput {
  stick: { x: number; y: number; mag: number };
  /** Movement intent (the reticle drifts toward it when the aim stick is idle). */
  move: { x: number; y: number };
  steady: boolean;
  firing: boolean;
  /** Player setting, 0.5..1.5. */
  sensitivity: number;
  assist: boolean;
  targets: readonly AimTarget[];
  ox: number;
  oy: number;
}

export const AIM_DIST = { rest: 96, min: 74, max: 150, steady: 215 };
const ASSIST_RANGE = 380;
const ASSIST_STRENGTH = 0.85;
/** Stick idle this long while walking: the aim follows the walk. */
const FOLLOW_AFTER = 0.5;

function wrap(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export class PadAim {
  angle = 0;
  dist = AIM_DIST.rest;
  /** Seconds since the aim stick was last used. */
  idle = 99;
  /** Current assist pull (0..1), for the reticle. */
  pull = 0;

  reset(angle: number, dist = AIM_DIST.rest): void {
    this.angle = angle;
    this.dist = Math.max(AIM_DIST.min, Math.min(AIM_DIST.steady, dist));
  }

  update(dt: number, inp: PadAimInput): { x: number; y: number } {
    const s = inp.stick;
    let want = this.angle;
    let rate = 0;
    let far = inp.steady ? AIM_DIST.steady : AIM_DIST.rest;
    this.pull = 0;

    if (s.mag > 0) {
      this.idle = 0;
      want = Math.atan2(s.y, s.x);
      rate = (10 + 22 * s.mag) * inp.sensitivity;
      if (Math.abs(wrap(want - this.angle)) > 1.6) rate *= 2.2; // a flick snaps around
      far = inp.steady ? AIM_DIST.steady : AIM_DIST.min + (AIM_DIST.max - AIM_DIST.min) * s.mag ** 1.5;
    } else {
      this.idle += dt;
      const mm = Math.hypot(inp.move.x, inp.move.y);
      if (mm > 0.3 && this.idle > FOLLOW_AFTER && !inp.firing && !inp.steady) {
        want = Math.atan2(inp.move.y, inp.move.x);
        rate = 5;
      }
    }

    // Magnetism: only while actually aiming (stick out, or the trigger pulled).
    if (inp.assist && (s.mag > 0 || inp.firing)) {
      let best: { err: number; r: number; cone: number; d: number } | null = null;
      for (const t of inp.targets) {
        const dx = t.x - inp.ox;
        const dy = t.y - inp.oy;
        const d = Math.hypot(dx, dy);
        if (d < 20 || d > ASSIST_RANGE) continue;
        const err = wrap(Math.atan2(dy, dx) - want);
        const r = Math.atan(t.r / d);
        const cone = Math.min(0.22, r + 0.07);
        if (Math.abs(err) < cone && (!best || Math.abs(err) < Math.abs(best.err))) best = { err, r, cone, d };
      }
      if (best) {
        const fall = Math.max(0, Math.min(1, 1 - (Math.abs(best.err) - best.r) / (best.cone - best.r)));
        want += best.err * fall * ASSIST_STRENGTH;
        if (rate === 0) rate = 12;
        rate *= 1 - 0.35 * fall; // a little friction over a target
        far += (best.d - far) * 0.8 * fall;
        this.pull = fall;
      }
    }

    if (rate > 0) this.angle = wrap(this.angle + wrap(want - this.angle) * (1 - Math.exp(-rate * dt)));
    this.dist += (far - this.dist) * (1 - Math.exp(-8 * dt));
    return { x: inp.ox + Math.cos(this.angle) * this.dist, y: inp.oy + Math.sin(this.angle) * this.dist };
  }
}
