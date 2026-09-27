import type { Graphics } from 'pixi.js';
import { GUN_HEIGHT } from '../../engine/config';
import { raycast, segmentCircle, type RayHit } from '../world/collision';
import type { TileMap } from '../world/tilemap';

export type Faction = 'player' | 'enemy';

/** Anything bullets can hit. Position is the ground point (feet). */
export interface Hittable {
  x: number;
  y: number;
  hitRadius: number;
  faction: Faction;
  alive: boolean;
}

export interface Bullet {
  active: boolean;
  x: number;
  y: number;
  /** Where it was fired from, so tracers never draw behind the muzzle. */
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  speed: number;
  travelled: number;
  range: number;
  damage: number;
  /** Armor penetration class of the round. */
  pen: number;
  knockback: number;
  faction: Faction;
  color: number;
  /** Last target this bullet whizzed past (reported once). */
  near: Hittable | null;
}

export interface ShotSpec {
  speed: number;
  range: number;
  damage: number;
  pen: number;
  knockback: number;
  faction: Faction;
  color: number;
}

/** Perpendicular miss distance (px) under which a hit counts as a headshot. */
export const HEADSHOT_RADIUS = 2.5;

export interface ProjectileEvents {
  onWall(b: Bullet, hit: RayHit): void;
  /** `headshot`: the bullet's line passed through the centre of the target. */
  onActor(b: Bullet, target: Hittable, x: number, y: number, headshot: boolean): void;
  /** The bullet passed close to a target without hitting it. */
  onNearMiss?(b: Bullet, target: Hittable): void;
}

const TRACER_TIME = 0.022; // seconds of travel shown as the tracer streak
/** A round passing this close (px) is a near miss: suppression, and a snap in your ear. */
const NEAR_MISS = 24;

function segPointDist(x0: number, y0: number, x1: number, y1: number, px: number, py: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / l2)) : 0;
  return Math.hypot(x0 + dx * t - px, y0 + dy * t - py);
}
const MAX_TRACER = 34;

/**
 * Fast projectiles simulated in the ground plane with swept collision (they never
 * tunnel through walls or actors), drawn as tracers at gun height. Pooled.
 */
export class Projectiles {
  private pool: Bullet[] = [];

  fire(x: number, y: number, angle: number, spec: ShotSpec): void {
    let b = this.pool.find((p) => !p.active);
    if (!b) {
      b = {} as Bullet;
      this.pool.push(b);
    }
    b.active = true;
    b.x = b.ox = x;
    b.y = b.oy = y;
    b.dx = Math.cos(angle);
    b.dy = Math.sin(angle);
    b.speed = spec.speed;
    b.travelled = 0;
    b.range = spec.range;
    b.damage = spec.damage;
    b.pen = spec.pen;
    b.knockback = spec.knockback;
    b.faction = spec.faction;
    b.color = spec.color;
    b.near = null;
  }

  update(dt: number, map: TileMap, targets: readonly Hittable[], ev: ProjectileEvents): void {
    for (const b of this.pool) {
      if (!b.active) continue;
      const step = Math.min(b.speed * dt, b.range - b.travelled);
      const nx = b.x + b.dx * step;
      const ny = b.y + b.dy * step;

      // Nearest actor along the segment
      let bestT = Infinity;
      let bestTarget: Hittable | null = null;
      for (const t of targets) {
        if (!t.alive || t.faction === b.faction) continue;
        const ht = segmentCircle(b.x, b.y, nx, ny, t.x, t.y, t.hitRadius);
        if (ht >= 0 && ht < bestT) {
          bestT = ht;
          bestTarget = t;
        }
      }
      const wall = raycast(map, b.x, b.y, nx, ny);
      if (wall && wall.t <= bestT) {
        b.x = wall.x;
        b.y = wall.y;
        b.active = false;
        ev.onWall(b, wall);
        continue;
      }
      if (bestTarget) {
        b.x += (nx - b.x) * bestT;
        b.y += (ny - b.y) * bestT;
        b.active = false;
        // Distance from the target's centre to the bullet's line.
        const miss = Math.abs((bestTarget.x - b.x) * b.dy - (bestTarget.y - b.y) * b.dx);
        ev.onActor(b, bestTarget, b.x, b.y, miss < HEADSHOT_RADIUS);
        continue;
      }
      if (ev.onNearMiss) {
        for (const t of targets) {
          if (!t.alive || t.faction === b.faction || t === b.near) continue;
          if (segPointDist(b.x, b.y, nx, ny, t.x, t.y) < NEAR_MISS) {
            b.near = t;
            ev.onNearMiss(b, t);
          }
        }
      }
      b.x = nx;
      b.y = ny;
      b.travelled += step;
      if (b.travelled >= b.range) b.active = false;
    }
  }

  render(g: Graphics): void {
    for (const b of this.pool) {
      if (!b.active) continue;
      const len = Math.min(MAX_TRACER, b.speed * TRACER_TIME, Math.hypot(b.x - b.ox, b.y - b.oy));
      const x1 = Math.round(b.x);
      const y1 = Math.round(b.y - GUN_HEIGHT);
      const x0 = Math.round(b.x - b.dx * len);
      const y0 = Math.round(b.y - b.dy * len - GUN_HEIGHT);
      // +0.5 puts 1px lines on pixel centres; without it they vanish with antialias off.
      const mx = Math.round((x0 + x1) / 2);
      const my = Math.round((y0 + y1) / 2);
      g.moveTo(x0 + 0.5, y0 + 0.5).lineTo(mx + 0.5, my + 0.5).stroke({ width: 1, color: b.color, alpha: 0.45 });
      g.moveTo(mx + 0.5, my + 0.5).lineTo(x1 + 0.5, y1 + 0.5).stroke({ width: 1, color: b.color, alpha: 0.95 });
      g.rect(x1, y1, 2, 1).fill({ color: 0xffffff });
    }
  }

  clear(): void {
    for (const b of this.pool) b.active = false;
  }
}
