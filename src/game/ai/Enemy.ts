import { anim } from '../../engine/assets';
import { TILE } from '../../engine/config';
import type { EnemyDef } from '../../data/enemies';
import { ITEMS, defaultAmmo, type ArmorDef, type WeaponItemDef } from '../../data/items';
import { WEAPONS } from '../../data/weapons';
import { HEADSHOT_MUL, resolveHit } from '../../core/damage';
import { discharge } from '../combat/fire';
import type { Hittable } from '../combat/projectiles';
import { WeaponState } from '../combat/weapon';
import type { GameContext } from '../context';
import { ActorView, type Pose } from '../entities/ActorView';
import { playAnimEvents, weaponAction } from '../entities/handling';
import { hasLineOfSight, moveCircle } from '../world/collision';
import { findPath } from '../world/pathfinding';

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

  constructor(
    private ctx: GameContext,
    readonly def: EnemyDef,
    x: number,
    y: number,
    private route: { x: number; y: number }[] | null = null,
  ) {
    this.x = x;
    this.y = y;
    this.hp = def.hp;
    this.view = new ActorView({
      walk: anim(`${def.anim}_walk`),
      flash: anim(`${def.anim}_walk_flash`),
      death: anim(`${def.anim}_dead`),
    });
    this.weaponItem = def.weapons[Math.floor(Math.random() * def.weapons.length)];
    const gun = WEAPONS[(ITEMS[this.weaponItem] as WeaponItemDef).weapon];
    this.weapon = new WeaponState(gun, Infinity);
    this.weapon.ammoId = defaultAmmo(gun.caliber).id;
    this.view.setWeapon(this.weapon.def);
    const chance = def.armorChance ?? 1;
    if (def.armor && Math.random() < chance) this.armor = { id: def.armor, dur: (ITEMS[def.armor] as ArmorDef).durability };
    if (def.helmet && Math.random() < chance) this.helmet = { id: def.helmet, dur: (ITEMS[def.helmet] as ArmorDef).durability };
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

  /** A noise was heard. Position is approximate, worse with distance. */
  hear(x: number, y: number, radius: number): void {
    if (!this.alive) return;
    const d = Math.hypot(x - this.x, y - this.y);
    // Walls deaden sound.
    const through = hasLineOfSight(this.ctx.map, this.x, this.y, x, y) ? 1 : 0.6;
    if (d > radius * this.def.hearing * through) return;
    this.edge = Math.max(this.edge, 0.5);
    if (this.state === 'combat' || this.state === 'retreat' || this.state === 'cover') return;
    const err = d * 0.14;
    const ex = x + (Math.random() - 0.5) * err;
    const ey = y + (Math.random() - 0.5) * err;
    if (this.state === 'chase' || this.state === 'flank') {
      // Already hunting: update the guess.
      this.lastKnownX = ex;
      this.lastKnownY = ey;
      return;
    }
    // Loud nearby noises (gunfire) put them on alert, quiet ones make them curious.
    this.investigate(ex, ey, radius > 250 ? 'alert' : 'investigate');
  }

  /** A squad-mate shouted a position. */
  alertTo(x: number, y: number, delay: number): void {
    if (!this.alive || this.aware) return;
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
    if (!this.aware) {
      this.facing = Math.atan2(killerY - this.y, killerX - this.x);
      this.investigate(killerX + (Math.random() - 0.5) * 80, killerY + (Math.random() - 0.5) * 80, 'alert');
    }
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
    this.stagger = blocked ? 0.08 : 0.16;
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
        this.awareness += dt * (0.9 + k * 5 + this.edge * 2.5) * (0.6 + target.conspicuity * 0.5);
      } else this.awareness = Math.max(0, this.awareness - dt * 0.25);
      if (this.awareness >= 1) this.engage();
      else if (sees && this.awareness > 0.35 && this.state !== 'investigate' && this.state !== 'alert') {
        // "What was that?" — turn and go look.
        this.investigate(target.x, target.y, 'investigate');
      }
    }

    let moveX = 0;
    let moveY = 0;
    let speed = this.def.walkSpeed;
    let wantFacing = this.facing;
    let running = false;

    switch (this.state) {
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
        } else this.startSearch();
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
          if (!this.searchPoints.length && this.stateTime > 7) this.resumeRoutine();
        }
        break;
      }
      case 'combat': {
        if (!sees) {
          // Lost sight: someone flanks if a teammate is already on it; otherwise chase.
          if (this.unseen > 0.6) {
            if (this.tryGrenade(target)) break;
            if (!this.tryFlank()) {
              this.setState('chase');
              this.repath(this.lastKnownX, this.lastKnownY);
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
          else if (this.coverHold <= 0 && !this.weapon.reloading) {
            this.setState('chase');
            this.repath(this.lastKnownX, this.lastKnownY);
          }
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
          else if (this.stateTime > 4) {
            this.setState('chase');
            this.repath(this.lastKnownX, this.lastKnownY);
          }
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
      if (running) this.ctx.effects.stepDust(this.x, this.y, Math.atan2(this.y - oy, this.x - ox));
    }
  }

  private engage(fromHit = false): void {
    if (this.state === 'combat') return;
    this.awareness = 1;
    this.edge = 1;
    this.setState('combat');
    this.reactTimer = this.def.reactionTime * (0.8 + Math.random() * 0.5) * (fromHit ? 0.6 : 1);
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
      if (d < (clear ? SHOUT_RANGE : SHOUT_RANGE_WALLS)) a.alertTo(this.lastKnownX, this.lastKnownY, 0.3 + Math.random() * 0.6);
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
    // Suppressed shooters spray.
    const err = this.def.aimError * (1 + this.suppression * 1.6);
    const aim = toTarget + (Math.random() - 0.5) * 2 * err * DEG;
    discharge(this.ctx, this.view, w, this.x, this.y, aim, 'enemy', 0);
    this.lastShotAgo = 0;
    if (w.def.cycled && w.ammo > 0) this.cycleTimer = Math.min(0.28, 0.45 / w.def.fireRate);
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstLeft = randInt(this.def.burst);
      this.burstPause = (0.7 + Math.random() * 0.9) * (1 + this.suppression);
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
    if (!busy || Math.random() < 0.35) return false;
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

  /** Arrived where they thought you were: check a few spots around it. */
  private startSearch(): void {
    this.setState('search');
    this.searchPoints = [];
    const map = this.ctx.map;
    for (let i = 0; i < 8 && this.searchPoints.length < 3; i++) {
      const x = this.lastKnownX + (Math.random() - 0.5) * TILE * 7;
      const y = this.lastKnownY + (Math.random() - 0.5) * TILE * 7;
      if (!map.isSolidAt(x, y)) this.searchPoints.push({ x, y });
    }
  }

  private resumeRoutine(): void {
    this.awareness = 0.3;
    if (this.route && this.route.length > 1) {
      this.setState('patrol');
      this.repath(this.route[this.patrolIndex].x, this.route[this.patrolIndex].y);
    } else {
      this.setState('idle');
    }
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

function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function randInt([lo, hi]: [number, number]): number {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
