import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { tex } from '../../engine/assets';
import { GUN_HEIGHT } from '../../engine/config';
import type { WeaponDef } from '../../data/weapons';

/** Distance from the chest pivot to the grip, along the aim direction. */
const HOLD_DIST = 4;
/** Pixels walked per animation frame. */
const STRIDE = 7;
const RECOIL_RETURN = 22;

export interface ActorFrames {
  walk: Texture[];
  /** Optional white silhouettes matching `walk`, for hit flashes. */
  flash?: Texture[];
  death: Texture[];
}

/**
 * Visual representation of a character: shadow, animated body, and a weapon that
 * rotates toward the aim point. Source art faces left; the body flips to face the aim.
 * Knows nothing about gameplay. Entities drive it every frame.
 */
export class ActorView {
  readonly container = new Container();
  private body: Sprite;
  private gun = new Sprite();
  private weapon: WeaponDef | null = null;
  private facingRight = false;
  private aim = 0;
  private recoil = 0;
  private flashTime = 0;
  private frame = 0;
  private stride = 0;
  private idleTime = Math.random() * 3;
  private deathTime = -1;
  /** Set true on frames where a foot lands (for footstep sounds). */
  stepped = false;

  constructor(private frames: ActorFrames) {
    const shadow = new Graphics().ellipse(0, 0, 9, 3).fill({ color: 0x000000, alpha: 0.35 });
    this.body = new Sprite(frames.walk[0]);
    this.body.anchor.set(0.5, 1);
    this.body.y = 1;
    this.gun.visible = false;
    this.container.addChild(shadow, this.body, this.gun);
  }

  setWeapon(def: WeaponDef | null): void {
    this.weapon = def;
    this.gun.visible = !!def;
    if (!def) return;
    this.gun.texture = tex(def.sprite);
    this.gun.anchor.set(def.grip.x / this.gun.texture.width, def.grip.y / this.gun.texture.height);
  }

  /** Kick the gun back along the barrel. */
  kick(px: number): void {
    this.recoil = Math.min(this.recoil + px, 10);
  }

  hitFlash(seconds = 0.07): void {
    this.flashTime = seconds;
  }

  playDeath(): void {
    this.deathTime = 0;
    this.gun.visible = false;
    this.body.texture = this.frames.death[0];
  }

  /**
   * @param moved distance moved this frame, px
   * @param backwards moving opposite to where the actor is aiming
   * @param raise 0..1 how raised the gun is (0 = lowered, while drawing or reloading)
   */
  update(dt: number, x: number, y: number, aim: number, moved: number, backwards: boolean, raise = 1): void {
    this.container.position.set(Math.round(x), Math.round(y));
    this.container.zIndex = y;
    this.stepped = false;

    if (this.deathTime >= 0) {
      this.deathTime += dt;
      const f = Math.min(this.frames.death.length - 1, Math.floor(this.deathTime / 0.09));
      this.body.texture = this.frames.death[f];
      return;
    }

    this.aim = aim;
    const cos = Math.cos(aim);
    // Hysteresis avoids flip-flopping when aiming straight up/down.
    if (cos > 0.08) this.facingRight = true;
    else if (cos < -0.08) this.facingRight = false;
    this.body.scale.x = this.facingRight ? -1 : 1;

    // Walk cycle driven by distance, so feet don't slide.
    if (moved > 0.01) {
      this.stride += moved * (backwards ? -1 : 1);
      const n = this.frames.walk.length;
      const f = (((Math.floor(this.stride / STRIDE) % n) + n) % n);
      if (f !== this.frame && (f === 1 || f === 4)) this.stepped = true;
      this.frame = f;
      this.body.y = 1;
    } else {
      this.frame = 0;
      this.idleTime += dt;
      this.body.y = Math.sin(this.idleTime * 3) > 0.6 ? 0 : 1; // breathing
    }

    const flashing = this.flashTime > 0 && this.frames.flash;
    this.flashTime -= dt;
    this.body.texture = flashing ? this.frames.flash![this.frame] : this.frames.walk[this.frame];

    this.updateGun(dt, raise);
  }

  /** World position of the muzzle tip (visual, i.e. at gun height). */
  muzzleWorld(x: number, y: number): { x: number; y: number } {
    const def = this.weapon;
    const cos = Math.cos(this.aim);
    const sin = Math.sin(this.aim);
    const px = x + cos * HOLD_DIST;
    const py = y - GUN_HEIGHT + sin * HOLD_DIST;
    if (!def) return { x: px, y: py };
    const flip = this.facingRight ? 1 : -1;
    const ox = def.muzzle.x - def.grip.x;
    const oy = (def.muzzle.y - def.grip.y) * flip;
    return { x: px + ox * cos - oy * sin, y: py + ox * sin + oy * cos };
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  private updateGun(dt: number, raise: number): void {
    if (!this.weapon) return;
    this.recoil *= Math.exp(-RECOIL_RETURN * dt);
    // Lowered weapon while reloading/drawing reads clearly without extra UI.
    const lower = (1 - raise) * 0.9 * (this.facingRight ? 1 : -1);
    const a = this.aim + lower;
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    const dist = HOLD_DIST - this.recoil;
    this.gun.position.set(Math.round(cos * dist), Math.round(-GUN_HEIGHT + sin * dist));
    this.gun.rotation = a;
    this.gun.scale.y = this.facingRight ? 1 : -1;
    // Aiming up: gun goes behind the body.
    const behind = sin < -0.45;
    const idx = this.container.getChildIndex(this.gun);
    const want = behind ? 1 : 2;
    if (idx !== want) this.container.setChildIndex(this.gun, want);
  }
}
