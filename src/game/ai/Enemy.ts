import { anim } from '../../engine/assets';
import { TILE } from '../../engine/config';
import type { EnemyDef } from '../../data/enemies';
import { WEAPONS } from '../../data/weapons';
import { discharge } from '../combat/fire';
import type { Hittable } from '../combat/projectiles';
import { WeaponState } from '../combat/weapon';
import type { GameContext } from '../context';
import { ActorView } from '../entities/ActorView';
import { hasLineOfSight, moveCircle } from '../world/collision';
import { findPath } from '../world/pathfinding';

export type AIState = 'idle' | 'patrol' | 'investigate' | 'combat' | 'chase' | 'search' | 'retreat' | 'dead';

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

export class Enemy implements Hittable {
  x: number;
  y: number;
  readonly hitRadius = 8;
  readonly faction = 'enemy' as const;
  alive = true;
  hp: number;
  state: AIState = 'idle';
  readonly view: ActorView;

  private facing = Math.random() * Math.PI * 2;
  private weapon: WeaponState;
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
  private path: { x: number; y: number }[] = [];
  private retreated = false;
  private idleLook: number | undefined;
  private patrolIndex = 0;
  private patrolWait = 0;
  /** Seconds since this enemy last fired (muzzle flash reveals it in the dark). */
  lastShotAgo = 99;

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
    this.weapon = new WeaponState(WEAPONS[def.weapon], Infinity);
    this.view.setWeapon(this.weapon.def);
    if (route && route.length > 1) this.setState('patrol');
  }

  // ---------------------------------------------------------------------------
  // Perception

  private canSee(t: Target): boolean {
    if (!t.alive) return false;
    const dx = t.x - this.x;
    const dy = t.y - this.y;
    const d = Math.hypot(dx, dy);
    const close = d < TILE * 1.5;
    if (!close && d > this.def.sightRange * t.conspicuity) return false;
    const aware = this.state === 'combat' || this.state === 'chase' || this.state === 'retreat';
    // Very close targets are noticed even from behind.
    if (!aware && !close) {
      const diff = Math.abs(angleDiff(Math.atan2(dy, dx), this.facing));
      if (diff > this.def.fov * DEG) return false;
    }
    return hasLineOfSight(this.ctx.map, this.x, this.y - 4, t.x, t.y - 4);
  }

  /** A noise was heard. Position is approximate. */
  hear(x: number, y: number, radius: number): void {
    if (!this.alive) return;
    const d = Math.hypot(x - this.x, y - this.y);
    if (d > radius * this.def.hearing) return;
    if (this.state === 'combat' || this.state === 'retreat') return;
    const err = d * 0.12;
    this.investigate(x + (Math.random() - 0.5) * err, y + (Math.random() - 0.5) * err);
  }

  private investigate(x: number, y: number): void {
    this.lastKnownX = x;
    this.lastKnownY = y;
    this.setState('investigate');
    this.repath(x, y);
  }

  // ---------------------------------------------------------------------------
  // Damage

  takeDamage(amount: number, dirX: number, dirY: number, knockback: number, fromX: number, fromY: number): boolean {
    if (!this.alive) return false;
    this.hp -= amount;
    this.kx += dirX * knockback;
    this.ky += dirY * knockback;
    this.view.hitFlash();
    this.stagger = 0.16;
    if (this.hp <= 0) {
      this.alive = false;
      this.setState('dead');
      this.view.playDeath();
      return true;
    }
    // Getting shot reveals roughly where the shooter is.
    if (this.state !== 'combat') {
      this.facing = Math.atan2(fromY - this.y, fromX - this.x);
      this.investigate(fromX, fromY);
      this.reactTimer = Math.min(this.reactTimer, this.def.reactionTime * 0.5);
    }
    if (!this.retreated && this.hp < this.def.hp * this.def.retreatBelow) this.startRetreat(fromX, fromY);
    return false;
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
      return;
    }

    this.stateTime += dt;
    this.stagger -= dt;
    this.lastShotAgo += dt;
    this.weapon.update(dt);
    const sees = this.canSee(target);
    if (sees) {
      this.lastKnownX = target.x;
      this.lastKnownY = target.y;
    }

    let moveX = 0;
    let moveY = 0;
    let speed = this.def.walkSpeed;
    let wantFacing = this.facing;

    switch (this.state) {
      case 'idle': {
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = 1.5 + Math.random() * 2.5;
          this.idleLook = this.facing + (Math.random() - 0.5) * Math.PI * 1.4;
        }
        wantFacing = this.idleLook ?? this.facing;
        if (sees) this.engage();
        break;
      }
      case 'patrol': {
        if (sees) {
          this.engage();
          break;
        }
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
      case 'chase': {
        speed = this.state === 'chase' ? this.def.runSpeed : this.def.walkSpeed * 1.4;
        if (sees) {
          this.engage();
          break;
        }
        const step = this.followPath();
        if (step) {
          moveX = step.x;
          moveY = step.y;
          wantFacing = Math.atan2(moveY, moveX);
        } else {
          this.setState('search');
        }
        break;
      }
      case 'search': {
        this.lookTimer -= dt;
        if (this.lookTimer <= 0) {
          this.lookTimer = 0.7 + Math.random() * 0.6;
          this.idleLook = this.facing + (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 1.2);
        }
        wantFacing = this.idleLook ?? this.facing;
        if (sees) this.engage();
        else if (this.stateTime > 4.5) this.resumeRoutine();
        break;
      }
      case 'combat': {
        if (!sees) {
          // Lost sight: go where the target was last seen.
          this.setState('chase');
          this.repath(this.lastKnownX, this.lastKnownY);
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

        this.reactTimer -= dt;
        this.burstPause -= dt;
        if (this.reactTimer <= 0 && this.burstPause <= 0 && this.stagger <= 0) this.shoot(target);
        break;
      }
      case 'retreat': {
        speed = this.def.runSpeed;
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
          if (sees) this.engage();
          else if (this.stateTime > 3.5) {
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
    const raise = this.weapon.reloading ? 0 : 1;
    this.view.update(dt, this.x, this.y, this.facing, moved, backwards, raise);
    if (this.view.stepped) this.ctx.audio.sfx('step', this.x, this.y);
  }

  private engage(): void {
    if (this.state !== 'combat') {
      this.setState('combat');
      this.reactTimer = this.def.reactionTime * (0.8 + Math.random() * 0.5);
      this.burstLeft = randInt(this.def.burst);
    }
  }

  private shoot(target: Target): void {
    const w = this.weapon;
    if (w.ammo === 0) {
      if (w.startReload()) this.ctx.audio.reload(w.def.reloadTime, this.x, this.y);
      return;
    }
    // Only fire when roughly facing the target.
    // Both actors share the ground plane, so ground-to-ground is the true firing line.
    const toTarget = Math.atan2(target.y - this.y, target.x - this.x);
    if (Math.abs(angleDiff(toTarget, this.facing)) > 0.25) return;
    if (w.tryFire(true, true) !== 'fired') return;
    const aim = toTarget + (Math.random() - 0.5) * 2 * this.def.aimError * DEG;
    discharge(this.ctx, this.view, w, this.x, this.y, aim, 'enemy', 0);
    this.lastShotAgo = 0;
    this.burstLeft--;
    if (this.burstLeft <= 0) {
      this.burstLeft = randInt(this.def.burst);
      this.burstPause = 0.7 + Math.random() * 0.9;
    }
  }

  /** Break line of sight: pick a nearby reachable tile the threat can't see. */
  private startRetreat(fromX: number, fromY: number): void {
    this.retreated = true;
    const map = this.ctx.map;
    const tx0 = Math.floor(this.x / TILE);
    const ty0 = Math.floor(this.y / TILE);
    let best: { x: number; y: number } | null = null;
    let bestScore = -Infinity;
    for (let ty = ty0 - 6; ty <= ty0 + 6; ty++) {
      for (let tx = tx0 - 6; tx <= tx0 + 6; tx++) {
        if (map.isSolid(tx, ty)) continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        if (hasLineOfSight(map, fromX, fromY, cx, cy)) continue;
        const score = Math.hypot(cx - fromX, cy - fromY) - Math.hypot(cx - this.x, cy - this.y) * 1.5;
        if (score > bestScore) {
          bestScore = score;
          best = { x: cx, y: cy };
        }
      }
    }
    if (!best) return;
    this.setState('retreat');
    this.repath(best.x, best.y);
  }

  private resumeRoutine(): void {
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
