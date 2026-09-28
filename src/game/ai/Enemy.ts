import { TILE } from '../../engine/config';
import { DEFAULT_AI, STARTLE_TIME, type AiTuning, type EnemyDef } from '../../data/enemies';
import { ITEMS, defaultAmmo, type ArmorDef, type WeaponItemDef } from '../../data/items';
import { CARRIES, WEAPONS } from '../../data/weapons';
import { HEADSHOT_MUL, resolveHit } from '../../core/damage';
import { discharge } from '../combat/fire';
import type { Hittable } from '../combat/projectiles';
import { WeaponState } from '../combat/weapon';
import type { GameContext } from '../context';
import { ActorView, type Pose } from '../entities/ActorView';
import { enemyLook } from '../entities/look';
import { playAnimEvents, weaponAction } from '../entities/handling';
import { hasLineOfSight, moveCircle } from '../world/collision';
import { findPath } from '../world/pathfinding';
import type { TileMap } from '../world/tilemap';

export type AIState =
  | 'idle' | 'patrol' | 'investigate' | 'alert' | 'search' | 'chase' | 'combat'
  | 'cover' | 'flank' | 'retreat' | 'dead';

/** What the AI is allowed to know about its target. It never reads the player directly. */
export interface Target {
  x: number;
  y: number;
  alive: boolean;
  /** 0..1 how easy the target is to spot (darkness, flashlight off = low). */
  conspicuity: number;
}

const BODY_RADIUS = 6;
const TURN_RATE = 7; // rad/s
const DEG = Math.PI / 180;
/** Allies within this range hear a shout (less through walls). */
const SHOUT_RANGE = 300;
const SHOUT_RANGE_WALLS = 170;
/** How far a posted guard will go from their post (tiles). */
const LEASH_TILES = 7;
/**
 * Hearing, as a fraction of how far a sound reaches them: closer than NEAR_EAR it's a
 * direction and a distance (a loud one sends them at a run); past FAR_EAR it's only
 * "somewhere that way", and whether they go and look depends on who they are.
 */
const NEAR_EAR = 0.35;
const FAR_EAR = 0.6;
/** How close a squad-mate's investigation has to be for this one to cover it instead (px). */
const OVERWATCH_RANGE = 170;

/**
 * Enemy soldier. Perceives the world through sight (cone, range, light, line of sight, smoke)
 * and sound (approximate position), and only ever knows where the player *was*.
 *
 * Awareness builds before they open fire, so a quiet player gets a moment to act. Once they
 * know, they shout for friends, fight from cover, flank while a teammate holds you, search
 * where you were, and throw grenades at people who hide too long.
 */
export class Enemy implements Hittable {
  x: number;
  y: number;
  readonly hitRadius = 8;
  readonly faction = 'enemy' as const;
  alive = true;
  hp: number;
  state: AIState = 'idle';
  readonly view: ActorView;
  /** Squad-mates, set by the game (for shouts and flanking). */
  allies: Enemy[] = [];

  private facing = Math.random() * Math.PI * 2;
  readonly weapon: WeaponState;
  /** Weapon item id (dropped on death). */
  readonly weaponItem: string;
  /** Worn armor as [item id, durability], or null. */
  armor: { id: string; dur: number } | null = null;
  helmet: { id: string; dur: number } | null = null;
  private kx = 0; // knockback velocity
  private ky = 0;
  private stagger = 0;
  private stateTime = 0;
  private reactTimer = 0;
  private burstLeft = 0;
  private burstPause = 0;
  private strafeDir = 1;
  private strafeTimer = 0;
  private lookTimer = 0;
  private lastKnownX = 0;
  private lastKnownY = 0;
  /** Seconds since the target was last seen. */
  private unseen = 99;
  private path: { x: number; y: number }[] = [];
  private retreated = false;
  private idleLook: number | undefined;
  private patrolIndex = 0;
  private patrolWait = 0;
  /** 0..1: how sure they are someone is there. Reaching 1 means combat. */
  private awareness = 0;
  /** 0..1: rounds snapping past. Wrecks aim, sends them to cover. */
  suppression = 0;
  /** Stays up for a while after any contact: faster to react, slower to relax. */
  private edge = 0;
  private shoutCooldown = 0;
  private coverHold = 0;
  private searchPoints: { x: number; y: number }[] = [];
  private grenades: number;
  private grenadeCooldown = 4;
  private pendingAlert: { x: number; y: number; t: number } | null = null;
  /** Seconds since this enemy last fired (muzzle flash reveals it in the dark). */
  lastShotAgo = 99;
  private mutterTimer = 6 + Math.random() * 30;
  /** A bolt or pump being worked after a shot: you can hear what they carry. */
  private cycleTimer = -1;
  /** Seconds since this enemy last went from unaware to fighting (startle fades over it). */
  private fightTime = 99;
  /** "Who's there?": said once per bout of suspicion, before they commit. */
  private queried = false;
  /** Where they were stationed: after a search they go back to it, not wherever they ended up. */
  private readonly home: { x: number; y: number };
  /** Stopped to listen: facing a far-off noise, not moving, for this long. */
  private listenTimer = 0;
  private listenAngle = 0;
  /** Where the noise they're checking came from (the search centres on it). */
  private noiseX = 0;
  private noiseY = 0;
  /** Covering a squad-mate who's gone to look: stop short and watch, don't search. */
  private covering = false;

  constructor(
    private ctx: GameContext,
    readonly def: EnemyDef,
    x: number,
    y: number,
    private route: { x: number; y: number }[] | null = null,
    /** How hostiles fight at this destination (see AiTuning). */
    private tuning: AiTuning = DEFAULT_AI,
    /** Carry this weapon item instead of a random pick from the faction's kit. */
    weapon?: string,
    /** Holds this spot: comes back to it, and won't be drawn far from it. */
    private post = false,
  ) {
    this.x = x;
    this.y = y;
    this.home = { x, y };
    this.hp = def.hp;
    // Each faction has two looks; a squad is never a row of clones. What they wear shows.
    const chance = def.armorChance ?? 1;
    if (def.armor && Math.random() < chance) this.armor = { id: def.armor, dur: (ITEMS[def.armor] as ArmorDef).durability };
    if (def.helmet && Math.random() < chance) this.helmet = { id: def.helmet, dur: (ITEMS[def.helmet] as ArmorDef).durability };
    this.view = new ActorView(enemyLook(def.anim, Math.random() < 0.45 ? 1 : 0, { armor: this.armor?.id, helmet: this.helmet?.id }));
    this.weaponItem = weapon ?? def.weapons[Math.floor(Math.random() * def.weapons.length)];
    const gun = WEAPONS[(ITEMS[this.weaponItem] as WeaponItemDef).weapon];
    this.weapon = new WeaponState(gun, Infinity);
    this.weapon.ammoId = defaultAmmo(gun.caliber).id;
    this.view.setWeapon(this.weapon.def);
    this.grenades = def.grenades ?? 0;
    if (route && route.length > 1) this.setState('patrol');
  }

  get aware(): boolean {
    return this.state === 'combat' || this.state === 'chase' || this.state === 'cover' || this.state === 'flank' || this.state === 'retreat';
  }

  // ---------------------------------------------------------------------------
  // Perception

  /** Can they see the target right now? `glimpse` ignores the view cone (for combat tracking). */
  private canSee(t: Target): boolean {
    if (!t.alive) return false;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const close = d < TILE * 1.5;
    const range = this.def.sightRange * t.conspicuity * (this.aware ? 1.25 : 1);
    if (!close && d > range) return false;
    // Very close targets are noticed even from behind; aware enemies track all around.
    if (!this.aware && !close) {
      const diff = Math.abs(angleDiff(Math.atan2(dy, dx), this.facing));
      if (diff > this.def.fov * DEG) return false;
    }
    if (!hasLineOfSight(this.ctx.map, this.x, this.y - 4, t.x, t.y - 4)) return false;
    return !this.ctx.smokeBetween(this.x, this.y - 6, t.x, t.y - 6);
  }

  /**
   * A noise was heard. They only know roughly where it came from: worse the further it
   * was, worse again through walls. A loud noise close by brings them at a run; a noise at
   * the edge of hearing is "somewhere that way", and scavengers would often rather stop,
   * face it and listen than go and find out.
   */
  hear(x: number, y: number, radius: number): void {
    if (!this.alive) return;
    const d = Math.hypot(x - this.x, y - this.y);
    // Walls deaden sound.
    const clear = hasLineOfSight(this.ctx.map, this.x, this.y, x, y);
    const reach = radius * this.def.hearing * (clear ? 1 : 0.6);
    if (d > reach) return;
    this.edge = Math.max(this.edge, 0.5);
    if (this.state === 'combat' || this.state === 'retreat' || this.state === 'cover') return;
    const f = d / reach;
    const { x: ex, y: ey } = this.guess(x, y, d * (0.12 + f * 0.3) * (clear ? 1 : 1.5));
    if (this.state === 'chase' || this.state === 'flank') {
      // Already hunting: update the guess.
      this.lastKnownX = ex;
      this.lastKnownY = ey;
      return;
    }
    if (this.leashed(ex, ey)) {
      this.facing = Math.atan2(ey - this.y, ex - this.x);
      return;
    }
    const loud = radius >= CARRIES;
    if (f > FAR_EAR && (!loud || Math.random() > this.def.temper.curiosity)) {
      // Far off: stop, turn toward it, listen. They're on edge now, but they stay put.
      if (this.state === 'idle' || this.state === 'patrol') {
        this.listenTimer = 2.5 + Math.random() * 3;
        this.listenAngle = Math.atan2(ey - this.y, ex - this.x);
      }
      return;
    }
    const fresh = this.state !== 'investigate' && this.state !== 'alert' && this.state !== 'search';
    // A loud noise close by: at a run, weapon up. Anything else: a careful look.
    this.investigate(ex, ey, loud && f <= NEAR_EAR ? 'alert' : 'investigate');
    // Someone on the squad is already checking that: cover them from halfway instead.
    if (this.def.temper.overwatch && this.allies.some((a) => a !== this && a.alive && a.checking(ex, ey))) {
      this.covering = true;
      this.repath(this.x + (ex - this.x) * 0.5, this.y + (ey - this.y) * 0.5);
    }
    // "Who's there?" They say it out loud, once, when something first draws them.
    if (fresh && !this.queried && !loud) {
      this.queried = true;
      this.ctx.audio.sfx('query', this.x, this.y);
    }
  }

  /** Is this one already on its way to (or searching) somewhere near here? */
  checking(x: number, y: number): boolean {
    if (this.covering) return false;
    if (this.state !== 'investigate' && this.state !== 'alert' && this.state !== 'search') return false;
    return Math.hypot(this.noiseX - x, this.noiseY - y) < OVERWATCH_RANGE;
  }

  /** A point near (x, y), off by up to `err`, that isn't inside a wall. */
  private guess(x: number, y: number, err: number): { x: number; y: number } {
    for (let i = 0; i < 4; i++) {
      const gx = x + (Math.random() - 0.5) * err;
      const gy = y + (Math.random() - 0.5) * err;
      if (!this.ctx.map.isSolidAt(gx, gy)) return { x: gx, y: gy };
    }
    return { x, y };
  }

  /** Posted guards don't leave their room for a shout from across the facility. */
  private leashed(x: number, y: number): boolean {
    return this.post && Math.hypot(x - this.home.x, y - this.home.y) > TILE * LEASH_TILES;
  }

  /** A squad-mate shouted a position. */
  alertTo(x: number, y: number, delay: number): void {
    if (!this.alive || this.aware) return;
    if (this.leashed(x, y)) {
      // They heard. They get ready, where they are.
      this.edge = 1;
      this.facing = Math.atan2(y - this.y, x - this.x);
      return;
    }
    this.pendingAlert = { x, y, t: delay };
  }

  /** A friend died nearby. */
  witnessDeath(x: number, y: number, killerX: number, killerY: number): void {
    if (!this.alive) return;
    const d = Math.hypot(x - this.x, y - this.y);
    const sees = d < 260 && hasLineOfSight(this.ctx.map, this.x, this.y - 4, x, y - 4);
    if (!sees && d > 110) return;
    this.edge = 1;
    this.suppression = Math.min(1, this.suppression + 0.35);
    // Some people see a friend drop and run. Scavengers, mostly.
    if (!this.retreated && !this.post && Math.random() < this.def.temper.panic) {
      this.facing = Math.atan2(killerY - this.y, killerX - this.x);
      this.lastKnownX = killerX;
      this.lastKnownY = killerY;
      this.startRetreat(killerX, killerY);
      if (this.state === 'retreat') return;
    }
    if (!this.aware) {
      this.facing = Math.atan2(killerY - this.y, killerX - this.x);
      this.investigate(killerX + (Math.random() - 0.5) * 80, killerY + (Math.random() - 0.5) * 80, 'alert');
      return;
    }
    // The last one standing, already hurt, thinks twice about pushing: they fall back and
    // make you come to them. (Not a rout: they'll fight from wherever they end up.)
    const alone = !this.allies.some((a) => a !== this && a.alive && Math.hypot(a.x - this.x, a.y - this.y) < 320);
    if (alone && !this.retreated && this.hp < this.def.hp * 0.7 && Math.random() < 0.6) this.startRetreat(killerX, killerY);
  }

  /** A round snapped past. */
  nearMiss(fromX: number, fromY: number): void {
    if (!this.alive) return;
    this.suppression = Math.min(1, this.suppression + 0.22);
    this.edge = 1;
    if (!this.aware) {
      this.facing = Math.atan2(fromY - this.y, fromX - this.x);
      this.awareness = Math.max(this.awareness, 0.7);
      this.investigate(fromX, fromY, 'alert');
    }
  }

  private investigate(x: number, y: number, as: 'investigate' | 'alert'): void {
    this.lastKnownX = x;
    this.lastKnownY = y;
    this.noiseX = x;
    this.noiseY = y;
    this.covering = false;
    this.listenTimer = 0;
    this.setState(as);
    this.repath(x, y);
  }

  // ---------------------------------------------------------------------------
  // Damage

  /**
   * A bullet hit. Helmets take headshots, armor takes the rest.
   * @returns killed, and whether armor stopped most of it.
   */
  takeDamage(
    raw: number, pen: number, headshot: boolean, dirX: number, dirY: number, knockback: number,
    fromX: number, fromY: number,
  ): { killed: boolean; blocked: boolean } {
    if (!this.alive) return { killed: false, blocked: false };
    let amount = headshot ? raw * HEADSHOT_MUL : raw;
    let blocked = false;
    const worn = headshot ? this.helmet : this.armor;
    if (worn) {
      const d = ITEMS[worn.id] as ArmorDef;
      const r = resolveHit(amount, pen, { cls: d.cls, dur: worn.dur, maxDur: d.durability });
      amount = r.damage;
      blocked = r.blocked;
      worn.dur = Math.max(0, worn.dur - r.armorDamage);
    }
    this.hp -= amount;
    this.kx += dirX * knockback;
    this.ky += dirY * knockback;
    this.view.hitFlash();
    this.view.flinch(dirX);
    // Heavier hits knock them off their aim for longer: a rifle round rocks them, a pistol stings.
    this.stagger = Math.max(this.stagger, blocked ? 0.08 : Math.min(0.42, 0.12 + amount / 150));
    this.edge = 1;
    this.suppression = Math.min(1, this.suppression + 0.3);
    if (this.hp <= 0) {
      this.alive = false;
      this.setState('dead');
      this.view.playDeath(dirX, dirY);
      return { killed: true, blocked };
    }
    // Getting shot reveals roughly where the shooter is.
    this.lastKnownX = fromX;
    this.lastKnownY = fromY;
    if (!this.aware) {
      this.facing = Math.atan2(fromY - this.y, fromX - this.x);
      this.awareness = 1;
      this.engage(true);
      this.reactTimer = this.def.reactionTime * 0.6;
    }
    if (!this.retreated && this.hp < this.def.hp * this.def.retreatBelow) this.startRetreat(fromX, fromY);
    else if (this.state === 'combat' && this.hp < this.def.hp * 0.6 && Math.random() < 0.5) this.takeCover(fromX, fromY);
    return { killed: false, blocked };
  }

  // ---------------------------------------------------------------------------
  // Update

  update(dt: number, target: Target, others: readonly Enemy[]): void {
    const ox = this.x;
    const oy = this.y;

    // Knockback always applies, even to corpses (they slide a bit when killed).
    const kd = Math.exp(-10 * dt);
    this.kx *= kd;
    this.ky *= kd;
    moveCircle(this.ctx.map, this, BODY_RADIUS, this.kx * dt, this.ky * dt);

    if (!this.alive) {
      this.view.update(dt, this.x, this.y, this.facing, 0, false);
      if (this.view.thudded) this.ctx.audio.sfx('bodyfall', this.x, this.y);
      return;
    }

    this.stateTime += dt;
    this.stagger -= dt;
    // Bored guards talk into their radios. Quietly, but a listening player can find them by it.
    this.mutterTimer -= dt;
    if (this.mutterTimer <= 0) {
      this.mutterTimer = 14 + Math.random() * 26;
      if (this.state === 'idle' || this.state === 'patrol') this.ctx.audio.sfx('mutter', this.x, this.y);
    }
    this.lastShotAgo += dt;
    this.shoutCooldown -= dt;
    this.grenadeCooldown -= dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.35);
    this.edge = Math.max(0, this.edge - dt * 0.03);
    this.weapon.update(dt);
    if (this.cycleTimer >= 0) {
      this.cycleTimer -= dt;
      if (this.cycleTimer < 0) {
        this.ctx.audio.sfx(this.weapon.def.archetype === 'marksman' ? 'bolt' : 'cycle', this.x, this.y);
        this.view.pulse('rack');
      }
    }

    if (this.pendingAlert) {
      this.pendingAlert.t -= dt;
      if (this.pendingAlert.t <= 0) {
        const a = this.pendingAlert;
        this.pendingAlert = null;
        if (!this.aware) {
          this.edge = 1;
          this.lastKnownX = a.x;
          this.lastKnownY = a.y;
          this.setState('chase');
          this.repath(a.x, a.y);
        }
      }
    }

    const sees = this.canSee(target);
    if (sees) {
      this.lastKnownX = target.x;
      this.lastKnownY = target.y;
      this.unseen = 0;
    } else this.unseen += dt;

    // Awareness: seeing someone takes a moment to register (less when on edge or close).
    if (!this.aware) {
      if (sees) {
        const d = Math.hypot(target.x - this.x, target.y - this.y);
        const k = 1 - Math.min(1, d / (this.def.sightRange * 1.1));
        this.awareness += dt * (0.9 + k * 5 + this.edge * 2.5) * (0.6 + target.conspicuity * 0.5) * this.tuning.notice;
      } else this.awareness = Math.max(0, this.awareness - dt * 0.25);
      if (this.awareness >= 1) this.engage();
      else if (sees && this.awareness > 0.35 && this.state !== 'investigate' && this.state !== 'alert') {
        // "What was that?" — turn and go look. They say it out loud: a listening operator
        // gets a moment's warning before they're sure.
        if (!this.queried) {
          this.queried = true;
          this.ctx.audio.sfx('query', this.x, this.y);
        }
        this.investigate(target.x, target.y, 'investigate');
      }
      if (this.awareness <= 0) this.queried = false;
    }
    this.fightTime += dt;

    let moveX = 0;
    let moveY = 0;
    let speed = this.def.walkSpeed;
    let wantFacing = this.facing;
    let running = false;

    // Stopped to listen: facing where a far noise came from, not moving.
    const listening = this.listenTimer > 0 && (this.state === 'idle' || this.state === 'patrol');
    if (this.listenTimer > 0) this.listenTimer -= dt;
    if (listening) wantFacing = this.listenAngle;
    else switch (this.state) {
      case 'idle': {
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = 1.5 + Math.random() * 2.5;
          this.idleLook = this.facing + (Math.random() - 0.5) * Math.PI * 1.4;
        }
        wantFacing = this.idleLook ?? this.facing;
        break;
      }
      case 'patrol': {
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
        } else if (!this.route) {
          // Back at their post (no route to walk): stand watch.
          this.setState('idle');
        } else {
          this.patrolWait -= dt;
          if (this.patrolWait <= 0 && this.route) {
            this.patrolWait = 1.5 + Math.random() * 2;
            this.patrolIndex = (this.patrolIndex + 1) % this.route.length;
            const p = this.route[this.patrolIndex];
            this.repath(p.x, p.y);
          }
        }
        break;
      }
      case 'investigate':
      case 'alert': {
        // Investigating: careful walk. Alert (gunfire): quicker, weapon toward the noise.
        speed = this.state === 'alert' ? this.def.walkSpeed * 1.6 : this.def.walkSpeed * 1.2;
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = this.state === 'alert' && this.stateTime % 3 > 2
            ? Math.atan2(this.lastKnownY - this.y, this.lastKnownX - this.x)
            : Math.atan2(moveY, moveX);
        } else this.startSearch(this.covering);
        break;
      }
      case 'chase': {
        speed = this.def.runSpeed;
        running = true;
        if (sees) {
          this.setState('combat');
          break;
        }
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
        } else this.startSearch();
        break;
      }
      case 'flank': {
        speed = this.def.runSpeed * 0.9;
        running = true;
        if (sees) {
          this.setState('combat');
          break;
        }
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
        } else {
          this.setState('chase');
          this.repath(this.lastKnownX, this.lastKnownY);
        }
        if (this.stateTime > 9) this.startSearch();
        break;
      }
      case 'search': {
        speed = this.def.walkSpeed * 1.1;
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
        } else {
          // Look around at each spot, then move to the next.
          this.lookTimer -= dt;
          if (this.lookTimer <= 0) {
            this.lookTimer = 0.6 + Math.random() * 0.5;
            this.idleLook = this.facing + (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.2);
            if (this.searchPoints.length && Math.random() < 0.45) {
              const p = this.searchPoints.shift()!;
              this.repath(p.x, p.y);
            }
          }
          wantFacing = this.idleLook ?? this.facing;
          // Covering: keep the gun on where the noise was.
          if (this.covering && this.lookTimer > 0.4) wantFacing = Math.atan2(this.noiseY - this.y, this.noiseX - this.x);
          if (!this.searchPoints.length && this.stateTime > this.def.temper.patience) {
            // Giving up, out loud: a listening operator knows they've stopped looking.
            this.ctx.audio.sfx('mutter', this.x, this.y);
            this.resumeRoutine();
          }
        }
        break;
      }
      case 'combat': {
        if (!sees) {
          // Lost sight: someone flanks if a teammate is already on it; otherwise chase.
          if (this.unseen > 0.6) {
            if (this.tryGrenade(target)) break;
            if (this.leashed(this.lastKnownX, this.lastKnownY)) {
              // Holding the room: back to the post, gun on the door.
              if (!this.takeCover(this.lastKnownX, this.lastKnownY)) this.returnToPost();
            } else if (!this.tryFlank()) {
              // Raiders come after you; the garrison holds a corner and waits for you to show.
              if (Math.random() < this.def.temper.push || !this.takeCover(this.lastKnownX, this.lastKnownY)) {
                this.setState('chase');
                this.repath(this.lastKnownX, this.lastKnownY);
              }
            }
          }
          wantFacing = Math.atan2(this.lastKnownY - this.y, this.lastKnownX - this.x);
          break;
        }
        const dx = target.x - this.x;
        const dy = target.y - this.y;
        const d = Math.hypot(dx, dy);
        wantFacing = Math.atan2(dy, dx);
        const nx = dx / (d || 1);
        const ny = dy / (d || 1);
        // Keep preferred distance, strafe while shooting.
        this.strafeTimer -= dt;
        if (this.strafeTimer <= 0) {
          this.strafeTimer = 0.7 + Math.random() * 1.1;
          this.strafeDir = Math.random() < 0.5 ? -1 : 1;
          if (Math.random() < 0.25) this.strafeDir = 0;
        }
        const pr = this.def.preferredRange;
        const radial = d > pr + 40 ? 1 : d < pr - 50 ? -1 : 0;
        moveX = nx * radial + -ny * this.strafeDir * 0.8;
        moveY = ny * radial + nx * this.strafeDir * 0.8;
        speed = this.def.walkSpeed * 1.3;

        // Reloading or pinned down: get out of the line of fire.
        if ((this.weapon.reloading && this.stateTime > 0.3) || this.suppression > 0.65) {
          if (this.takeCover(target.x, target.y)) break;
        }
        this.reactTimer -= dt;
        this.burstPause -= dt;
        if (this.reactTimer <= 0 && this.burstPause <= 0 && this.stagger <= 0) this.shoot(target);
        break;
      }
      case 'cover': {
        speed = this.def.runSpeed;
        running = true;
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
          this.coverHold = 1 + Math.random() * 1.6;
        } else {
          // Holding: reload, catch breath, then peek.
          wantFacing = Math.atan2(this.lastKnownY - this.y, this.lastKnownX - this.x);
          if (this.weapon.ammo < this.weapon.def.magSize) this.weapon.startReload();
          this.coverHold -= dt;
          if (sees && !this.weapon.reloading && this.coverHold < 0.8) this.setState('combat');
          else if (this.coverHold <= 0 && !this.weapon.reloading) this.pursue();
        }
        break;
      }
      case 'retreat': {
        speed = this.def.runSpeed;
        running = true;
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = sees ? Math.atan2(target.y - this.y, target.x - this.x) : Math.atan2(moveY, moveX);
          // Shoot back while falling back, if possible.
          this.burstPause -= dt;
          if (sees && this.burstPause <= 0 && this.stagger <= 0) this.shoot(target);
        } else if (this.stateTime > 1) {
          // Holding behind cover; if the target shows up, fight.
          if (sees) this.setState('combat');
          else if (this.stateTime > 4) this.pursue();
        }
        break;
      }
      case 'dead':
        break;
    }

    // Turn toward desired facing
    const diff = angleDiff(wantFacing, this.facing);
    this.facing += Math.max(-TURN_RATE * dt, Math.min(TURN_RATE * dt, diff));

    // Move
    if (this.stagger > 0) speed *= 0.3;
    const ml = Math.hypot(moveX, moveY);
    if (ml > 0.01) {
      let vx = (moveX / ml) * speed;
      let vy = (moveY / ml) * speed;
      // Don't stack on top of each other.
      for (const o of others) {
        if (o === this || !o.alive) continue;
        const sx = this.x - o.x;
        const sy = this.y - o.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 0 && sd < 18) {
          vx += (sx / sd) * 40;
          vy += (sy / sd) * 40;
        }
      }
      moveCircle(this.ctx.map, this, BODY_RADIUS, vx * dt, vy * dt);
    }

    const moved = Math.hypot(this.x - ox, this.y - oy);
    const backwards = (this.x - ox) * Math.cos(this.facing) < -0.05;
    // Unaware guards carry the gun low; once they know you're there it comes up.
    const pose: Pose = {
      raise: this.aware || this.state === 'alert' ? 1 : this.state === 'investigate' || this.state === 'search' ? 0.65 : 0.35,
      gait: running ? 'run' : 'walk',
      vx: (this.x - ox) / Math.max(dt, 1e-4),
      vy: (this.y - oy) / Math.max(dt, 1e-4),
      action: weaponAction(this.weapon),
    };
    this.view.update(dt, this.x, this.y, this.facing, moved, backwards, pose);
    playAnimEvents(this.ctx, this.view, this.x, this.y, this.facing, this.weapon.def);
    if (this.view.stepped) {
      this.ctx.audio.step(this.x, this.y, this.ctx.surfaceAt(this.x, this.y), running ? 1.7 : 1);
      if (this.armor) this.ctx.audio.gearStep(this.x, this.y, Math.min(1, ((ITEMS[this.armor.id] as ArmorDef).cls - 1) / 3), false, running ? 1.7 : 1);
      if (running) this.ctx.effects.stepDust(this.x, this.y, Math.atan2(this.y - oy, this.x - ox));
    }
  }

  private engage(fromHit = false): void {
    if (this.state === 'combat') return;
    this.awareness = 1;
    this.edge = 1;
    this.setState('combat');
    this.fightTime = 0;
    this.reactTimer = this.def.reactionTime * this.tuning.reaction * (0.8 + Math.random() * 0.5) * (fromHit ? 0.6 : 1);
    this.burstLeft = randInt(this.def.burst);
    this.shout();
  }

  /** Call it in: squad-mates within earshot converge on the position. */
  private shout(): void {
    if (this.shoutCooldown > 0) return;
    this.shoutCooldown = 12;
    this.ctx.audio.sfx('shout', this.x, this.y);
    for (const a of this.allies) {
      if (a === this || !a.alive || a.aware) continue;
      const d = Math.hypot(a.x - this.x, a.y - this.y);
      const clear = hasLineOfSight(this.ctx.map, a.x, a.y, this.x, this.y);
      if (d < (clear ? SHOUT_RANGE : SHOUT_RANGE_WALLS) * this.tuning.coordination) a.alertTo(this.lastKnownX, this.lastKnownY, 0.3 + Math.random() * 0.6);
    }
  }

  private shoot(target: Target): void {
    const w = this.weapon;
    if (w.ammo === 0) {
      // The reload is heard through its animation (mag out, mag in, rack).
      w.startReload();
      return;
    }
    // Only fire when roughly facing the target.
    // Both actors share the ground plane, so ground-to-ground is the true firing line.
    const toTarget = Math.atan2(target.y - this.y, target.x - this.x);
    if (Math.abs(angleDiff(toTarget, this.facing)) > 0.25) return;
    const r = w.tryFire(true, true, Math.random());
    if (r === 'jammed') {
      // A jam is an opening. It's audible, so a sharp player can push.
      this.ctx.audio.sfx('jam', this.x, this.y);
      w.startReload();
      this.burstPause = 0.9;
      return;
    }
    if (r !== 'fired') return;
    // Suppressed shooters spray, and so does anyone who has only just realised they're in a
    // fight: the first rounds go wide, the next ones don't.
    const startle = 1 + this.tuning.startle * Math.max(0, 1 - this.fightTime / STARTLE_TIME);
    const err = this.def.aimError * this.tuning.aim * startle * (1 + this.suppression * 1.6);
    const aim = toTarget + (Math.random() - 0.5) * 2 * err * DEG;
    discharge(this.ctx, this.view, w, this.x, this.y, aim, 'enemy', 0, 0, 1, `${this.def.named ? this.def.name : `a ${this.def.name.toLowerCase()}`}'s ${w.def.name}`);
    this.lastShotAgo = 0;
    if (w.def.cycled && w.ammo > 0) this.cycleTimer = Math.min(0.28, 0.45 / w.def.fireRate);
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstLeft = randInt(this.def.burst);
      this.burstPause = (0.7 + Math.random() * 0.9) * (1 + this.suppression) * this.tuning.pause;
    }
  }

  /** Grenade the spot where they were last seen, if they're hiding close by. */
  private tryGrenade(target: Target): boolean {
    if (this.grenades <= 0 || this.grenadeCooldown > 0 || this.unseen < 2 || !target.alive) return false;
    const d = Math.hypot(this.lastKnownX - this.x, this.lastKnownY - this.y);
    if (d < 90 || d > 260) return false;
    this.grenades--;
    this.grenadeCooldown = 15;
    this.ctx.throwGrenade(this.x, this.y, this.lastKnownX, this.lastKnownY, 'frag', 'enemy');
    this.ctx.audio.sfx('shout', this.x, this.y);
    this.takeCover(this.lastKnownX, this.lastKnownY);
    return true;
  }

  /**
   * If a squad-mate is already fighting the same target, go around: pick a spot near the
   * last known position that approaches from a different side.
   */
  private tryFlank(): boolean {
    const busy = this.allies.some((a) => a !== this && a.alive && (a.state === 'combat' || a.state === 'cover'));
    if (!busy || Math.random() > 0.65 * this.tuning.coordination) return false;
    const map = this.ctx.map;
    const tx0 = Math.floor(this.lastKnownX / TILE);
    const ty0 = Math.floor(this.lastKnownY / TILE);
    const myAngle = Math.atan2(this.y - this.lastKnownY, this.x - this.lastKnownX);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let i = 0; i < 24; i++) {
      const tx = tx0 + Math.round((Math.random() - 0.5) * 10);
      const ty = ty0 + Math.round((Math.random() - 0.5) * 10);
      if (map.isSolid(tx, ty)) continue;
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      const r = Math.hypot(cx - this.lastKnownX, cy - this.lastKnownY);
      if (r < TILE * 2.5 || r > TILE * 6) continue;
      const side = Math.abs(angleDiff(Math.atan2(cy - this.lastKnownY, cx - this.lastKnownX), myAngle));
      if (side < 70 * DEG) continue;
      if (!hasLineOfSight(map, cx, cy, this.lastKnownX, this.lastKnownY)) continue;
      const score = side - Math.hypot(cx - this.x, cy - this.y) / 200;
      if (score > bestScore) {
        bestScore = score;
        best = { x: cx, y: cy };
      }
    }
    if (!best) return false;
    const path = findPath(map, this.x, this.y, best.x, best.y);
    if (!path.length || path.length > 26) return false;
    this.setState('flank');
    this.path = path;
    return true;
  }

  /** Find a nearby tile the threat can't see and go there. */
  private takeCover(fromX: number, fromY: number): boolean {
    const spot = this.hiddenSpot(fromX, fromY, 5, 1.2);
    if (!spot) return false;
    this.setState('cover');
    this.repath(spot.x, spot.y);
    return this.path.length > 0;
  }

  private hiddenSpot(fromX: number, fromY: number, radius: number, nearWeight: number): { x: number; y: number } | null {
    const map = this.ctx.map;
    const tx0 = Math.floor(this.x / TILE);
    const ty0 = Math.floor(this.y / TILE);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let ty = ty0 - radius; ty <= ty0 + radius; ty++) {
      for (let tx = tx0 - radius; tx <= tx0 + radius; tx++) {
        if (map.isSolid(tx, ty)) continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if (hasLineOfSight(map, fromX, fromY, cx, cy)) continue;
        const score = Math.hypot(cx - fromX, cy - fromY) * 0.3 - Math.hypot(cx - this.x, cy - this.y) * nearWeight;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, y: cy };
        }
      }
    }
    return best;
  }

  /** Break line of sight and fall back further. */
  private startRetreat(fromX: number, fromY: number): void {
    this.retreated = true;
    const spot = this.hiddenSpot(fromX, fromY, 6, 1.5);
    if (!spot) return;
    this.setState('retreat');
    this.repath(spot.x, spot.y);
  }

  /**
   * Arrived where they thought you were: check the room it came from and the rooms next
   * to it, the way a person would, not random spots. Covering a squad-mate, they stay and
   * watch instead.
   */
  private startSearch(covering = false): void {
    this.setState('search');
    this.covering = covering;
    this.searchPoints = covering ? [] : searchPlan(this.ctx.map, this.lastKnownX, this.lastKnownY, this.def.temper.sweep);
  }

  private resumeRoutine(): void {
    this.awareness = 0.3;
    this.covering = false;
    if (this.route && this.route.length > 1) {
      this.setState('patrol');
      this.repath(this.route[this.patrolIndex].x, this.route[this.patrolIndex].y);
    } else this.returnToPost();
  }

  /** Go after the last known position, unless it's past a posted guard's leash. */
  private pursue(): void {
    if (this.leashed(this.lastKnownX, this.lastKnownY)) {
      this.returnToPost();
      return;
    }
    this.setState('chase');
    this.repath(this.lastKnownX, this.lastKnownY);
  }

  /** Walk back to where they were stationed (or just stand, if they're there). */
  private returnToPost(): void {
    if (Math.hypot(this.home.x - this.x, this.home.y - this.y) < TILE) {
      this.setState('idle');
      return;
    }
    this.setState('patrol');
    this.repath(this.home.x, this.home.y);
  }

  private repath(x: number, y: number): void {
    this.path = findPath(this.ctx.map, this.x, this.y, x, y);
  }

  /** Direction toward the next waypoint, or null when the path is done. */
  private followPath(): { x: number; y: number } | null {
    while (this.path.length) {
      const p = this.path[0];
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      if (Math.hypot(dx, dy) < 6) {
        this.path.shift();
        continue;
      }
      return { x: dx, y: dy };
    }
    return null;
  }

  private setState(s: AIState): void {
    this.state = s;
    this.stateTime = 0;
    this.lookTimer = 0;
  }
}

/**
 * Where to look for someone heard or lost near (x, y): a spot or two in the room it came
 * from, then the middle of the nearest rooms around it, within `sweep` tiles. In a corridor
 * or an open map, a few spots around the point. At most four, nearest first.
 */
export function searchPlan(map: TileMap, x: number, y: number, sweep: number): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  const tx = x / TILE;
  const ty = y / TILE;
  const inside = (r: { x: number; y: number; w: number; h: number }) => tx >= r.x && tx < r.x + r.w && ty >= r.y && ty < r.y + r.h;
  const floor = (px: number, py: number) => !map.isSolidAt(px, py);
  const here = map.rooms.find(inside);
  if (here) {
    for (let i = 0; i < 6 && out.length < 2; i++) {
      const px = (here.x + 0.5 + Math.random() * (here.w - 1)) * TILE;
      const py = (here.y + 0.5 + Math.random() * (here.h - 1)) * TILE;
      if (floor(px, py)) out.push({ x: px, y: py });
    }
  }
  const near = map.rooms
    .filter((r) => r !== here && r.role !== 'vault')
    .map((r) => ({ x: (r.x + r.w / 2) * TILE, y: (r.y + r.h / 2) * TILE }))
    .map((c) => ({ ...c, d: Math.hypot(c.x - x, c.y - y) }))
    .filter((c) => c.d < sweep * TILE * 1.6 && floor(c.x, c.y))
    .sort((a, b) => a.d - b.d);
  for (const c of near) {
    if (out.length >= 4) break;
    out.push({ x: c.x, y: c.y });
  }
  for (let i = 0; i < 10 && out.length < 3; i++) {
    const px = x + (Math.random() - 0.5) * TILE * sweep;
    const py = y + (Math.random() - 0.5) * TILE * sweep;
    if (floor(px, py)) out.push({ x: px, y: py });
  }
  return out;
}

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function randInt([lo, hi]: [number, number]): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
