import type { WeaponDef } from '../../data/weapons';

/** How long a click is remembered while the gun is cycling (semi-auto responsiveness). */
const SHOT_BUFFER = 0.12;
/** Bloom only starts recovering once the trigger has been off this long (plus one shot interval). */
const BLOOM_GRACE = 0.08;
/** Seconds to clear a jam. */
const UNJAM_TIME = 0.65;

export type FireResult = 'fired' | 'empty' | 'jammed' | 'none';

/** Where reload rounds come from: the player's pockets, or an endless supply for AI. */
export interface AmmoSource {
  count(): number;
  /** Remove up to n rounds; returns how many were actually taken. */
  take(n: number): number;
}

export class CountedAmmo implements AmmoSource {
  constructor(public n: number) {}
  count() {
    return this.n;
  }
  take(n: number) {
    const t = Math.min(n, this.n);
    this.n -= t;
    return t;
  }
}

/**
 * Runtime state of one carried weapon: magazine, cadence, reload, jams and bloom.
 * Pure logic with no rendering, so it is unit-testable.
 */
export class WeaponState {
  ammo: number;
  /** Item id of the rounds in the magazine (decides damage/penetration). */
  ammoId: string | null = null;
  bloom = 0;
  jammed = false;
  private source: AmmoSource;
  private cooldown = 0;
  private reloadTimer = 0;
  private roundTimer = 0;
  private unjamTimer = 0;
  private drawTimer = 0;
  private buffered = 0;
  private sinceShot = Infinity;
  /** Set on the frame a round was chambered by a per-round reload (for the click sound). */
  roundLoaded = false;
  /** Set on the frame a full reload completed. */
  reloaded = false;
  /** The current reload started with a round still chambered (no need to rack). */
  tactical = false;

  constructor(readonly def: WeaponDef, source: AmmoSource | number, loaded = def.magSize) {
    this.source = typeof source === 'number' ? new CountedAmmo(source) : source;
    this.ammo = Math.max(0, Math.min(def.magSize, loaded));
  }

  get reserve(): number {
    return this.source.count();
  }

  get reloading(): boolean {
    return this.reloadTimer > 0 || this.roundTimer > 0;
  }

  get unjamming(): boolean {
    return this.unjamTimer > 0;
  }

  /** 0..1 progress of the current reload (0 when not reloading). */
  get reloadProgress(): number {
    if (this.def.reloadPerRound) return this.roundTimer > 0 ? this.ammo / this.def.magSize : 0;
    return this.reloadTimer > 0 ? 1 - this.reloadTimer / this.def.reloadTime : 0;
  }

  get drawing(): boolean {
    return this.drawTimer > 0;
  }

  /** 0..1 progress of bringing the gun up (1 when not drawing). */
  get drawProgress(): number {
    return this.drawTimer > 0 ? 1 - this.drawTimer / this.def.drawTime : 1;
  }

  /** 0..1 progress of clearing a jam (0 when not unjamming). */
  get unjamProgress(): number {
    return this.unjamTimer > 0 ? 1 - this.unjamTimer / UNJAM_TIME : 0;
  }

  /** Busy with hands: can't fire. */
  get busy(): boolean {
    return this.reloading || this.unjamming || this.drawing;
  }

  setSource(source: AmmoSource): void {
    this.source = source;
  }

  update(dt: number): void {
    this.roundLoaded = false;
    this.reloaded = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.drawTimer = Math.max(0, this.drawTimer - dt);
    this.buffered = Math.max(0, this.buffered - dt);
    this.sinceShot += dt;
    if (this.sinceShot > 1 / this.def.fireRate + BLOOM_GRACE) {
      this.bloom = Math.max(0, this.bloom - this.def.bloomRecovery * dt);
    }
    if (this.unjamTimer > 0) {
      this.unjamTimer -= dt;
      if (this.unjamTimer <= 0) {
        this.unjamTimer = 0;
        this.jammed = false;
      }
    }
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.reloadTimer = 0;
        this.ammo += this.source.take(this.def.magSize - this.ammo);
        this.reloaded = true;
      }
    }
    if (this.roundTimer > 0) {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundTimer = 0;
        if (this.source.take(1) === 1) {
          this.ammo++;
          this.roundLoaded = true;
        }
        if (this.ammo < this.def.magSize && this.source.count() > 0) this.roundTimer = this.def.reloadPerRound!;
        else this.reloaded = true;
      }
    }
  }

  /**
   * @param held trigger currently held
   * @param pressed trigger went down this frame
   * @param jamRoll 0..1 random number deciding jams (injected so tests are deterministic)
   */
  tryFire(held: boolean, pressed: boolean, jamRoll = 1): FireResult {
    if (pressed) this.buffered = SHOT_BUFFER;
    const wants = this.def.automatic ? held || this.buffered > 0 : this.buffered > 0;
    // Shell-by-shell reloads can be interrupted by pulling the trigger with rounds loaded.
    if (wants && this.roundTimer > 0 && this.ammo > 0 && pressed) this.roundTimer = 0;
    if (!wants || this.cooldown > 0 || this.drawTimer > 0 || this.reloading || this.unjamming) return 'none';
    this.buffered = 0;
    if (this.jammed) {
      this.cooldown = 0.25;
      return 'jammed';
    }
    if (this.ammo <= 0) {
      this.cooldown = 0.25;
      return 'empty';
    }
    this.ammo--;
    this.cooldown = 1 / this.def.fireRate;
    this.sinceShot = 0;
    this.bloom = Math.min(this.def.bloomMax, this.bloom + this.def.bloomPerShot);
    if (this.def.jamChance && jamRoll < this.def.jamChance && this.ammo > 0) this.jammed = true;
    return 'fired';
  }

  /** R pressed: clears a jam first, otherwise reloads. */
  startReload(): boolean {
    if (this.jammed) {
      if (this.unjamming) return false;
      this.unjamTimer = UNJAM_TIME;
      this.buffered = 0;
      return true;
    }
    if (this.reloading || this.ammo >= this.def.magSize || this.source.count() <= 0) return false;
    this.tactical = this.ammo > 0;
    if (this.def.reloadPerRound) this.roundTimer = this.def.reloadPerRound + 0.25; // shoulder the gun first
    else this.reloadTimer = this.def.reloadTime;
    this.buffered = 0;
    return true;
  }

  /** Stop a reload in progress (switching weapons, using a medkit). Rounds already loaded stay. */
  cancelReload(): void {
    this.reloadTimer = 0;
    this.roundTimer = 0;
    this.unjamTimer = 0;
  }

  /** Called when the weapon is brought out. Cancels any reload in progress. */
  draw(): void {
    this.cancelReload();
    this.drawTimer = this.def.drawTime;
    this.buffered = 0;
  }

  /** Current cone half-angle in degrees. moveFactor is 0 (still) .. 1 (full speed). */
  spread(moveFactor: number): number {
    return this.def.spread + this.def.moveSpread * moveFactor + this.bloom;
  }
}
