import { VIEW_H, VIEW_W } from './config';

const FOLLOW_SHARPNESS = 12; // higher = snappier follow
const LOOK_AHEAD = 0.28; // fraction of mouse offset from screen centre
const MAX_SHAKE = 7; // px at full trauma
const TRAUMA_DECAY = 2.2; // per second
const KICK_DECAY = 18;

/**
 * Smooth follow camera with mouse look-ahead, trauma-based shake and directional kick.
 * The final position is always rounded to whole pixels to keep pixel art crisp.
 */
export class Camera {
  x = 0;
  y = 0;
  /** Rounded top-left corner of the view in world space (valid after update). */
  left = 0;
  top = 0;

  private trauma = 0;
  private kickX = 0;
  private kickY = 0;
  private time = 0;

  /** Fraction of the mouse offset the view leans toward (0 = locked on target). */
  lookAhead = LOOK_AHEAD;

  constructor(private worldW: number, private worldH: number) {}

  snapTo(x: number, y: number): void {
    this.x = x;
    this.y = y;
  }

  /** Player preference: how strongly shake is felt (0 = never). */
  shakeScale = 1;

  /** Add screen shake. 0..1, stacks up to 1. */
  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount * this.shakeScale);
  }

  /** Push the view in a direction (e.g. opposite of a gunshot). */
  kick(dx: number, dy: number): void {
    this.kickX += dx;
    this.kickY += dy;
  }

  update(dt: number, targetX: number, targetY: number, mouseViewX: number, mouseViewY: number): void {
    this.time += dt;
    const lookX = (mouseViewX - VIEW_W / 2) * this.lookAhead;
    const lookY = (mouseViewY - VIEW_H / 2) * this.lookAhead;
    const t = 1 - Math.exp(-FOLLOW_SHARPNESS * dt);
    this.x += (targetX + lookX - this.x) * t;
    this.y += (targetY + lookY - this.y) * t;

    this.trauma = Math.max(0, this.trauma - TRAUMA_DECAY * dt);
    const k = Math.exp(-KICK_DECAY * dt);
    this.kickX *= k;
    this.kickY *= k;

    const s = this.trauma * this.trauma * MAX_SHAKE;
    const shakeX = s * Math.sin(this.time * 71.3) * Math.cos(this.time * 13.7);
    const shakeY = s * Math.cos(this.time * 83.1) * Math.sin(this.time * 17.9);

    let left = this.x - VIEW_W / 2 + this.kickX + shakeX;
    let top = this.y - VIEW_H / 2 + this.kickY + shakeY;
    left = clamp(left, -VIEW_W / 4, Math.max(-VIEW_W / 4, this.worldW - VIEW_W * 0.75));
    top = clamp(top, -VIEW_H / 4, Math.max(-VIEW_H / 4, this.worldH - VIEW_H * 0.75));
    this.left = Math.round(left);
    this.top = Math.round(top);
  }

  toWorld(viewX: number, viewY: number): { x: number; y: number } {
    return { x: viewX + this.left, y: viewY + this.top };
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}
