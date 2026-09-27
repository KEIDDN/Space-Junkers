import { anim } from '../../engine/assets';
import type { Input } from '../../engine/input';
import { GUN_HEIGHT } from '../../engine/config';
import { WEAPONS } from '../../data/weapons';
import { discharge } from '../combat/fire';
import type { Hittable } from '../combat/projectiles';
import { WeaponState } from '../combat/weapon';
import type { GameContext } from '../context';
import { moveCircle } from '../world/collision';
import { ActorView } from './ActorView';

export type Operator = 'm' | 'f';

const MAX_SPEED = 112; // px/s
const ACCEL = 1500;
const DECEL = 1900;
const BODY_RADIUS = 6;
const RESERVE_MAGS = 5;

export class Player implements Hittable {
  x: number;
  y: number;
  vx = 0;
  vy = 0;
  readonly hitRadius = 8;
  readonly faction = 'player' as const;
  alive = true;
  hp = 100;
  readonly maxHp = 100;
  aim = 0;
  readonly weapons: WeaponState[];
  current = 0;
  readonly view: ActorView;
  /** Seconds since last damage (drives UI feedback). */
  lastHitAgo = 99;
  /** Seconds since the player last fired. Gunfire reveals you. */
  lastShotAgo = 99;
  flashlight = true;
  /** 0..1 how easy the player is to spot. Set by the game from lighting each frame. */
  conspicuity = 1;

  constructor(private ctx: GameContext, x: number, y: number, operator: Operator, loadout: string[]) {
    this.x = x;
    this.y = y;
    this.view = new ActorView({ walk: anim(`op_${operator}_walk`), death: anim(`op_${operator}_death`) });
    this.weapons = loadout.map((id) => new WeaponState(WEAPONS[id], WEAPONS[id].magSize * RESERVE_MAGS));
    this.view.setWeapon(this.weapon.def);
    this.weapon.draw();
  }

  get weapon(): WeaponState {
    return this.weapons[this.current];
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt: number, input: Input, aimX: number, aimY: number): void {
    this.lastHitAgo += dt;
    this.lastShotAgo += dt;
    if (!this.alive) {
      this.view.update(dt, this.x, this.y, this.aim, 0, false);
      return;
    }

    // --- Movement
    let ix = 0;
    let iy = 0;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iy += 1;
    const len = Math.hypot(ix, iy);
    const max = MAX_SPEED * this.weapon.def.moveSpeedMul;
    const tx = len ? (ix / len) * max : 0;
    const ty = len ? (iy / len) * max : 0;
    const rate = len ? ACCEL : DECEL;
    this.vx = approach(this.vx, tx, rate * dt);
    this.vy = approach(this.vy, ty, rate * dt);
    const ox = this.x;
    const oy = this.y;
    moveCircle(this.ctx.map, this, BODY_RADIUS, this.vx * dt, this.vy * dt);
    // Velocity blocked by walls is dropped, so releasing a key never "unsticks" late.
    this.vx = (this.x - ox) / dt;
    this.vy = (this.y - oy) / dt;
    const moved = Math.hypot(this.x - ox, this.y - oy);

    // --- Aim from the chest (gun height), so the shot passes through the cursor.
    this.aim = Math.atan2(aimY - (this.y - GUN_HEIGHT), aimX - this.x);

    // --- Weapon switching
    const wheel = input.consumeWheel();
    let next = this.current;
    for (let i = 0; i < this.weapons.length; i++) if (input.wasPressed(`Digit${i + 1}`)) next = i;
    if (wheel) next = (this.current + wheel + this.weapons.length) % this.weapons.length;
    if (input.wasPressed('KeyQ')) next = (this.current + 1) % this.weapons.length;
    if (next !== this.current) this.switchTo(next);
    if (input.wasPressed('KeyF')) {
      this.flashlight = !this.flashlight;
      this.ctx.audio.sfx('flashlight', this.x, this.y);
    }

    // --- Firing / reloading
    const w = this.weapon;
    w.update(dt);
    if (input.wasPressed('KeyR') && w.startReload()) this.ctx.audio.reload(w.def.reloadTime, this.x, this.y);

    const moveFactor = Math.min(1, this.speed / MAX_SPEED);
    const result = w.tryFire(input.mouseDown, input.wasClicked());
    if (result === 'fired') {
      discharge(this.ctx, this.view, w, this.x, this.y, this.aim, 'player', moveFactor);
      this.lastShotAgo = 0;
      const def = w.def;
      this.ctx.camera.kick(-Math.cos(this.aim) * def.cameraKick, -Math.sin(this.aim) * def.cameraKick);
      this.ctx.camera.shake(def.shake);
      if (w.ammo === 0 && w.startReload()) this.ctx.audio.reload(def.reloadTime, this.x, this.y);
    } else if (result === 'empty') {
      this.ctx.audio.sfx('dryfire', this.x, this.y);
      if (w.startReload()) this.ctx.audio.reload(w.def.reloadTime, this.x, this.y);
    }

    // --- Visuals
    const backwards = moved > 0 && (this.vx * Math.cos(this.aim) < -5);
    const raise = w.reloading || w.drawing ? 0 : 1;
    this.view.update(dt, this.x, this.y, this.aim, moved, backwards, raise);
    if (this.view.stepped) this.ctx.audio.sfx('step', this.x, this.y);
  }

  takeDamage(amount: number, dirX: number, dirY: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.lastHitAgo = 0;
    this.vx += dirX * 60;
    this.vy += dirY * 60;
    this.ctx.camera.shake(0.35);
    this.ctx.audio.sfx('hurt', this.x, this.y);
    if (this.hp <= 0) {
      this.alive = false;
      this.view.playDeath();
      this.ctx.hitstop(0.12);
    }
  }

  private switchTo(i: number): void {
    this.current = i;
    this.weapon.draw();
    this.view.setWeapon(this.weapon.def);
    this.ctx.audio.sfx('switch', this.x, this.y);
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}
