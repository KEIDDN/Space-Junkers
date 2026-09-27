import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { anim } from '../../engine/assets';
import type { AudioService } from '../../engine/audio';
import { GUN_HEIGHT } from '../../engine/config';
import type { TileMap } from '../world/tilemap';

interface Particle {
  x: number;
  y: number;
  /** Height above the ground (drawn as upward offset). */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  color: number;
  size: number;
  gravity: number;
  drag: number;
  kind: 'spark' | 'blood' | 'casing' | 'dust';
  bounced: boolean;
}

interface Timed {
  sprite: Sprite;
  life: number;
  maxLife: number;
  vy: number;
}

const MAX_DECALS = 220;
const MAX_CASINGS = 160;
const GRAVITY = 520;

/**
 * Short-lived visual feedback: sparks, blood, shell casings, smoke, muzzle flashes,
 * plus persistent floor decals (blood pools, spent casings).
 * Particles are drawn with one Graphics object per frame.
 */
export class Effects {
  /** Floor decals, under actors. */
  readonly decals = new Container();
  /** Airborne effects affected by lighting (smoke, blood, casings). */
  readonly lit = new Container();
  /** Light-emitting effects drawn above the darkness (flashes, sparks). */
  readonly overlay = new Container();

  private particles: Particle[] = [];
  private gfx = new Graphics();
  private glowGfx = new Graphics();
  private timed: Timed[] = [];
  private casings: Sprite[] = [];
  private decalSprites: Container[] = [];

  constructor(private map: TileMap, private audio: AudioService) {
    this.lit.addChild(this.gfx);
    this.overlay.addChild(this.glowGfx);
  }

  muzzleFlash(x: number, y: number, angle: number, scale: number): void {
    // Light burst: briefly lights the floor around the shooter.
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.position.set(Math.round(x), Math.round(y));
    glow.scale.set(scale > 1 ? 2 : 1);
    glow.alpha = 0.55;
    this.overlay.addChild(glow);
    this.timed.push({ sprite: glow, life: 0.05, maxLife: 0.05, vy: 0 });

    const frames = anim('fx_flash');
    const s = new Sprite(frames[(Math.random() * frames.length) | 0]);
    s.anchor.set(0.1, 0.5);
    s.position.set(Math.round(x), Math.round(y));
    s.rotation = angle;
    s.scale.set(scale);
    this.overlay.addChild(s);
    this.timed.push({ sprite: s, life: 0.05, maxLife: 0.05, vy: 0 });
  }

  smoke(x: number, y: number, amount = 1): void {
    const frames = anim('fx_smoke');
    for (let i = 0; i < amount; i++) {
      const s = new Sprite(frames[(Math.random() * frames.length) | 0]);
      s.anchor.set(0.5);
      s.position.set(Math.round(x + (Math.random() - 0.5) * 6), Math.round(y + (Math.random() - 0.5) * 4));
      s.alpha = 0.35;
      this.lit.addChild(s);
      const life = 0.5 + Math.random() * 0.4;
      this.timed.push({ sprite: s, life, maxLife: life, vy: -14 });
    }
  }

  /** Bullet hitting a wall. (x, y) ground point, (nx, ny) surface normal. */
  wallImpact(x: number, y: number, nx: number, ny: number): void {
    for (let i = 0; i < 6; i++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2;
      const sp = 60 + Math.random() * 160;
      this.spawn({
        kind: 'spark', x, y, z: GUN_HEIGHT, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 40 + Math.random() * 80,
        life: 0.1 + Math.random() * 0.15, color: Math.random() < 0.5 ? 0xffd27a : 0xfff4d0, size: 1,
        gravity: GRAVITY * 0.6, drag: 5,
      });
    }
    for (let i = 0; i < 3; i++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 1.6;
      const sp = 15 + Math.random() * 30;
      this.spawn({
        kind: 'dust', x, y, z: GUN_HEIGHT, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: 10,
        life: 0.35 + Math.random() * 0.25, color: 0x6b625a, size: 2, gravity: 30, drag: 3,
      });
    }
  }

  /** Bullet hitting flesh, spraying in the bullet's direction. */
  bloodHit(x: number, y: number, dirX: number, dirY: number, amount: number): void {
    const base = Math.atan2(dirY, dirX);
    for (let i = 0; i < amount; i++) {
      const a = base + (Math.random() - 0.5) * 1.3;
      const sp = 40 + Math.random() * 140;
      this.spawn({
        kind: 'blood', x, y, z: GUN_HEIGHT - 2 + Math.random() * 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        vz: 20 + Math.random() * 60, life: 1.2, color: Math.random() < 0.5 ? 0x8a1616 : 0x5e0d0d,
        size: Math.random() < 0.3 ? 2 : 1, gravity: GRAVITY, drag: 2,
      });
    }
  }

  /** A frag going off: flash, fire, sparks, debris, smoke, and a scorch mark. */
  explosion(x: number, y: number): void {
    const glow = new Sprite(glowTexture());
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.position.set(Math.round(x), Math.round(y - 6));
    glow.scale.set(4);
    glow.alpha = 1;
    this.overlay.addChild(glow);
    this.timed.push({ sprite: glow, life: 0.16, maxLife: 0.16, vy: 0 });
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 260;
      this.spawn({
        kind: 'spark', x, y, z: 4 + Math.random() * 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: 60 + Math.random() * 180,
        life: 0.2 + Math.random() * 0.45, color: Math.random() < 0.4 ? 0xffe2a0 : Math.random() < 0.5 ? 0xff9a3a : 0xfff4d0, size: Math.random() < 0.3 ? 2 : 1,
        gravity: GRAVITY * 0.7, drag: 3,
      });
    }
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 20 + Math.random() * 70;
      this.spawn({
        kind: 'dust', x, y, z: 4, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7, vz: 20 + Math.random() * 40,
        life: 0.5 + Math.random() * 0.6, color: Math.random() < 0.5 ? 0x5a524a : 0x3a3530, size: 2, gravity: 40, drag: 2.5,
      });
    }
    this.smoke(x, y - 8, 5);
    const scorch = new Graphics();
    scorch.ellipse(0, 0, 18, 9).fill({ color: 0x0a0806, alpha: 0.55 });
    scorch.ellipse(0, 0, 10, 5).fill({ color: 0x050403, alpha: 0.6 });
    scorch.position.set(Math.round(x), Math.round(y));
    this.addDecal(scorch);
  }

  bloodPool(x: number, y: number, big: boolean): void {
    const frames = anim('fx_blood');
    const f = big ? frames[2] : frames[(Math.random() * 2) | 0];
    const s = new Sprite(f);
    s.anchor.set(0.5);
    s.position.set(Math.round(x), Math.round(y));
    s.scale.x = Math.random() < 0.5 ? -1 : 1;
    s.alpha = 0.85;
    this.addDecal(s);
  }

  /** Eject a spent casing sideways from the gun. */
  casing(x: number, y: number, aimAngle: number, color: number, shotgun: boolean): void {
    const side = Math.cos(aimAngle) >= 0 ? -1 : 1;
    const a = aimAngle + (Math.PI / 2) * side + (Math.random() - 0.5) * 0.6;
    const sp = 50 + Math.random() * 40;
    this.spawn({
      kind: 'casing', x, y, z: GUN_HEIGHT, vx: Math.cos(a) * sp - Math.cos(aimAngle) * 20,
      vy: Math.sin(a) * sp * 0.6, vz: 70 + Math.random() * 50, life: 3, color,
      size: shotgun ? 3 : 2, gravity: GRAVITY, drag: 1.5,
    });
  }

  update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      const drag = Math.exp(-p.drag * dt);
      p.vx *= drag;
      p.vy *= drag;
      const nx = p.x + p.vx * dt;
      const ny = p.y + p.vy * dt;
      // Particles don't pass through walls: stop horizontal motion on contact.
      if (this.map.isSolidAt(nx, ny)) {
        p.vx *= -0.3;
        p.vy *= -0.3;
      } else {
        p.x = nx;
        p.y = ny;
      }
      p.vz -= p.gravity * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) {
        p.z = 0;
        if (p.kind === 'casing' && !p.bounced && p.vz < -30) {
          p.bounced = true;
          p.vz *= -0.35;
          p.vx *= 0.5;
          p.vy *= 0.5;
          this.audio.sfx('casing', p.x, p.y);
          continue;
        }
        p.vz = 0;
        if (p.kind === 'blood') {
          this.floorPixel(p.x, p.y, p.color, p.size);
          this.removeParticle(i);
          continue;
        }
        if (p.kind === 'casing' && Math.abs(p.vx) + Math.abs(p.vy) < 6) {
          this.restCasing(p);
          this.removeParticle(i);
          continue;
        }
        if (p.kind === 'casing') {
          p.vx *= Math.exp(-6 * dt);
          p.vy *= Math.exp(-6 * dt);
        }
      }
      if (p.life <= 0) {
        if (p.kind === 'casing') this.restCasing(p);
        this.removeParticle(i);
      }
    }

    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.life -= dt;
      t.sprite.y += t.vy * dt;
      if (t.vy !== 0) t.sprite.alpha = 0.35 * Math.max(0, t.life / t.maxLife);
      if (t.life <= 0) {
        t.sprite.destroy();
        this.timed.splice(i, 1);
      }
    }

    const g = this.gfx;
    const glow = this.glowGfx;
    g.clear();
    glow.clear();
    for (const p of this.particles) {
      const alpha = p.kind === 'dust' ? Math.max(0, p.life * 2) : 1;
      const h = p.kind === 'casing' ? 1 : p.size;
      (p.kind === 'spark' ? glow : g).rect(Math.round(p.x), Math.round(p.y - p.z), p.size, h).fill({ color: p.color, alpha });
    }
  }

  clear(): void {
    this.particles.length = 0;
    for (const t of this.timed) t.sprite.destroy();
    this.timed.length = 0;
    this.decals.removeChildren().forEach((c) => c.destroy());
    this.casings.length = 0;
    this.decalSprites.length = 0;
    this.gfx.clear();
    this.glowGfx.clear();
  }

  // ---------------------------------------------------------------------------

  private spawn(p: Omit<Particle, 'bounced'>): void {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push({ ...p, bounced: false });
  }

  private removeParticle(i: number): void {
    const last = this.particles.pop()!;
    if (i < this.particles.length) this.particles[i] = last;
  }

  private restCasing(p: Particle): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = p.color;
    const vertical = Math.random() < 0.4;
    s.width = vertical ? 1 : p.size;
    s.height = vertical ? p.size : 1;
    s.position.set(Math.round(p.x), Math.round(p.y));
    this.decals.addChild(s);
    this.casings.push(s);
    if (this.casings.length > MAX_CASINGS) this.casings.shift()!.destroy();
  }

  private floorPixel(x: number, y: number, color: number, size: number): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = color;
    s.width = size;
    s.height = size;
    s.position.set(Math.round(x), Math.round(y));
    this.addDecal(s);
  }

  private addDecal(s: Container): void {
    this.decals.addChildAt(s, 0);
    this.decalSprites.push(s);
    if (this.decalSprites.length > MAX_DECALS) this.decalSprites.shift()!.destroy();
  }
}

let glowTex: Texture | null = null;

/** Stepped (banded) radial light so it stays in the pixel-art style. */
function glowTexture(): Texture {
  if (glowTex) return glowTex;
  const size = 64;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const bands = [[32, 0.12], [24, 0.2], [16, 0.35], [9, 0.6]] as const;
  for (const [r, a] of bands) {
    g.fillStyle = `rgba(255, 190, 110, ${a})`;
    for (let y = -r; y < r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      g.fillRect(size / 2 - w, size / 2 + y, w * 2, 1);
    }
  }
  glowTex = Texture.from(c);
  return glowTex;
}
