import { Container, Graphics, Sprite } from 'pixi.js';
import { anim, tex } from '../../engine/assets';
import type { AudioService } from '../../engine/audio';
import { hasLineOfSight, raycast } from '../world/collision';
import type { TileMap } from '../world/tilemap';
import type { Faction } from './projectiles';

export type GrenadeKind = 'frag' | 'smoke';

const GRAVITY = 520;
const FUSE = { frag: 2.1, smoke: 1.4 };
export const FRAG_RADIUS = 125;
const FRAG_DAMAGE = 115;
const SMOKE_RADIUS = 78;
const SMOKE_LIFE = 20;

interface Grenade {
  kind: GrenadeKind;
  faction: Faction;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  fuse: number;
  sprite: Sprite;
  landed: boolean;
}

interface Cloud {
  x: number;
  y: number;
  t: number;
  puffs: { s: Sprite; dx: number; dy: number; vx: number; vy: number; phase: number }[];
}

export interface GrenadeEvents {
  /** A fragmentation grenade went off: the game applies damage, light and camera. */
  onExplode(x: number, y: number, radius: number, damage: number, faction: Faction): void;
  onNoise(x: number, y: number, radius: number): void;
}

/**
 * Thrown grenades: a real arc, bounces off walls, skitters to a stop, then either blows
 * (damage falls off with distance and needs line of sight) or pours out smoke that blocks
 * sight for everyone.
 */
export class Grenades {
  /** Lit world layer (grenades, smoke). */
  readonly container = new Container();
  private shadows = new Graphics();
  private list: Grenade[] = [];
  private clouds: Cloud[] = [];

  constructor(private map: TileMap, private audio: AudioService, private ev: GrenadeEvents) {
    this.container.addChild(this.shadows);
  }

  throw(fromX: number, fromY: number, toX: number, toY: number, kind: GrenadeKind, faction: Faction): void {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const d = Math.max(20, Math.min(240, Math.hypot(dx, dy)));
    const a = Math.atan2(dy, dx);
    // Flight time grows with distance; pick vz so it lands near the target.
    const t = 0.35 + d / 520;
    const sprite = new Sprite(tex(kind === 'frag' ? 'item_frag' : 'item_smoke'));
    sprite.anchor.set(0.5);
    sprite.scale.set(0.3);
    this.container.addChild(sprite);
    this.list.push({
      kind, faction, x: fromX, y: fromY, z: 16,
      vx: (Math.cos(a) * d) / t, vy: (Math.sin(a) * d) / t, vz: (GRAVITY * t) / 2 - 16 / t,
      fuse: FUSE[kind] + (faction === 'enemy' ? 0.4 : 0), sprite, landed: false,
    });
    this.audio.sfx('switch', fromX, fromY, 0.6);
  }

  /** Does smoke block the view between two points? */
  blocks(x0: number, y0: number, x1: number, y1: number): boolean {
    for (const c of this.clouds) {
      const r = SMOKE_RADIUS * this.density(c);
      if (r < 20) continue;
      if (segDist(x0, y0, x1, y1, c.x, c.y) < r * 0.8) return true;
    }
    return false;
  }

  private density(c: Cloud): number {
    const grow = Math.min(1, c.t / 1.5);
    const fade = Math.min(1, (SMOKE_LIFE - c.t) / 4);
    return Math.max(0, Math.min(grow, fade));
  }

  update(dt: number): void {
    const g = this.shadows;
    g.clear();
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.fuse -= dt;
      // Ground-plane movement with wall bounces.
      const nx = n.x + n.vx * dt;
      const ny = n.y + n.vy * dt;
      const hit = raycast(this.map, n.x, n.y, nx, ny);
      if (hit) {
        n.x = hit.x + hit.nx * 2;
        n.y = hit.y + hit.ny * 2;
        if (hit.nx) n.vx = -n.vx * 0.45;
        if (hit.ny) n.vy = -n.vy * 0.45;
        this.audio.sfx('clink', n.x, n.y);
      } else {
        n.x = nx;
        n.y = ny;
      }
      n.vz -= GRAVITY * dt;
      n.z += n.vz * dt;
      if (n.z <= 0) {
        n.z = 0;
        if (n.vz < -60) {
          n.vz = -n.vz * 0.3;
          n.vx *= 0.55;
          n.vy *= 0.55;
          this.audio.sfx('clink', n.x, n.y);
          if (!n.landed) {
            n.landed = true;
            this.ev.onNoise(n.x, n.y, 150);
          }
        } else {
          n.vz = 0;
          const f = Math.exp(-4 * dt);
          n.vx *= f;
          n.vy *= f;
        }
      }
      n.sprite.position.set(Math.round(n.x), Math.round(n.y - n.z - 3));
      n.sprite.rotation += (Math.abs(n.vx) + Math.abs(n.vy)) * dt * 0.05;
      g.ellipse(Math.round(n.x), Math.round(n.y), 3, 1.5).fill({ color: 0x000000, alpha: 0.4 });
      if (n.fuse <= 0) {
        n.sprite.destroy();
        this.list.splice(i, 1);
        if (n.kind === 'frag') this.explode(n);
        else this.pop(n);
      }
    }

    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.t += dt;
      const k = this.density(c);
      for (const p of c.puffs) {
        p.dx += p.vx * dt;
        p.dy += p.vy * dt;
        p.vx *= Math.exp(-0.6 * dt);
        p.vy *= Math.exp(-0.6 * dt);
        p.s.position.set(Math.round(c.x + p.dx), Math.round(c.y + p.dy - 10 + Math.sin(c.t * 0.8 + p.phase) * 2));
        p.s.alpha = 0.72 * k;
      }
      if (c.t > SMOKE_LIFE) {
        for (const p of c.puffs) p.s.destroy();
        this.clouds.splice(i, 1);
      }
    }
  }

  private explode(n: Grenade): void {
    this.audio.sfx('explosion', n.x, n.y);
    this.ev.onNoise(n.x, n.y, 900);
    this.ev.onExplode(n.x, n.y, FRAG_RADIUS, FRAG_DAMAGE, n.faction);
  }

  private pop(n: Grenade): void {
    this.audio.sfx('smokepop', n.x, n.y);
    this.ev.onNoise(n.x, n.y, 160);
    const frames = anim('fx_smoke');
    const puffs: Cloud['puffs'] = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + Math.random() * 0.4;
      const r = 8 + Math.random() * 20;
      const s = new Sprite(frames[i % frames.length]);
      s.anchor.set(0.5);
      s.scale.set(2 + Math.random() * 1.2);
      s.tint = 0xb8b4ac;
      s.alpha = 0;
      this.container.addChild(s);
      puffs.push({ s, dx: Math.cos(a) * 4, dy: Math.sin(a) * 3, vx: Math.cos(a) * r * 2.6, vy: Math.sin(a) * r * 1.8, phase: Math.random() * 6 });
    }
    this.clouds.push({ x: n.x, y: n.y, t: 0, puffs });
  }

  clear(): void {
    for (const n of this.list) n.sprite.destroy();
    for (const c of this.clouds) for (const p of c.puffs) p.s.destroy();
    this.list = [];
    this.clouds = [];
  }
}

/** Damage falloff for a frag at distance d with clear line of sight. */
export function fragDamage(map: TileMap, x: number, y: number, tx: number, ty: number, radius: number, damage: number): number {
  const d = Math.hypot(tx - x, ty - y);
  if (d > radius) return 0;
  if (!hasLineOfSight(map, x, y - 4, tx, ty - 6)) return 0;
  const k = 1 - d / radius;
  return damage * k * k * 0.85 + (d < 30 ? damage * 0.15 : 0);
}

function segDist(x0: number, y0: number, x1: number, y1: number, px: number, py: number): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - x0) * dx + (py - y0) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x0 + dx * t - px, y0 + dy * t - py);
}
