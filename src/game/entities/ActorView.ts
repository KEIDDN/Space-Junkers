import { Container, Graphics, Sprite } from 'pixi.js';
import { tex } from '../../engine/assets';
import { GUN_HEIGHT } from '../../engine/config';
import type { ReloadStyle, WeaponArchetype, WeaponDef } from '../../data/weapons';
import { DIR_DOWN, DIR_LEFT, DIR_RIGHT, DIR_UP, LayeredSprite, dirOf, type Dir } from './layers';

/** Distance from the hands to the grip, along the aim direction. */
const HOLD_DIST = 3;
/**
 * Pixels walked per frame of the walk and run cycles, so the feet plant instead of
 * sliding: eight frames make two steps.
 */
const STRIDE = 7;
const RUN_STRIDE = 10;
const RECOIL_RETURN = 22;
/** How fast poses blend (1/s). Heavier guns settle slower. */
const POSE_RATE = 16;
/** A turn right round passes through facing the camera for this long. */
const TURN_TIME = 0.06;
/** Death: seconds per frame of the collapse, and the frame the body hits the floor. */
const DIE_FRAME = 0.1;
const DIE_LAND = 4;
/**
 * Where the hands are in the two-handed carry, per facing (px from the feet): the gun
 * pivots here. Measured on the hold frames of the character sheets.
 */
const HANDS: Record<Dir, { x: number; y: number }> = {
  [DIR_UP]: { x: 2, y: -GUN_HEIGHT - 2 },
  [DIR_LEFT]: { x: -7, y: -GUN_HEIGHT },
  [DIR_DOWN]: { x: -1, y: -GUN_HEIGHT - 1 },
  [DIR_RIGHT]: { x: 7, y: -GUN_HEIGHT },
};

export type Gait = 'sneak' | 'walk' | 'run' | 'sprint';

export type { ReloadStyle };

/** What the hands are busy with, and how far along (0..1). */
export type HandAction =
  | { kind: 'reload'; t: number; style: ReloadStyle; tactical: boolean }
  | { kind: 'unjam'; t: number }
  | { kind: 'draw'; t: number }
  | { kind: 'heal'; t: number; quick: boolean }
  | { kind: 'throw'; t: number }
  | { kind: 'search'; t: number };

/** Everything the body needs to know to move like a person. */
export interface Pose {
  /** 0 = gun lowered, 0.35 = relaxed low ready, 1 = on target. */
  raise: number;
  gait: Gait;
  /** Velocity (px/s) for the lean into movement. */
  vx: number;
  vy: number;
  action: HandAction | null;
}

/**
 * Moments in an animation that the world should hear or see. Entities turn these into
 * sounds and effects, so the sound of a magazine hitting the floor happens when the
 * magazine leaves the gun, not on a timer.
 */
export type AnimEvent = 'step' | 'thud' | 'magout' | 'magin' | 'rack' | 'breakopen' | 'breakclose';

/** Muzzle climb per shot (radians) by weapon type. */
const CLIMB: Record<WeaponArchetype, number> = { pistol: 0.16, smg: 0.06, shotgun: 0.3, rifle: 0.08, marksman: 0.26 };

const DEFAULT_POSE: Pose = { raise: 1, gait: 'walk', vx: 0, vy: 0, action: null };

/** Critically damped approach, frame-rate independent. */
function approach(v: number, target: number, rate: number, dt: number): number {
  return target + (v - target) * Math.exp(-rate * dt);
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
/** 0 → 1 → 0 bump over [a, b]. */
function bump(t: number, a: number, b: number): number {
  if (t <= a || t >= b) return 0;
  return Math.sin(((t - a) / (b - a)) * Math.PI);
}

/**
 * Visual representation of a character: shadow, animated body, and a weapon held in
 * the hands. Source art faces left; the body flips to face the aim.
 *
 * The weapon is animated procedurally in the actor's facing space: 0 rad points where
 * the actor faces, positive angles point down. Poses (low ready, sprint port-arms,
 * reload cant, recoil climb) are offsets on top of the true aim, so they never make the
 * aim itself lag. Knows nothing about gameplay; entities drive it every frame.
 */
export class ActorView {
  readonly container = new Container();
  private shadow: Graphics;
  /** The body: a stack of aligned character sheets (body, armour, pack, hair, helmet). */
  private body: LayeredSprite;
  private gun = new Sprite();
  /** Whatever the free hand carries: a fresh magazine, shells, a round. */
  private hand = new Graphics();
  private weapon: WeaponDef | null = null;
  /** Carry a weapon pose even with no gun drawn (the ship: hands free, so no). */
  private armed = false;
  private facingRight = false;
  private dir: Dir = DIR_DOWN;
  /** The row actually drawn (differs from `dir` mid-turn). */
  private shown: Dir = DIR_DOWN;
  private aim = 0;
  private recoil = 0;
  private climb = 0;
  private flashTime = 0;
  private frame = 0;
  private stride = 0;
  private idleTime = Math.random() * 3;
  private deathTime = -1;
  private landed = false;
  private flinchT = 0;
  private flinchX = 0;
  private turnT = 0;
  private dropped: { vx: number; vy: number; spin: number; t: number } | null = null;

  // Pose state (springs)
  private offset = 0;
  private dist = HOLD_DIST;
  private roll = 1;
  private lift = 0;
  private pulseT = 0;
  private pulseKind: 'round' | 'rack' | 'jolt' = 'jolt';
  private lastAction: HandAction['kind'] | null = null;
  private lastT = 0;
  /** The gun's drawn angle and pivot (world space, relative to the actor) for the muzzle. */
  private drawnAngle = 0;
  private drawnX = 0;
  private drawnY = 0;

  /** Set true on frames where a foot lands (for footstep sounds). */
  stepped = false;
  /** Set true on the frame a falling body hits the floor (for the thud). */
  thudded = false;
  /** Animation moments this frame (cleared every update). */
  readonly events: AnimEvent[] = [];

  /** @param look character sheets to stack, bottom to top (see `look.ts`) */
  constructor(look: string[]) {
    this.shadow = new Graphics().ellipse(0, 0, 10, 3.5).fill({ color: 0x000000, alpha: 0.38 });
    this.body = new LayeredSprite(look);
    this.gun.visible = false;
    this.container.addChild(this.shadow, this.body.container, this.gun, this.hand);
  }

  /** Change what the character wears (equipment shows on the body). */
  setLook(look: string[]): void {
    this.body.setLayers(look);
  }

  setWeapon(def: WeaponDef | null): void {
    this.weapon = def;
    this.armed = !!def;
    this.gun.visible = !!def;
    this.recoil = 0;
    this.climb = 0;
    if (!def) return;
    this.gun.texture = tex(def.sprite);
    this.gun.anchor.set(def.grip.x / this.gun.texture.width, def.grip.y / this.gun.texture.height);
    // A freshly drawn gun starts low and comes up.
    this.offset = 1.1;
    this.dist = HOLD_DIST - 2;
  }

  /** Kick the gun back along the barrel and let the muzzle climb. */
  kick(px: number): void {
    this.recoil = Math.min(this.recoil + px, 10);
    if (this.weapon) this.climb = Math.min(this.climb + CLIMB[this.weapon.archetype] * (0.8 + Math.random() * 0.4), 0.7);
  }

  /** A short hand movement: a round thumbed in, a bolt or pump worked. */
  pulse(kind: 'round' | 'rack' | 'jolt'): void {
    this.pulseKind = kind;
    this.pulseT = kind === 'rack' ? 0.22 : 0.12;
  }

  hitFlash(seconds = 0.07): void {
    this.flashTime = seconds;
  }

  /**
   * Die: the body folds and goes down (the sheets' own collapse), and the gun is let go,
   * skidding away from the shot.
   */
  playDeath(dirX = 0, dirY = 0): void {
    this.deathTime = 0;
    this.hand.clear();
    this.body.container.rotation = 0;
    this.body.container.x = 0;
    this.body.show('die', DIR_DOWN, 0);
    if (this.weapon) {
      const sp = 60 + Math.random() * 50;
      const kx = dirX || (Math.random() - 0.5);
      this.dropped = { vx: kx * sp + (Math.random() - 0.5) * 30, vy: dirY * sp * 0.6 + (Math.random() - 0.5) * 20, spin: (Math.random() - 0.5) * 18, t: 0 };
    }
  }

  /** Recoil from a hit: a quick shove and tilt away from the bullet. */
  flinch(dirX: number): void {
    this.flinchT = 0.13;
    this.flinchX = dirX;
  }

  /**
   * @param moved distance moved this frame, px
   * @param backwards moving opposite to where the actor is aiming
   * @param pose how the body is carried; a number is shorthand for just the gun raise
   */
  update(dt: number, x: number, y: number, aim: number, moved: number, backwards: boolean, pose: Pose | number = DEFAULT_POSE): void {
    const p: Pose = typeof pose === 'number' ? { ...DEFAULT_POSE, raise: pose } : pose;
    this.container.position.set(Math.round(x), Math.round(y));
    this.container.zIndex = y;
    this.stepped = false;
    this.thudded = false;
    this.events.length = 0;

    if (this.deathTime >= 0) {
      this.deathTime += dt;
      this.updateDeath(dt);
      return;
    }

    this.aim = aim;
    const cos = Math.cos(aim);
    // Hysteresis avoids flip-flopping when aiming straight up/down.
    if (cos > 0.08) this.facingRight = true;
    else if (cos < -0.08) this.facingRight = false;
    const dir = dirOf(aim, this.dir);
    if (dir !== this.dir) {
      // Turning right round: a beat facing the camera (or the side) on the way.
      if ((dir ^ this.dir) === 2) this.turnT = TURN_TIME;
      this.dir = dir;
    }
    this.turnT = Math.max(0, this.turnT - dt);
    this.shown = this.turnT > 0 ? (this.dir === DIR_LEFT || this.dir === DIR_RIGHT ? DIR_DOWN : this.facingRight ? DIR_RIGHT : DIR_LEFT) : this.dir;

    // --- Body: which animation, and the frame from distance walked so feet don't slide.
    const act = p.action;
    const kneel = act?.kind === 'search' || (act?.kind === 'heal' && !act.quick);
    const armed = this.armed;
    const sprint = p.gait === 'sprint' && armed && this.body.has('holdrun');
    let name: string;
    let frame = 0;
    if (kneel && this.body.has('kneel')) {
      name = 'kneel';
      this.stride = 0;
    } else if (moved > 0.01) {
      name = sprint ? 'holdrun' : armed ? 'hold' : 'walk';
      const stride = sprint ? RUN_STRIDE : STRIDE;
      this.stride += moved * (backwards ? -1 : 1);
      const k = (((Math.floor(this.stride / stride) % 8) + 8) % 8);
      // The walk sheets start with a standing frame; the run is all stride.
      frame = sprint ? k : k + 1;
      if (frame !== this.frame && (k === 0 || k === 4)) {
        this.stepped = true;
        this.events.push('step');
      }
    } else {
      name = armed ? 'holdidle' : 'idle';
      // Breathing: shoulders settle and lift, slower when relaxed.
      frame = Math.sin(this.idleTime * (p.raise > 0.9 ? 2.4 : 1.8)) > 0.2 ? 1 : 0;
      this.stride = 0;
    }
    if (!this.body.has(name)) name = armed ? 'hold' : 'walk';
    this.frame = frame;
    this.idleTime += dt;
    const flashing = this.flashTime > 0;
    this.flashTime -= dt;
    this.body.show(name, this.shown, frame, flashing);

    // Flinch: brief shove and tilt, decaying.
    let bx = 0;
    let rot = 0;
    if (this.flinchT > 0) {
      this.flinchT = Math.max(0, this.flinchT - dt);
      const k = this.flinchT / 0.13;
      bx = this.flinchX * 2 * k;
      rot = this.flinchX * 0.1 * k;
    }
    // Heavy weapons shove the shoulder back.
    const shove = this.weapon && (this.weapon.archetype === 'shotgun' || this.weapon.archetype === 'marksman') ? this.recoil * 0.25 : 0;
    bx -= Math.cos(this.drawnAngle) * shove;
    this.body.container.x = Math.round(bx);
    this.body.container.rotation = rot;
    this.shadow.scale.set(kneel ? 1.15 : 1, 1);

    this.updateGun(dt, p, moved);
  }

  /** The collapse, the thud, the gun skidding off, and the body settling into shadow. */
  private updateDeath(dt: number): void {
    const t = this.deathTime;
    const f = Math.min(5, Math.floor(t / DIE_FRAME));
    this.body.show('die', DIR_DOWN, f);
    if (f >= DIE_LAND && !this.landed) {
      this.landed = true;
      this.thudded = true;
      this.events.push('thud');
    }
    const dark = Math.min(1, Math.max(0, (t - 0.8) / 1.5));
    const c = Math.round(255 - dark * 80);
    const tint = (c << 16) | (Math.round(c * 0.95) << 8) | Math.round(c * 0.92);
    for (const s of this.body.container.children) (s as Sprite).tint = tint;

    const d = this.dropped;
    if (d && this.weapon) {
      d.t += dt;
      const k = Math.exp(-5 * dt);
      d.vx *= k;
      d.vy *= k;
      this.gun.visible = true;
      this.gun.x += d.vx * dt;
      // Falls from hand height to the floor in the first moments.
      const fallY = Math.min(1, d.t / 0.25);
      this.gun.y = this.gun.y + d.vy * dt + (fallY < 1 ? (GUN_HEIGHT - 2) * dt / 0.25 : 0);
      this.gun.rotation += d.spin * dt;
      d.spin *= Math.exp(-6 * dt);
      if (d.t > 1.5) this.dropped = null;
    }
  }

  /** World position of the muzzle tip (visual, i.e. at gun height). */
  muzzleWorld(x: number, y: number): { x: number; y: number } {
    const def = this.weapon;
    const cos = Math.cos(this.drawnAngle);
    const sin = Math.sin(this.drawnAngle);
    const px = x + this.drawnX;
    const py = y + this.drawnY;
    if (!def) return { x: x + Math.cos(this.aim) * HOLD_DIST, y: y - GUN_HEIGHT + Math.sin(this.aim) * HOLD_DIST };
    const flip = this.facingRight ? 1 : -1;
    const ox = def.muzzle.x - def.grip.x;
    const oy = (def.muzzle.y - def.grip.y) * flip;
    return { x: px + ox * cos - oy * sin, y: py + ox * sin + oy * cos };
  }

  /** The gun's drawn angle (world), for effects that stick to the muzzle. */
  get muzzleAngle(): number {
    return this.drawnAngle;
  }

  /** Where a spent casing leaves the gun (ejection port, a little behind the grip). */
  ejectWorld(x: number, y: number): { x: number; y: number } {
    return { x: x + this.drawnX + Math.cos(this.drawnAngle) * 3, y: y + this.drawnY + Math.sin(this.drawnAngle) * 3 - 1 };
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  // ---------------------------------------------------------------------------
  // Weapon handling

  private updateGun(dt: number, p: Pose, moved: number): void {
    if (!this.weapon) return;
    const def = this.weapon;
    this.recoil *= Math.exp(-RECOIL_RETURN * dt);
    this.climb *= Math.exp(-(def.archetype === 'smg' || def.archetype === 'rifle' ? 14 : 9) * dt);

    // Aim in facing space: 0 = forward, + = down.
    const aimLocal = this.facingRight ? this.aim : Math.PI - this.aim;
    const a = normalize(aimLocal);

    // Target pose offsets (relative to the aim) and extras.
    let offset = (1 - p.raise) * 0.9;
    let dist = HOLD_DIST;
    let roll = 1;
    let lift = 0;
    const act = p.action;
    this.emitActionEvents(act);
    if (p.gait === 'sprint' && !act) {
      // Port arms: muzzle up and across the chest.
      offset = -1.05 - a;
      dist = 1;
    } else if (act) {
      const t = act.t;
      switch (act.kind) {
        case 'reload': {
          const s = act.style;
          if (s === 'mag') {
            // Cant the gun to reach the mag well, rip the mag, seat a new one, rack if empty.
            offset = 0.42 - bump(t, 0.52, 0.62) * 0.18 + (t > 0.88 ? -0.42 * easeOut((t - 0.88) / 0.12) : 0);
            roll = 0.72 + (t > 0.88 ? 0.28 * easeOut((t - 0.88) / 0.12) : 0);
            lift = -bump(t, 0.52, 0.62) * 3 + (t > 0.15 && t < 0.5 ? Math.round(Math.sin(t * 40)) * 0.5 : 0);
            dist = HOLD_DIST - 1 - (!act.tactical ? bump(t, 0.72, 0.86) * 3 : 0);
          } else if (s === 'break') {
            // Snap the barrels down, shake the shells out, thumb two in, close it.
            const open = t < 0.12 ? easeOut(t / 0.12) : t < 0.78 ? 1 : 1 - easeOut((t - 0.78) / 0.22);
            offset = 0.85 * open - bump(t, 0.12, 0.2) * 0.25;
            lift = bump(t, 0.4, 0.48) + bump(t, 0.6, 0.68);
            dist = HOLD_DIST - 1;
          } else {
            // Tube or clip: loading port up, rounds thumbed in (pulses), then rack.
            offset = -0.35;
            roll = 0.78;
            dist = HOLD_DIST - 1;
          }
          break;
        }
        case 'unjam':
          offset = 0.35;
          roll = 0.7;
          dist = HOLD_DIST - bump(act.t, 0.2, 0.45) * 3 - bump(act.t, 0.55, 0.8) * 3;
          break;
        case 'draw':
          offset = 1.1 * (1 - easeOut(clamp01(act.t)));
          dist = HOLD_DIST - 2 * (1 - clamp01(act.t));
          break;
        case 'heal':
          offset = act.quick ? 0.7 : 1.0;
          dist = 2;
          lift = act.quick ? bump(act.t, 0.3, 0.45) * 2 : Math.round(Math.sin(act.t * 30) * 0.6);
          break;
        case 'throw':
          // Gun swings low and out of the way while the arm winds up, then comes back.
          offset = act.t < 0.6 ? 0.95 : 0.95 * (1 - easeOut((act.t - 0.6) / 0.4));
          dist = act.t < 0.6 ? 1 : HOLD_DIST;
          break;
        case 'search':
          offset = 1.15;
          dist = 1;
          lift = Math.round(Math.sin(act.t * 18) * 0.7);
          break;
      }
    }

    // Short pulses on top of any pose: a thumbed round, a worked bolt or pump.
    if (this.pulseT > 0) {
      this.pulseT = Math.max(0, this.pulseT - dt);
      if (this.pulseKind === 'rack') dist -= Math.sin((1 - this.pulseT / 0.22) * Math.PI) * 3;
      else if (this.pulseKind === 'round') lift += Math.sin((1 - this.pulseT / 0.12) * Math.PI) * 1.5;
      else lift -= Math.sin((1 - this.pulseT / 0.12) * Math.PI) * 1.5;
    }

    // Blend. Heavy guns carry more inertia.
    const heavy = def.archetype === 'rifle' || def.archetype === 'marksman' || def.archetype === 'shotgun' ? 0.7 : 1;
    const rate = POSE_RATE * heavy;
    this.offset = approach(this.offset, offset, rate, dt);
    this.dist = approach(this.dist, dist, rate * 1.2, dt);
    this.roll = approach(this.roll, roll, rate, dt);
    this.lift = approach(this.lift, lift, rate * 1.5, dt);

    // Idle sway and walk bob: the gun is held by a person, not bolted to one.
    const sway = Math.sin(this.idleTime * 1.3) * 0.015 * (p.raise > 0.9 ? 1 : 1.6);
    const bob = moved > 0.01 ? Math.sin((this.stride / STRIDE) * Math.PI) * 0.035 : 0;
    const local = a + this.offset - this.climb + sway + bob;
    const world = this.facingRight ? local : Math.PI - local;

    const cos = Math.cos(world);
    const sin = Math.sin(world);
    const d = this.dist - this.recoil;
    // The hands ride with the body: breathing, footfalls, kneeling.
    const hands = HANDS[this.shown];
    const drop = this.body.torsoDrop('hold');
    const gx = hands.x + cos * d + this.body.container.x;
    const gy = hands.y + sin * d + this.lift + drop;
    this.gun.position.set(Math.round(gx), Math.round(gy));
    this.gun.rotation = world;
    this.gun.scale.set(1, (this.facingRight ? 1 : -1) * Math.max(0.5, this.roll));
    this.drawnAngle = world;
    this.drawnX = gx;
    this.drawnY = gy;
    this.drawHand(act, gx, gy, world);
    // Facing away: the gun is in front of them, behind the body from here.
    const behind = this.shown === DIR_UP;
    const idx = this.container.getChildIndex(this.gun);
    const want = behind ? 1 : 2;
    if (idx !== want) this.container.setChildIndex(this.gun, want);
  }

  /**
   * The free hand's cargo, drawn as a couple of pixels travelling from the belt to the
   * gun: a fresh magazine, two shells for a break-action, a round for a tube or clip.
   */
  private drawHand(act: HandAction | null, gx: number, gy: number, angle: number): void {
    const h = this.hand;
    h.clear();
    const def = this.weapon;
    if (!def) return;
    const face = this.facingRight ? 1 : -1;
    // Belt pouch (start) and the gun's feed point (end): a little ahead of the grip, below it.
    const belt = { x: this.body.container.x - 3 * face, y: -GUN_HEIGHT + 4 + this.body.torsoDrop('hold') };
    // Pistols take the magazine through the grip; long guns forward of it.
    const ahead = def.archetype === 'pistol' ? 0 : def.archetype === 'marksman' ? 8 : def.archetype === 'shotgun' ? 5 : 6;
    const feed = { x: gx + Math.cos(angle) * ahead, y: gy + Math.sin(angle) * ahead + 2 };
    let k = -1;
    let kind: 'mag' | 'shell' | 'round' = 'mag';
    if (act?.kind === 'reload' && act.style === 'mag' && act.t > 0.2 && act.t < 0.56) {
      k = (act.t - 0.2) / 0.36;
    } else if (act?.kind === 'reload' && act.style === 'break' && act.t > 0.3 && act.t < 0.66) {
      k = (act.t - 0.3) / 0.36;
      kind = 'shell';
    } else if (this.pulseT > 0 && this.pulseKind === 'round') {
      k = 1 - this.pulseT / 0.12;
      kind = 'round';
    }
    if (k < 0) return;
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const x = Math.round(belt.x + (feed.x - belt.x) * e);
    const y = Math.round(belt.y + (feed.y - belt.y) * e - Math.sin(k * Math.PI) * 2);
    if (kind === 'mag') {
      const long = def.archetype === 'rifle' || def.archetype === 'marksman' || def.archetype === 'smg' ? 4 : 3;
      h.rect(x - 1, y - 1, 4, long + 2).fill({ color: 0x0c0b0a, alpha: 0.55 });
      h.rect(x, y, 2, long).fill({ color: 0x5c5750 });
      h.rect(x, y, 2, 1).fill({ color: 0xa8a092 });
    } else {
      const color = def.casingColor;
      h.rect(x, y, 1, 2).fill({ color });
      if (kind === 'shell') h.rect(x + 1, y + 1, 1, 2).fill({ color });
    }
  }

  /** Fire animation events when an action crosses its key moments. */
  private emitActionEvents(act: HandAction | null): void {
    const kind = act?.kind ?? null;
    const t = act?.t ?? 0;
    const prev = kind === this.lastAction ? this.lastT : -1;
    this.lastAction = kind;
    this.lastT = t;
    if (!act || act.kind !== 'reload') return;
    const crossed = (m: number) => prev < m && t >= m;
    if (act.style === 'mag') {
      if (crossed(0.14)) this.events.push('magout');
      if (crossed(0.56)) this.events.push('magin');
      if (!act.tactical && crossed(0.78)) this.events.push('rack');
    } else if (act.style === 'break') {
      if (crossed(0.1)) this.events.push('breakopen');
      if (crossed(0.8)) this.events.push('breakclose');
    }
  }
}

function normalize(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
