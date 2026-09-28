import { operatorLook } from './look';
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
/** Steadying the aim: slower feet, a tighter cone. */
const STEADY_SPEED = 0.62;
export const STEADY_SPREAD = 0.72;

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
  private dripTimer = 0;
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
  /** Holding the aim steady (right mouse / left trigger). */
  steady = false;
  private sprintOut = 0;
  private breathTimer = 0;
  private aimX = 0;
  private aimY = 0;
  private throwCooldown = 0;
  private throwing: Throwing | null = null;
  /** Seconds spent searching something with E this stretch (set by the game), or -1. */
  searching = -1;
  /** Out of the fight (on the shuttle): nothing can hurt you any more. */
  untouchable = false;
  /** Called with a short message for the HUD feed (armor broke, bleeding...). */
  onNotice: ((text: string, tone: 'bad' | 'ok' | 'warn') => void) | null = null;

  constructor(private ctx: GameContext, x: number, y: number, private operator: Operator) {
    this.x = x;
    this.y = y;
    this.view = new ActorView(operatorLook(operator, useRaid.getState().loadout));
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
    // Whatever is worn shows: a helmet, a plate carrier, a pack on the back.
    this.view?.setLook(operatorLook(this.operator, l));
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

    // --- Movement (a stick gives analogue speed; keys are always full)
    const mv = input.move();
    const len = Math.hypot(mv.x, mv.y);
    const w = this.weapon;
    if (handsFree && input.pressed('sneak')) {
      this.sneaking = !this.sneaking;
      this.ctx.audio.sfx('switch', this.x, this.y, 0.5);
    }
    this.steady = handsFree && input.down('steady') && !this.throwing;
    // Sprint: fast and loud, weapon down, burns stamina.
    const wantSprint = handsFree && input.down('sprint') && !this.steady;
    this.sprinting = wantSprint && len > 0.5 && !this.exhausted && !this.using && !(w?.reloading);
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
    const max = MAX_SPEED * gaitMul * (w?.def.moveSpeedMul ?? 1) * this.speedMul * this.boostMulNow()
      * (this.using ? USING_SPEED : 1) * (this.steady ? STEADY_SPEED : 1);
    // Sprinting always runs flat out; otherwise a half-pushed stick walks.
    const push = this.sprinting ? 1 : Math.min(1, len);
    const tx = len ? (mv.x / len) * max * push : 0;
    const ty = len ? (mv.y / len) * max * push : 0;
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
    playAnimEvents(this.ctx, this.view, this.x, this.y, this.aim, this.weapon?.def ?? null, true);
    if (this.view.stepped) {
      const gait = this.sprinting ? 'sprint' : this.sneaking ? 'sneak' : 'walk';
      if (gait === 'sprint') this.ctx.effects.stepDust(this.x, this.y, Math.atan2(this.vy, this.vx));
      const weight = gait === 'sprint' ? 1.8 : gait === 'sneak' ? 0.3 : 1;
      this.ctx.audio.step(this.x, this.y, this.ctx.surfaceAt(this.x, this.y), weight, true);
      const kit = useRaid.getState().loadout;
      const plates = kit.armor ? Math.min(1, ((ITEMS[kit.armor.id] as ArmorDef).cls - 1) / 3) : 0;
      this.ctx.audio.gearStep(this.x, this.y, plates, !!kit.backpack, weight, true);
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
    if (input.pressed('weapon1')) next = 0;
    if (input.pressed('weapon2')) next = 1;
    if (wheel || input.pressed('switchWeapon')) next = 1 - this.current;
    if (next !== this.current && this.arms[next]) this.switchTo(next);
    else if (next !== this.current && input.pressed('switchWeapon')) this.ctx.audio.sfx('dryfire', this.x, this.y, 0.4);

    if (input.pressed('flashlight')) {
      this.flashlight = !this.flashlight;
      this.ctx.audio.sfx('flashlight', this.x, this.y);
    }

    // --- Quick slots, and the dedicated grenade and treatment buttons
    const quick = ['quick1', 'quick2', 'quick3', 'quick4'] as const;
    for (let i = 0; i < 4; i++) {
      if (input.pressed(quick[i])) this.useQuick(i);
    }
    if (input.pressed('grenade')) this.throwBest();
    if (input.pressed('heal')) this.treatBest();

    // --- Firing / reloading
    const w = this.weapon;
    if (!w) return;
    const reloadingBefore = w.reloading;
    w.update(dt);
    if (w.roundLoaded) {
      this.ctx.audio.sfx('shell', this.x, this.y);
      this.ctx.haptics?.pulse(0, 0.3, 35);
      this.view.pulse('round');
    }
    // A pump or bolt gun that was run dry gets worked once the last round is in.
    if (w.reloaded && w.def.reloadPerRound && !w.tactical) this.rack(false);
    if (w.roundLoaded || w.reloaded || (reloadingBefore && !w.reloading)) this.writeBack(this.current);

    if (input.pressed('reload')) this.reload();

    if (this.using) {
      // Pulling the trigger cancels treatment.
      if (input.pressed('fire')) this.cancelUse();
      return;
    }
    if (this.sprinting || this.sprintOut > 0) return;
    const moveFactor = Math.min(1, this.speed / MAX_SPEED);
    const result = w.tryFire(input.down('fire'), input.pressed('fire'), Math.random());
    if (result === 'fired') {
      discharge(this.ctx, this.view, w, this.x, this.y, this.aim, 'player', moveFactor, 0, this.steady ? STEADY_SPREAD : 1);
      this.lastShotAgo = 0;
      const def = w.def;
      this.ctx.camera.kick(-Math.cos(this.aim) * def.cameraKick, -Math.sin(this.aim) * def.cameraKick);
      this.ctx.camera.shake(def.shake);
      this.ctx.haptics?.fire(def);
      this.writeBack(this.current);
      if (def.cycled && w.ammo > 0) this.cycleTimer = Math.min(0.28, 0.45 / def.fireRate);
      if (w.jammed) {
        this.ctx.audio.sfx('jam', this.x, this.y);
        this.notice('JAMMED. {reload} TO CLEAR', 'bad');
      }
      if (w.ammo === 0) this.reload();
    } else if (result === 'empty') {
      this.ctx.audio.sfx('dryfire', this.x, this.y);
      this.ctx.haptics?.pulse(0, 0.25, 40);
      if (!this.reload() && w.reserve === 0) this.notice('OUT OF AMMO', 'bad');
    } else if (result === 'jammed') {
      this.ctx.audio.sfx('dryfire', this.x, this.y);
      this.ctx.haptics?.pulse(0, 0.25, 40);
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
    const def = this.weapon?.def;
    this.ctx.audio.sfx(def?.archetype === 'marksman' ? 'bolt' : 'cycle', this.x, this.y);
    this.ctx.haptics?.pulse(0.3, 0.25, 70);
    this.view.pulse('rack');
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

  /** The grenade button: a grenade from the quick bar first, else whichever is carried. */
  private throwBest(): void {
    const lo = useRaid.getState().loadout;
    const items = loadoutItems(lo).filter((i) => itemDef(i.id).kind === 'grenade');
    if (!items.length) {
      this.notice('NO GRENADES', 'warn');
      return;
    }
    const bound = items.find((i) => lo.quick.includes(i.id));
    this.useItem(bound ?? items.find((i) => i.id === 'frag') ?? items[0]);
  }

  /**
   * The treatment button: whatever fits the wound. Bleeding wants a dressing; otherwise
   * the smallest kit that covers what's missing (the quick bar's choice wins ties).
   */
  private treatBest(): void {
    const lo = useRaid.getState().loadout;
    const meds = loadoutItems(lo).filter((i) => itemDef(i.id).kind === 'med');
    const missing = this.maxHp - this.hp;
    const healOf = (it: ItemInstance) => {
      const d = itemDef(it.id) as MedDef;
      return d.heal + (d.regen?.hp ?? 0);
    };
    let pick: ItemInstance | undefined;
    if (this.bleeding) {
      pick = meds
        .filter((i) => (itemDef(i.id) as MedDef).stopsBleed)
        .sort((a, b) => Number(lo.quick.includes(b.id)) - Number(lo.quick.includes(a.id)) || itemDef(a.id).value - itemDef(b.id).value)[0];
    }
    if (!pick && missing > 1) {
      const healing = meds.filter((i) => healOf(i) > 0);
      const covers = healing.filter((i) => healOf(i) >= missing).sort((a, b) => healOf(a) - healOf(b));
      pick = covers[0] ?? healing.sort((a, b) => healOf(b) - healOf(a))[0];
    }
    if (!pick) {
      this.notice(meds.length ? 'NOT NEEDED' : 'NO MEDICAL SUPPLIES', 'warn');
      return;
    }
    this.useItem(pick);
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
        this.ctx.haptics?.pulse(0.15, 0.2, 60);
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
    if (def.stopsBleed && this.bleeding) {
      this.bleeding = false;
      this.notice('BLEEDING STOPPED', 'ok');
    }
    if (def.heal > 0) this.hp = Math.min(this.maxHp, this.hp + def.heal);
    if (def.regen) {
      this.regenLeft = def.regen.seconds;
      this.regenRate = def.regen.hp / def.regen.seconds;
    }
    if (def.boost) {
      this.boostLeft = def.boost.seconds;
      this.boostMul = def.boost.speedMul;
    }
    // One unit used: the stack is one smaller. What a unit heals never changes.
    raid.consume(it.uid);
    this.ctx.audio.sfx('heal', this.x, this.y);
    this.ctx.haptics?.pulse(0, 0.25, 90);
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
      // You leave a trail.
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 0.35 + Math.random() * 0.5;
        this.ctx.effects.drip(this.x, this.y);
      }
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
    if (!this.alive || this.untouchable) return false;
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
    this.ctx.haptics?.hurt(damage, blocked);
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
    this.ctx.haptics?.pulse(0.08, 0.22, 50);
  }

  private notice(text: string, tone: 'bad' | 'ok' | 'warn'): void {
    this.onNotice?.(text, tone);
  }
}

function approach(v: number, target: number, step: number): number {
  return v < target ? Math.min(v + step, target) : Math.max(v - step, target);
}
