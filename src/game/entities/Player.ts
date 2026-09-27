import { anim } from '../../engine/assets';
import type { Input } from '../../engine/input';
import { GUN_HEIGHT } from '../../engine/config';
import { ITEMS, itemDef, type ArmorDef, type MedDef } from '../../data/items';
import { WEAPONS, reloadStyleOf } from '../../data/weapons';
import { HEADSHOT_MUL, bleedChance, resolveHit } from '../../core/damage';
import { createItem, loadoutItems, speedMultiplier, type ItemInstance, type Loadout } from '../../core/inventory';
import type { Operator } from '../../core/profile';
import { raid, useRaid } from '../../state/raidStore';
import { discharge } from '../combat/fire';
import type { Hittable } from '../combat/projectiles';
import { WeaponState, type AmmoSource } from '../combat/weapon';
import type { GameContext } from '../context';
import { moveCircle } from '../world/collision';
import { ActorView, type HandAction, type Pose } from './ActorView';
import { playAnimEvents, weaponAction } from './handling';

export type { Operator };

const MAX_SPEED = 112; // px/s
const ACCEL = 1500;
const DECEL = 1900;
const BODY_RADIUS = 6;
const BLEED_DPS = 1.4;
const SPRINT_MUL = 1.45;
const SNEAK_MUL = 0.55;
const STAMINA_DRAIN = 19;
const STAMINA_REGEN = 15;
/** After sprinting, a beat before the gun is back up. */
const SPRINT_OUT = 0.16;
/** How far enemies hear your footsteps (px) by gait. */
const STEP_NOISE = { sneak: 0, walk: 64, sprint: 170 };
/** Movement multiplier while applying a medical item. */
const USING_SPEED = 0.45;
/** Grenade throw: wind-up until release, then recovery (seconds). */
const THROW_RELEASE = 0.24;
const THROW_TIME = 0.5;

interface ArmedSlot {
  uid: string;
  state: WeaponState;
}

interface UsingItem {
  uid: string;
  def: MedDef;
  t: number;
}

interface Throwing {
  uid: string;
  effect: 'frag' | 'smoke';
  t: number;
  released: boolean;
}

/** What the HUD needs to know about vitals, beyond hp. */
export interface PlayerStatus {
  bleeding: boolean;
  regen: boolean;
  boosted: boolean;
  /** 0..1 progress of an item being used, or -1. */
  using: number;
  usingName: string | null;
  stamina: number;
  gait: 'sneak' | 'walk' | 'sprint';
}

/**
 * The player's body in the raid. Weapons, ammo, armor and meds all come from the
 * raid loadout (useRaid), so what you see in the inventory is what you fight with.
 */
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
  /** [primary, secondary]. */
  readonly arms: (ArmedSlot | null)[] = [null, null];
  current = 0;
  readonly view: ActorView;
  /** Seconds since last damage (drives UI feedback). */
  lastHitAgo = 99;
  /** Seconds since the player last fired. Gunfire reveals you. */
  lastShotAgo = 99;
  flashlight = true;
  /** 0..1 how easy the player is to spot. Set by the game from lighting each frame. */
  conspicuity = 1;
  bleeding = false;
  private regenLeft = 0;
  private regenRate = 0;
  private boostLeft = 0;
  private boostMul = 1;
  private using: UsingItem | null = null;
  private speedMul = 1;
  private cycleTimer = -1;
  /** True while the player itself writes to the raid store (not an inventory edit). */
  private selfWrite = false;
  stamina = 100;
  private staminaIdle = 0;
  private exhausted = false;
  sneaking = false;
  sprinting = false;
  private sprintOut = 0;
  private breathTimer = 0;
  private aimX = 0;
  private aimY = 0;
  private throwCooldown = 0;
  private throwing: Throwing | null = null;
  /** Seconds spent searching something with E this stretch (set by the game), or -1. */
  searching = -1;
  /** Called with a short message for the HUD feed (armor broke, bleeding...). */
  onNotice: ((text: string, tone: 'bad' | 'ok' | 'warn') => void) | null = null;

  constructor(private ctx: GameContext, x: number, y: number, operator: Operator) {
    this.x = x;
    this.y = y;
    this.view = new ActorView({ walk: anim(`op_${operator}_walk`), death: anim(`op_${operator}_death`) });
    this.syncLoadout(useRaid.getState().loadout);
    const start = this.arms[0] ? 0 : 1;
    this.current = start;
    this.equipView();
    this.weapon?.draw();
  }

  get weapon(): WeaponState | null {
    return this.arms[this.current]?.state ?? null;
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  get status(): PlayerStatus {
    return {
      bleeding: this.bleeding,
      regen: this.regenLeft > 0,
      boosted: this.boostLeft > 0,
      using: this.using ? Math.min(1, this.using.t / this.using.def.useTime) : -1,
      usingName: this.using?.def.short ?? null,
      stamina: this.stamina,
      gait: this.sprinting ? 'sprint' : this.sneaking ? 'sneak' : 'walk',
    };
  }

  // ---------------------------------------------------------------------------
  // Loadout sync: the inventory UI can change what's equipped at any time.

  /** Rebuild weapon states when the equipped guns change; mirror external ammo edits. */
  syncLoadout(l: Loadout): void {
    const items = [l.primary, l.secondary];
    let changed = false;
    for (let i = 0; i < 2; i++) {
      const it = items[i];
      const cur = this.arms[i];
      if (!it) {
        if (cur) changed = true;
        this.arms[i] = null;
        continue;
      }
      if (!cur || cur.uid !== it.uid) {
        const d = itemDef(it.id);
        if (d.kind !== 'weapon') continue;
        const state = new WeaponState(WEAPONS[d.weapon], this.ammoSource(i), it.loaded ?? 0);
        state.ammoId = it.ammoType ?? null;
        this.arms[i] = { uid: it.uid, state };
        changed = true;
      } else if (!this.selfWrite && (it.loaded !== cur.state.ammo || it.ammoType !== cur.state.ammoId)) {
        // Loaded or unloaded through the inventory.
        cur.state.ammo = it.loaded ?? 0;
        cur.state.ammoId = it.ammoType ?? null;
        cur.state.cancelReload();
      }
    }
    this.speedMul = speedMultiplier(l);
    if (changed) {
      if (!this.arms[this.current]) this.current = this.arms[0] ? 0 : this.arms[1] ? 1 : this.current;
      this.equipView();
      this.weapon?.draw();
    }
  }

  private ammoSource(slot: number): AmmoSource {
    return {
      count: () => {
        const id = this.arms[slot]?.state.ammoId;
        return id ? raid.count(id) : 0;
      },
      take: (n) => {
        const id = this.arms[slot]?.state.ammoId;
        if (!id) return 0;
        this.selfWrite = true;
        try {
          return raid.take(id, n);
        } finally {
          this.selfWrite = false;
        }
      },
    };
  }

  /** Write the magazine back to the item (so the inventory and the save agree). */
  private writeBack(slot: number): void {
    const a = this.arms[slot];
    if (!a) return;
    const it = loadoutItems(useRaid.getState().loadout).find((i) => i.uid === a.uid);
    if (!it || (it.loaded === a.state.ammo && it.ammoType === a.state.ammoId)) return;
    this.selfWrite = true;
    try {
      raid.updateItem({ ...it, loaded: a.state.ammo, ammoType: a.state.ammoId ?? it.ammoType });
    } finally {
      this.selfWrite = false;
    }
  }

  private equipView(): void {
    this.view.setWeapon(this.weapon?.def ?? null);
  }

  // ---------------------------------------------------------------------------

  update(dt: number, input: Input, aimX: number, aimY: number, handsFree: boolean): void {
    this.lastHitAgo += dt;
    this.lastShotAgo += dt;
    if (!this.alive) {
      this.view.update(dt, this.x, this.y, this.aim, 0, false);
      return;
    }
    this.updateVitals(dt);
    if (!this.alive) return;

    // --- Movement
    let ix = 0;
    let iy = 0;
    if (input.isDown('KeyA') || input.isDown('ArrowLeft')) ix -= 1;
    if (input.isDown('KeyD') || input.isDown('ArrowRight')) ix += 1;
    if (input.isDown('KeyW') || input.isDown('ArrowUp')) iy -= 1;
    if (input.isDown('KeyS') || input.isDown('ArrowDown')) iy += 1;
    const len = Math.hypot(ix, iy);
    const w = this.weapon;
    if (handsFree && input.wasPressed('KeyC')) {
      this.sneaking = !this.sneaking;
      this.ctx.audio.sfx('switch', this.x, this.y, 0.5);
    }
    // Sprint: fast and loud, weapon down, burns stamina.
    const wantSprint = handsFree && (input.isDown('ShiftLeft') || input.isDown('ShiftRight'));
    this.sprinting = wantSprint && len > 0 && !this.exhausted && !this.using && !(w?.reloading);
    if (this.sprinting) {
      this.sneaking = false;
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * dt);
      this.staminaIdle = 0;
      this.sprintOut = SPRINT_OUT;
      if (this.stamina <= 0) {
        this.exhausted = true;
        this.ctx.audio.sfx('breath', this.x, this.y);
      }
    } else {
      this.staminaIdle += dt;
      this.sprintOut = Math.max(0, this.sprintOut - dt);
      if (this.staminaIdle > 0.9) this.stamina = Math.min(100, this.stamina + STAMINA_REGEN * dt);
      if (this.exhausted && this.stamina > 35) this.exhausted = false;
    }
    if (this.exhausted) {
      this.breathTimer -= dt;
      if (this.breathTimer <= 0) {
        this.breathTimer = 0.9;
        this.ctx.audio.sfx('breath', this.x, this.y);
      }
    }
    const gaitMul = this.sprinting ? SPRINT_MUL : this.sneaking ? SNEAK_MUL : 1;
    const max = MAX_SPEED * gaitMul * (w?.def.moveSpeedMul ?? 1) * this.speedMul * this.boostMulNow() * (this.using ? USING_SPEED : 1);
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
    if (handsFree) {
      this.aim = Math.atan2(aimY - (this.y - GUN_HEIGHT), aimX - this.x);
      this.aimX = aimX;
      this.aimY = aimY + GUN_HEIGHT * 0.5;
    }
    this.throwCooldown -= dt;

    if (handsFree) this.handleHands(dt, input);
    else this.weapon?.update(dt);
    this.updateUsing(dt);
    this.updateThrow(dt);
    this.updateCycle(dt);

    // --- Visuals
    // Sprinting: face where you run, gun carried across the chest.
    if (this.sprinting && moved > 0.01) this.aim = Math.atan2(this.vy, this.vx);
    const backwards = moved > 0 && (this.vx * Math.cos(this.aim) < -5);
    const pose: Pose = {
      raise: this.sprintOut > 0 && !this.sprinting ? 0.4 : 1,
      gait: this.sprinting ? 'sprint' : this.sneaking ? 'sneak' : 'walk',
      vx: this.vx,
      vy: this.vy,
      action: this.handAction(),
    };
    this.view.update(dt, this.x, this.y, this.aim, moved, backwards, pose);
    playAnimEvents(this.ctx, this.view, this.x, this.y, this.aim, this.weapon?.def ?? null);
    if (this.view.stepped) {
      const gait = this.sprinting ? 'sprint' : this.sneaking ? 'sneak' : 'walk';
      this.ctx.audio.sfx('step', this.x, this.y, gait === 'sprint' ? 1.8 : gait === 'sneak' ? 0.35 : 1);
      // Your own footsteps are information for them, too. Heavy loads clatter.
      const noise = STEP_NOISE[gait] * (this.speedMul < 0.9 ? 1.3 : 1);
      if (noise > 0) this.ctx.emitNoise(this.x, this.y, noise);
    }
  }

  /** What the hands are doing right now, for the body animation. */
  private handAction(): HandAction | null {
    if (this.throwing) return { kind: 'throw', t: this.throwing.t / THROW_TIME };
    if (this.using) return { kind: 'heal', t: this.using.t / this.using.def.useTime, quick: this.using.def.useTime < 1.2 };
    if (this.searching >= 0) return { kind: 'search', t: this.searching };
    return weaponAction(this.weapon);
  }

  private handleHands(dt: number, input: Input): void {
    // --- Weapon switching
    const wheel = input.consumeWheel();
    let next = this.current;
    if (input.wasPressed('Digit1')) next = 0;
    if (input.wasPressed('Digit2')) next = 1;
    if (wheel || input.wasPressed('KeyQ')) next = 1 - this.current;
    if (next !== this.current && this.arms[next]) this.switchTo(next);

    if (input.wasPressed('KeyF')) {
      this.flashlight = !this.flashlight;
      this.ctx.audio.sfx('flashlight', this.x, this.y);
    }

    // --- Quick slots
    for (let i = 0; i < 4; i++) {
      if (input.wasPressed(`Digit${i + 3}`)) this.useQuick(i);
    }

    // --- Firing / reloading
    const w = this.weapon;
    if (!w) return;
    const reloadingBefore = w.reloading;
    w.update(dt);
    if (w.roundLoaded) {
      this.ctx.audio.sfx('shell', this.x, this.y);
      this.view.pulse('round');
    }
    // A pump or bolt gun that was run dry gets worked once the last round is in.
    if (w.reloaded && w.def.reloadPerRound && !w.tactical) this.rack(false);
    if (w.roundLoaded || w.reloaded || (reloadingBefore && !w.reloading)) this.writeBack(this.current);

    if (input.wasPressed('KeyR')) this.reload();

    if (this.using) {
      // Pulling the trigger cancels treatment.
      if (input.wasClicked()) this.cancelUse();
      return;
    }
    if (this.sprinting || this.sprintOut > 0) return;
    const moveFactor = Math.min(1, this.speed / MAX_SPEED);
    const result = w.tryFire(input.mouseDown, input.wasClicked(), Math.random());
    if (result === 'fired') {
      discharge(this.ctx, this.view, w, this.x, this.y, this.aim, 'player', moveFactor);
      this.lastShotAgo = 0;
      const def = w.def;
      this.ctx.camera.kick(-Math.cos(this.aim) * def.cameraKick, -Math.sin(this.aim) * def.cameraKick);
      this.ctx.camera.shake(def.shake);
      this.writeBack(this.current);
      if (def.cycled && w.ammo > 0) this.cycleTimer = Math.min(0.28, 0.45 / def.fireRate);
      if (w.jammed) {
        this.ctx.audio.sfx('jam', this.x, this.y);
        this.notice('JAMMED. [R] TO CLEAR', 'bad');
      }
      if (w.ammo === 0) this.reload();
    } else if (result === 'empty') {
      this.ctx.audio.sfx('dryfire', this.x, this.y);
      if (!this.reload() && w.reserve === 0) this.notice('OUT OF AMMO', 'bad');
    } else if (result === 'jammed') {
      this.ctx.audio.sfx('dryfire', this.x, this.y);
    }
  }

  /** Pump or bolt after a shot: a sound that tells everyone what you're carrying. */
  private updateCycle(dt: number): void {
    if (this.cycleTimer < 0) return;
    this.cycleTimer -= dt;
    if (this.cycleTimer < 0) this.rack(true);
  }

  /** Work the action: the gun jerks back and, after a shot, the spent case flies. */
  private rack(eject: boolean): void {
    this.ctx.audio.sfx('cycle', this.x, this.y);
    this.view.pulse('rack');
    const def = this.weapon?.def;
    if (eject && def) {
      const p = this.view.ejectWorld(this.x, this.y);
      this.ctx.effects.casing(p.x, p.y + GUN_HEIGHT, this.aim, def.casingColor, def.archetype === 'shotgun');
    }
  }

  /**
   * R: clear a jam, or reload. If the loaded ammo type has run out but another type of the
   * same caliber is carried, the magazine is emptied back into your pockets and swapped.
   */
  reload(): boolean {
    const w = this.weapon;
    if (!w || this.using) return false;
    if (w.jammed) {
      if (w.startReload()) {
        this.ctx.audio.sfx('unjam', this.x, this.y);
        return true;
      }
      return false;
    }
    if (w.reloading) return false;
    const pick = this.pickAmmo(w);
    if (!pick) return false;
    if (pick !== w.ammoId) {
      if (w.ammo > 0 && w.ammoId) {
        const rest = raid.give(createItem(w.ammoId, { qty: w.ammo }), this.arms[this.current]?.uid ?? null);
        if (rest) {
          raid.dropItem(rest);
          this.notice('NO ROOM FOR UNLOADED ROUNDS. DROPPED', 'warn');
        }
      }
      w.ammo = 0;
      w.ammoId = pick;
      this.writeBack(this.current);
    }
    if (!w.startReload()) return false;
    // Magazine and break-action reloads make their sounds as the hands get there.
    const style = reloadStyleOf(w.def);
    if (style === 'tube' || style === 'clip') this.ctx.audio.sfx('draw', this.x, this.y);
    // Reloading is audible: a careful enemy will hear your magazine hit the floor.
    this.ctx.emitNoise(this.x, this.y, 110);
    return true;
  }

  /** Current type if carried, else the carried type of this caliber with the most rounds. */
  private pickAmmo(w: WeaponState): string | null {
    if (w.ammoId && raid.count(w.ammoId) > 0) return w.ammoId;
    let best: string | null = null;
    let bestN = 0;
    for (const d of Object.values(ITEMS)) {
      if (d.kind !== 'ammo' || d.caliber !== w.def.caliber) continue;
      const n = raid.count(d.id);
      if (n > bestN) {
        best = d.id;
        bestN = n;
      }
    }
    return best;
  }

  /** Rounds carried for the current weapon's loaded type (for the HUD). */
  carriedAmmo(): number {
    const id = this.weapon?.ammoId;
    return id ? raid.count(id) : 0;
  }

  // ---------------------------------------------------------------------------
  // Consumables

  private useQuick(slot: number): void {
    const id = useRaid.getState().loadout.quick[slot];
    if (!id) return;
    const it = loadoutItems(useRaid.getState().loadout).find((i) => i.id === id);
    if (!it) {
      this.notice(`NO ${ITEMS[id]?.short.toUpperCase() ?? 'ITEM'} LEFT`, 'warn');
      return;
    }
    this.useItem(it);
  }

  /** Start using a consumable (from a quick slot or the inventory). Grenades are thrown at the cursor. */
  useItem(it: ItemInstance): boolean {
    if (!this.alive || this.using) return false;
    const def = itemDef(it.id);
    if (def.kind === 'grenade') {
      if (this.throwCooldown > 0 || this.throwing) return false;
      this.throwCooldown = 0.8;
      this.weapon?.cancelReload();
      // Wind up first: the grenade leaves the hand a beat later, at wherever you aim then.
      this.throwing = { uid: it.uid, effect: def.effect, t: 0, released: false };
      this.ctx.audio.sfx('draw', this.x, this.y);
      return true;
    }
    if (def.kind !== 'med') return false;
    const missing = this.maxHp - this.hp;
    const useful = (def.stopsBleed && this.bleeding) || (missing > 1 && (def.heal > 0 || def.regen)) || !!def.boost;
    if (!useful) {
      this.notice('NOT NEEDED', 'warn');
      return false;
    }
    this.weapon?.cancelReload();
    this.using = { uid: it.uid, def, t: 0 };
    this.ctx.audio.sfx(def.useTime < 1.2 ? 'inject' : 'bandage', this.x, this.y);
    return true;
  }

  private cancelUse(): void {
    this.using = null;
  }

  private updateThrow(dt: number): void {
    const th = this.throwing;
    if (!th) return;
    th.t += dt;
    if (!th.released && th.t >= THROW_RELEASE) {
      th.released = true;
      const it = loadoutItems(useRaid.getState().loadout).find((i) => i.uid === th.uid);
      if (it) {
        this.ctx.throwGrenade(this.x, this.y - 2, this.aimX, this.aimY, th.effect, 'player');
        raid.consume(it.uid);
      }
    }
    if (th.t >= THROW_TIME) {
      this.throwing = null;
      this.sprintOut = 0.2; // arm comes back before the gun does
    }
  }

  private updateUsing(dt: number): void {
    const u = this.using;
    if (!u) return;
    u.t += dt;
    if (u.t < u.def.useTime) return;
    this.using = null;
    const it = loadoutItems(useRaid.getState().loadout).find((i) => i.uid === u.uid);
    if (!it) return; // dropped mid-use
    const def = u.def;
    let drain = 0;
    if (def.stopsBleed && this.bleeding) {
      this.bleeding = false;
      drain += 8;
      this.notice('BLEEDING STOPPED', 'ok');
    }
    if (def.heal > 0) {
      const available = def.pooled ? it.dur ?? def.heal : def.heal;
      const heal = Math.min(this.maxHp - this.hp, available);
      this.hp += heal;
      drain += heal;
    }
    if (def.regen) {
      this.regenLeft = def.regen.seconds;
      this.regenRate = def.regen.hp / def.regen.seconds;
    }
    if (def.boost) {
      this.boostLeft = def.boost.seconds;
      this.boostMul = def.boost.speedMul;
    }
    raid.consume(it.uid, def.pooled ? Math.max(1, drain) : 0);
    this.ctx.audio.sfx('heal', this.x, this.y);
    this.ctx.effects.healPuff(this.x, this.y);
  }

  private updateVitals(dt: number): void {
    if (this.regenLeft > 0) {
      this.regenLeft -= dt;
      this.hp = Math.min(this.maxHp, this.hp + this.regenRate * dt);
    }
    if (this.boostLeft > 0) this.boostLeft -= dt;
    if (this.bleeding) {
      this.hp -= BLEED_DPS * dt;
      if (this.hp <= 0) this.die();
    }
  }

  private boostMulNow(): number {
    return this.boostLeft > 0 ? this.boostMul : 1;
  }

  // ---------------------------------------------------------------------------
  // Damage

  /**
   * A bullet hit. Helmets take headshots, vests take the rest; whatever gets through
   * hurts and may start bleeding.
   * @returns true if the armor stopped most of it (for feedback).
   */
  takeHit(raw: number, pen: number, dirX: number, dirY: number, headshot: boolean): boolean {
    if (!this.alive) return false;
    const slot = headshot ? 'helmet' : 'armor';
    const worn = useRaid.getState().loadout[slot];
    let damage = headshot ? raw * HEADSHOT_MUL : raw;
    let blocked = false;
    if (worn) {
      const d = ITEMS[worn.id] as ArmorDef;
      const before = worn.dur ?? d.durability;
      const r = resolveHit(damage, pen, { cls: d.cls, dur: before, maxDur: d.durability });
      damage = r.damage;
      blocked = r.blocked;
      if (r.armorDamage > 0) {
        const dur = Math.max(0, before - r.armorDamage);
        raid.updateItem({ ...worn, dur });
        if (before > 0 && dur <= 0) this.notice(`${d.short.toUpperCase()} BROKEN`, 'bad');
      }
      if (blocked) this.ctx.audio.sfx('armor', this.x, this.y);
    }
    this.hp = Math.max(0, this.hp - damage);
    this.lastHitAgo = 0;
    this.view.flinch(dirX);
    this.vx += dirX * 60;
    this.vy += dirY * 60;
    this.ctx.camera.shake(blocked ? 0.25 : 0.35);
    this.ctx.audio.sfx('hurt', this.x, this.y);
    if (!this.bleeding && Math.random() < bleedChance(damage)) {
      this.bleeding = true;
      this.notice('BLEEDING', 'bad');
    }
    if (this.hp <= 0) this.die();
    return blocked;
  }

  private die(): void {
    if (!this.alive) return;
    this.hp = 0;
    this.alive = false;
    this.using = null;
    this.throwing = null;
    this.view.playDeath();
    this.ctx.hitstop(0.12);
  }

  private switchTo(i: number): void {
    this.writeBack(this.current);
    this.weapon?.cancelReload();
    this.current = i;
    this.cancelUse();
    this.weapon?.draw();
    this.equipView();
    this.ctx.audio.sfx('draw', this.x, this.y);
  }

  private notice(text: string, tone: 'bad' | 'ok' | 'warn'): void {
    this.onNotice?.(text, tone);
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}
