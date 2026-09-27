import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { anim } from '../../engine/assets';
import type { AudioService } from '../../engine/audio';
import { GUN_HEIGHT } from '../../engine/config';
import type { WeaponArchetype } from '../../data/weapons';
import { flashCentre, flashFrames } from './flashes';
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
  kind: 'spark' | 'blood' | 'casing' | 'dust' | 'mag' | 'heal';
  /** Floor contacts so far (casings bounce twice, magazines once). */
  bounces: number;
  /** Tumble phase, for spinning casings. */
  spin: number;
}

interface Timed {
  sprite: Sprite;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  /** Scale growth per second (smoke billows). */
  grow: number;
  /** Starting alpha; fades to 0 over the life when > 0 (flashes keep theirs). */
  fade: number;
  /** Stays on a moving point (a muzzle that's recoiling), with an offset along it. */
  follow?: () => { x: number; y: number; angle: number };
  along?: number;
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

  /**
   * A shot's flash: a shaped pixel flame per weapon type and a tight hot glow.
   * (The floor light is the lighting system's job.)
   */
  muzzleFlash(x: number, y: number, angle: number, kind: WeaponArchetype, follow?: () => { x: number; y: number; angle: number }): void {
    const big = kind === 'shotgun' || kind === 'marksman';
    const glow = new Sprite(muzzleGlowTexture());
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.position.set(Math.round(x + Math.cos(angle) * 4), Math.round(y + Math.sin(angle) * 4));
    glow.scale.set(big ? 1.6 : kind === 'rifle' ? 1.15 : 0.85);
    glow.alpha = big ? 0.8 : 0.65;
    this.overlay.addChild(glow);
    const glowLife = big ? 0.06 : 0.04;
    this.timed.push({ sprite: glow, life: glowLife, maxLife: glowLife, vx: 0, vy: 0, grow: 0, fade: 0, follow, along: 4 });

    const frames = flashFrames(kind);
    const s = new Sprite(frames[(Math.random() * frames.length) | 0]);
    s.anchor.set(0, (flashCentre(kind) + 0.5) / s.texture.height);
    s.position.set(Math.round(x), Math.round(y));
    s.rotation = angle;
    // Flip the flame's asymmetric bits now and then so bursts don't repeat.
    if (Math.random() < 0.5) s.scale.y = -1;
    this.overlay.addChild(s);
    const life = big ? 0.055 : 0.04;
    this.timed.push({ sprite: s, life, maxLife: life, vx: 0, vy: 0, grow: 0, fade: 0, follow, along: 0 });
  }

  /**
   * Gun smoke: puffs pushed out along the barrel that slow, rise and spread.
   * @param angle direction the puffs are blown (the aim), or undefined for a plain rise.
   */
  smoke(x: number, y: number, amount = 1, angle?: number, push = 30): void {
    const frames = anim('fx_smoke');
    for (let i = 0; i < amount; i++) {
      const s = new Sprite(frames[(Math.random() * frames.length) | 0]);
      s.anchor.set(0.5);
      s.position.set(Math.round(x + (Math.random() - 0.5) * 6), Math.round(y + (Math.random() - 0.5) * 4));
      s.scale.set(0.6 + Math.random() * 0.3);
      s.alpha = 0.32;
      s.tint = 0xcfc8bc;
      this.lit.addChild(s);
      const life = 0.6 + Math.random() * 0.6;
      const sp = angle === undefined ? 0 : push * (0.6 + Math.random() * 0.8);
      this.timed.push({
        sprite: s, life, maxLife: life,
        vx: angle === undefined ? (Math.random() - 0.5) * 6 : Math.cos(angle) * sp,
        vy: (angle === undefined ? 0 : Math.sin(angle) * sp * 0.6) - 10 - Math.random() * 8,
        grow: 0.9, fade: 0.32,
      });
    }
  }

  /**
   * A round meeting a wall: chips and dust, a mark on the face if we can see it, and now
   * and then a ricochet singing off at a shallow angle.
   * @param dx, dy the bullet's direction (for ricochets); omit for armor hits.
   * @returns true if it ricocheted.
   */
  bulletWall(x: number, y: number, nx: number, ny: number, dx: number, dy: number): boolean {
    this.wallImpact(x, y, nx, ny);
    // Only south faces are drawn as walls with a face; mark them where the round struck.
    if (ny > 0.5) {
      const mark = new Graphics();
      mark.rect(0, 0, 2, 2).fill({ color: 0x100d0b });
      mark.rect(0, -1, 2, 1).fill({ color: 0x6f675c, alpha: 0.7 });
      mark.position.set(Math.round(x - 1), Math.round(y - GUN_HEIGHT + (Math.random() - 0.5) * 4));
      this.addDecal(mark);
    }
    const dot = dx * nx + dy * ny;
    if (Math.abs(dot) < 0.45 && Math.random() < 0.35) {
      // Reflect and send a hot streak off.
      const rx = dx - 2 * dot * nx;
      const ry = dy - 2 * dot * ny;
      for (let i = 0; i < 3; i++) {
        const sp = 260 + Math.random() * 120;
        const j = (Math.random() - 0.5) * 0.3;
        this.spawn({
          kind: 'spark', x, y, z: GUN_HEIGHT, vx: (rx + j) * sp, vy: (ry - j) * sp, vz: 10 + Math.random() * 30,
          life: 0.08 + Math.random() * 0.06, color: 0xfff4d0, size: 1, gravity: 50, drag: 1,
        });
      }
      this.audio.sfx('ricochet', x, y);
      return true;
    }
    return false;
  }

  /** Sparks and dust where something hard was hit. (x, y) ground point, (nx, ny) surface normal. */
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
    this.timed.push({ sprite: glow, life: 0.16, maxLife: 0.16, vx: 0, vy: 0, grow: 0, fade: 0 });
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

  /**
   * Eject a spent casing: up and back out of the port, tumbling, bouncing twice with a
   * tinkle before it settles. (x, y) is the ground point under the ejection port.
   * @param power 1 = a normal ejection, lower for shells that just drop out.
   */
  casing(x: number, y: number, aimAngle: number, color: number, shotgun: boolean, power = 1): void {
    // The port is on the gun's right: in this 3/4 view that flings brass toward the camera
    // and a little behind the shooter, so it lands in a loose scatter, not at the feet.
    const right = Math.cos(aimAngle) >= 0 ? 1 : -1;
    const a = aimAngle + (Math.PI / 2) * right + 0.45 * right + (Math.random() - 0.5) * 0.7;
    const sp = (45 + Math.random() * 45) * power;
    this.spawn({
      kind: 'casing', x, y, z: GUN_HEIGHT, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6,
      vz: (60 + Math.random() * 50) * (0.5 + power * 0.5), life: 3, color,
      size: shotgun ? 3 : 2, gravity: GRAVITY, drag: 1.2,
    });
  }

  /** A magazine falls out of the gun and clatters to the floor. */
  dropMag(x: number, y: number, aimAngle: number, length: number): void {
    const a = aimAngle + Math.PI / 2 * (Math.cos(aimAngle) >= 0 ? 1 : -1) * 0.3;
    this.spawn({
      kind: 'mag', x, y, z: GUN_HEIGHT - 4, vx: Math.cos(a) * 12, vy: 6 + Math.random() * 6, vz: 10,
      life: 4, color: 0x2a2724, size: length, gravity: GRAVITY, drag: 2,
    });
  }

  /** A shorting panel spitting sparks that fall and bounce. (x, y) is where they leave, in view space. */
  sparkBurst(x: number, y: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 90;
      this.spawn({
        kind: 'spark', x, y: y + 18, z: 18, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: 20 + Math.random() * 60,
        life: 0.25 + Math.random() * 0.35, color: Math.random() < 0.5 ? 0xd8f0ff : 0xfff4d0, size: 1, gravity: GRAVITY * 0.8, drag: 2,
      });
    }
  }

  /** A breath of steam from a pipe or tank, rising and thinning. */
  steam(x: number, y: number): void {
    const frames = anim('fx_smoke');
    for (let i = 0; i < 4; i++) {
      const s = new Sprite(frames[(Math.random() * frames.length) | 0]);
      s.anchor.set(0.5);
      s.position.set(Math.round(x + (Math.random() - 0.5) * 4), Math.round(y));
      s.scale.set(0.4 + Math.random() * 0.2);
      s.tint = 0xeef2f6;
      s.alpha = 0.3;
      this.lit.addChild(s);
      const life = 0.9 + Math.random() * 0.7;
      this.timed.push({ sprite: s, life, maxLife: life, vx: (Math.random() - 0.5) * 14, vy: -22 - Math.random() * 14 - i * 4, grow: 1.1, fade: 0.3 });
    }
  }

  /** A running boot kicks up a little grit. */
  stepDust(x: number, y: number, dir: number): void {
    for (let i = 0; i < 3; i++) {
      const a = dir + Math.PI + (Math.random() - 0.5) * 1.2;
      const sp = 12 + Math.random() * 18;
      this.spawn({
        kind: 'dust', x: x + (Math.random() - 0.5) * 4, y: y + 1, z: 1, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.5, vz: 8 + Math.random() * 10,
        life: 0.3 + Math.random() * 0.2, color: 0x6b625a, size: 1, gravity: 30, drag: 4,
      });
    }
  }

  /** A drop of blood from someone who's bleeding. */
  drip(x: number, y: number): void {
    this.floorPixel(Math.round(x + (Math.random() - 0.5) * 6), Math.round(y + Math.random() * 3), Math.random() < 0.5 ? 0x7a1212 : 0x5e0d0d, 1);
  }

  /** Treatment took: a few pale green motes rise off the body. */
  healPuff(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      this.spawn({
        kind: 'heal', x: x + (Math.random() - 0.5) * 12, y: y - 1, z: 6 + Math.random() * 16, vx: (Math.random() - 0.5) * 6, vy: 0,
        vz: 14 + Math.random() * 16, life: 0.6 + Math.random() * 0.5, color: Math.random() < 0.5 ? 0x9dffb0 : 0xe8fff0, size: 1,
        gravity: -10, drag: 1,
      });
    }
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
      if (p.kind === 'heal') {
        if (p.life <= 0) this.removeParticle(i);
        continue;
      }
      if (p.z <= 0) {
        p.z = 0;
        const maxBounces = p.kind === 'casing' ? 2 : p.kind === 'mag' ? 1 : 0;
        if (p.bounces < maxBounces && p.vz < -30) {
          p.bounces++;
          p.vz *= p.kind === 'mag' ? -0.25 : -0.4;
          p.vx *= 0.55;
          p.vy *= 0.55;
          p.spin += 1;
          this.audio.sfx(p.kind === 'mag' ? 'magdrop' : 'casing', p.x, p.y, p.bounces === 1 ? 1 : 0.5);
          continue;
        }
        p.vz = 0;
        if (p.kind === 'blood') {
          this.floorPixel(p.x, p.y, p.color, p.size);
          this.removeParticle(i);
          continue;
        }
        if ((p.kind === 'casing' || p.kind === 'mag') && Math.abs(p.vx) + Math.abs(p.vy) < 6) {
          this.restCasing(p);
          this.removeParticle(i);
          continue;
        }
        if (p.kind === 'casing' || p.kind === 'mag') {
          p.vx *= Math.exp(-6 * dt);
          p.vy *= Math.exp(-6 * dt);
        }
      } else if (p.kind === 'casing') {
        p.spin += dt * 22;
      }
      if (p.life <= 0) {
        if (p.kind === 'casing' || p.kind === 'mag') this.restCasing(p);
        this.removeParticle(i);
      }
    }

    for (let i = this.timed.length - 1; i >= 0; i--) {
      const t = this.timed[i];
      t.life -= dt;
      if (t.follow) {
        const m = t.follow();
        const k = t.along ?? 0;
        t.sprite.position.set(Math.round(m.x + Math.cos(m.angle) * k), Math.round(m.y + Math.sin(m.angle) * k));
        if (!k) t.sprite.rotation = m.angle;
      }
      if (t.vx || t.vy) {
        t.sprite.x += t.vx * dt;
        t.sprite.y += t.vy * dt;
        const k = Math.exp(-2.2 * dt);
        t.vx *= k;
        t.vy = t.vy * k - 6 * dt; // slows down, keeps rising
      }
      if (t.grow) t.sprite.scale.set(t.sprite.scale.x + t.grow * dt * Math.sign(t.sprite.scale.x || 1), t.sprite.scale.y + t.grow * dt);
      if (t.fade > 0) t.sprite.alpha = t.fade * Math.max(0, t.life / t.maxLife);
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
      const px = Math.round(p.x);
      const py = Math.round(p.y - p.z);
      if (p.kind === 'casing') {
        // Tumbling brass: alternates lying and standing, with a glint.
        const upright = (Math.floor(p.spin) & 1) === 1;
        const w = upright ? 1 : p.size;
        const h = upright ? p.size : 1;
        if (p.z > 0.5) g.rect(px, Math.round(p.y), w, 1).fill({ color: 0x000000, alpha: 0.35 });
        g.rect(px, py, w, h).fill({ color: p.color });
        g.rect(px, py, 1, 1).fill({ color: 0xfff0c0, alpha: 0.7 });
        continue;
      }
      if (p.kind === 'mag') {
        if (p.z > 0.5) g.rect(px, Math.round(p.y), 2, 1).fill({ color: 0x000000, alpha: 0.35 });
        g.rect(px, py, 2, p.size).fill({ color: p.color });
        g.rect(px, py, 2, 1).fill({ color: 0x5a544c });
        continue;
      }
      if (p.kind === 'heal') {
        const a = Math.min(1, p.life * 2);
        glow.rect(px, py - 1, 1, 3).fill({ color: p.color, alpha: a });
        glow.rect(px - 1, py, 3, 1).fill({ color: p.color, alpha: a });
        continue;
      }
      const alpha = p.kind === 'dust' ? Math.max(0, p.life * 2) : 1;
      (p.kind === 'spark' ? glow : g).rect(px, py, p.size, p.size).fill({ color: p.color, alpha });
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

  private spawn(p: Omit<Particle, 'bounces' | 'spin'>): void {
    if (this.particles.length > 600) this.particles.shift();
    this.particles.push({ ...p, bounces: 0, spin: Math.random() * 2 });
  }

  private removeParticle(i: number): void {
    const last = this.particles.pop()!;
    if (i < this.particles.length) this.particles[i] = last;
  }

  private restCasing(p: Particle): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = p.color;
    if (p.kind === 'mag') {
      s.width = p.size;
      s.height = 2;
    } else {
      const vertical = Math.random() < 0.4;
      s.width = vertical ? 1 : p.size;
      s.height = vertical ? p.size : 1;
    }
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

let muzzleGlowTex: Texture | null = null;

/** A small, hot, stepped glow for muzzle flashes. */
function muzzleGlowTexture(): Texture {
  if (muzzleGlowTex) return muzzleGlowTex;
  const size = 32;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const bands = [[16, 0.08, '255, 170, 90'], [11, 0.16, '255, 190, 110'], [6, 0.34, '255, 220, 150'], [3, 0.6, '255, 245, 210']] as const;
  for (const [r, a, rgb] of bands) {
    g.fillStyle = `rgba(${rgb}, ${a})`;
    for (let y = -r; y < r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y));
      g.fillRect(size / 2 - w, size / 2 + y, w * 2, 1);
    }
  }
  muzzleGlowTex = Texture.from(c);
  return muzzleGlowTex;
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
