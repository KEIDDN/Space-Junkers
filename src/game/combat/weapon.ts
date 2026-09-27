import type { WeaponDef } from '../../data/weapons';

/** How long a click is remembered while the gun is cycling (semi-auto responsiveness). */
const SHOT_BUFFER = 0.12;
/** Bloom only starts recovering once the trigger has been off this long (plus one shot interval). */
const BLOOM_GRACE = 0.08;

export type FireResult = 'fired' | 'empty' | 'none';

/**
 * Runtime state of one carried weapon: magazine, reserve, cadence, reload and bloom.
 * Pure logic with no rendering, so it is unit-testable.
 */
export class WeaponState {
  ammo: number;
  reserve: number;
  bloom = 0;
  private cooldown = 0;
  private reloadTimer = 0;
  private drawTimer = 0;
  private buffered = 0;
  private sinceShot = Infinity;

  constructor(readonly def: WeaponDef, reserve: number) {
    this.ammo = def.magSize;
    this.reserve = reserve;
  }

  get reloading(): boolean {
    return this.reloadTimer > 0;
  }

  /** 0..1 progress of the current reload (0 when not reloading). */
  get reloadProgress(): number {
    return this.reloading ? 1 - this.reloadTimer / this.def.reloadTime : 0;
  }

  get drawing(): boolean {
    return this.drawTimer > 0;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.drawTimer = Math.max(0, this.drawTimer - dt);
    this.buffered = Math.max(0, this.buffered - dt);
    this.sinceShot += dt;
    if (this.sinceShot > 1 / this.def.fireRate + BLOOM_GRACE) {
      this.bloom = Math.max(0, this.bloom - this.def.bloomRecovery * dt);
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        const take = Math.min(this.def.magSize - this.ammo, this.reserve);
        this.ammo += take;
        this.reserve -= take;
      }
    }
  }

  /**
   * @param held trigger currently held
   * @param pressed trigger went down this frame
   */
  tryFire(held: boolean, pressed: boolean): FireResult {
    if (pressed) this.buffered = SHOT_BUFFER;
    const wants = this.def.automatic ? held || this.buffered > 0 : this.buffered > 0;
    if (!wants || this.cooldown > 0 || this.drawTimer > 0 || this.reloading) return 'none';
    this.buffered = 0;
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      return 'empty';
    }
    this.ammo--;
    this.cooldown = 1 / this.def.fireRate;
    this.sinceShot = 0;
    this.bloom = Math.min(this.def.bloomMax, this.bloom + this.def.bloomPerShot);
    return 'fired';
  }

  startReload(): boolean {
    if (this.reloading || this.ammo >= this.def.magSize || this.reserve <= 0) return false;
    this.reloadTimer = this.def.reloadTime;
    this.buffered = 0;
    return true;
  }

  /** Called when the weapon is brought out. Cancels any reload in progress. */
  draw(): void {
    this.reloadTimer = 0;
    this.drawTimer = this.def.drawTime;
    this.buffered = 0;
  }

  /** Current cone half-angle in degrees. moveFactor is 0 (still) .. 1 (full speed). */
  spread(moveFactor: number): number {
    return this.def.spread + this.def.moveSpread * moveFactor + this.bloom;
  }
}
