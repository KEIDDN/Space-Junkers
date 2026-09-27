import { Container, Graphics, RenderTexture, Sprite, Texture, type Renderer } from 'pixi.js';
import { TILE, VIEW_H, VIEW_W } from '../../engine/config';
import { hasLineOfSight } from '../world/collision';
import type { LightDef, TileMap } from '../world/tilemap';
import { visibilityPolygon } from '../world/visibility';

const FLASHLIGHT_RANGE = 280;
const FLASHLIGHT_HALF_ANGLE = (27 * Math.PI) / 180;
const PERSONAL_RADIUS = 72;
const PLAYER_VIEW_RADIUS = 420;
/** Light buffer resolution relative to the view. Half-res is 4x cheaper and still pixel-chunky. */
const LIGHT_SCALE = 0.5;

interface StaticLight {
  def: LightDef;
  sprite: Sprite;
  /** Flicker state machine: steady stretches, then a stutter of quick toggles. */
  on: boolean;
  timer: number;
  burst: number;
  phase: number;
}

interface FlashLight {
  sprite: Sprite;
  /** Walls stop a muzzle flash: it lights the room it happens in, not the next one. */
  mask: Graphics;
  life: number;
  maxLife: number;
  intensity: number;
}

/**
 * 2D lighting via a light buffer: each frame the scene's lights are drawn into a
 * screen-sized render texture (ambient base + additive lights) which is multiplied
 * over the world. Static lights are occluded once at load (baked into their own
 * textures); the player's light is occluded every frame with a visibility polygon.
 */
export class Lighting {
  /** Multiply this over the lit world layer. */
  readonly overlay: Sprite;
  flashlightOn = true;

  private rt: RenderTexture;
  private base: Sprite;
  private scene = new Container();
  private world = new Container();
  private statics: StaticLight[] = [];
  private flashes: FlashLight[] = [];
  private playerMask = new Graphics();
  private playerLights = new Container();
  private cone: Sprite;
  private personal: Sprite;
  private poly: number[] = [];
  private flashPoly: number[] = [];
  private levels: Float32Array;
  private px = 0;
  private py = 0;
  private aim = 0;

  /**
   * @param brightness player preference: lifts the ambient floor (1 = as designed).
   */
  constructor(private renderer: Renderer, private map: TileMap, brightness = 1) {
    this.rt = RenderTexture.create({ width: VIEW_W * LIGHT_SCALE, height: VIEW_H * LIGHT_SCALE });
    this.overlay = new Sprite(this.rt);
    this.overlay.blendMode = 'multiply';
    this.overlay.scale.set(1 / LIGHT_SCALE);
    this.scene.scale.set(LIGHT_SCALE);

    this.base = new Sprite(Texture.WHITE);
    this.base.width = VIEW_W;
    this.base.height = VIEW_H;
    this.setBrightness(brightness);
    this.scene.addChild(this.base, this.world);

    this.levels = new Float32Array(map.width * map.height);
    for (const def of map.lights) this.addStatic(def);

    this.personal = new Sprite(radialTexture());
    this.personal.anchor.set(0.5);
    this.personal.blendMode = 'add';
    this.cone = new Sprite(coneTexture());
    this.cone.anchor.set(0, 0.5);
    this.cone.blendMode = 'add';
    this.cone.tint = 0xfff0d2;
    this.cone.scale.set(FLASHLIGHT_RANGE / CONE_LEN);
    this.playerLights.addChild(this.personal, this.cone);
    this.playerLights.mask = this.playerMask;
    this.world.addChild(this.playerLights, this.playerMask);
  }

  /** Lift or lower the ambient floor (player preference). */
  setBrightness(brightness: number): void {
    const amb = Math.min(1, this.map.ambient * brightness);
    this.base.tint = rgb(amb * 0.85, amb * 0.92, amb * 1.2);
  }

  /** 0..1 static light at a world position (from lamps, not the player). */
  levelAt(x: number, y: number): number {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(y / TILE);
    if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) return 0;
    return this.levels[ty * this.map.width + tx];
  }

  /** Is this point lit by the player's own light (flashlight cone or personal glow)? */
  litByPlayer(x: number, y: number): boolean {
    const dx = x - this.px;
    const dy = y - this.py;
    const d = Math.hypot(dx, dy);
    if (d < PERSONAL_RADIUS * (this.flashlightOn ? 0.9 : 0.7)) return true;
    if (!this.flashlightOn || d > FLASHLIGHT_RANGE * 0.95) return false;
    let diff = Math.atan2(dy, dx) - this.aim;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return Math.abs(diff) < FLASHLIGHT_HALF_ANGLE;
  }

  /** Short light burst (muzzle flashes, explosions). Not occluded, as it's too brief to notice. */
  flash(x: number, y: number, radius: number, color: number, intensity: number, life = 0.06): void {
    let f = this.flashes.find((q) => q.life <= 0);
    if (!f) {
      const sprite = new Sprite(radialTexture());
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      const mask = new Graphics();
      sprite.mask = mask;
      this.world.addChild(sprite, mask);
      f = { sprite, mask, life: 0, maxLife: 0, intensity: 0 };
      this.flashes.push(f);
    }
    visibilityPolygon(this.map, x, y, radius, FLASH_RAYS, 10, this.flashPoly);
    f.mask.clear().poly(this.flashPoly).fill({ color: 0xffffff });
    f.mask.visible = true;
    f.sprite.visible = true;
    f.sprite.position.set(x, y);
    f.sprite.scale.set((radius * 2) / RADIAL_SIZE);
    f.sprite.tint = color;
    f.life = f.maxLife = life;
    f.intensity = intensity;
  }

  update(dt: number, camLeft: number, camTop: number, px: number, py: number, aim: number): void {
    this.px = px;
    this.py = py;
    this.aim = aim;
    this.world.position.set(-camLeft, -camTop);

    for (const s of this.statics) {
      const d = s.def;
      let level = 1;
      if (d.style === 'pulse') {
        s.phase += dt;
        level = 0.55 + 0.45 * Math.sin(s.phase * 2.1);
      } else if (d.flicker) {
        // A dying tube: holds for a while, then stutters a few times.
        s.timer -= dt;
        if (s.timer <= 0) {
          if (s.burst > 0) {
            s.burst--;
            s.on = !s.on;
            s.timer = s.on ? 0.05 + Math.random() * 0.12 : 0.04 + Math.random() * 0.08;
          } else {
            // Long steady stretches between stutters: a tube failing, not a strobe.
            s.on = true;
            s.burst = 2 + Math.floor(Math.random() * 3) * 2;
            s.timer = 4 + Math.random() * 10;
          }
        }
        // The tube never goes fully dark: the filaments glow on through a stutter.
        level = s.on ? 1 : 0.32;
      }
      s.sprite.alpha = d.intensity * level;
      // Cull offscreen lights.
      s.sprite.visible = d.x + d.radius > camLeft && d.x - d.radius < camLeft + VIEW_W
        && d.y + d.radius > camTop && d.y - d.radius < camTop + VIEW_H;
    }

    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      f.sprite.alpha = f.intensity * Math.max(0, f.life / f.maxLife);
      if (f.life <= 0) f.sprite.visible = f.mask.visible = false;
    }

    // Player light, occluded by walls.
    visibilityPolygon(this.map, px, py, PLAYER_VIEW_RADIUS, 200, 14, this.poly);
    this.playerMask.clear().poly(this.poly).fill({ color: 0xffffff });
    this.personal.position.set(px, py - 8);
    const pr = this.flashlightOn ? PERSONAL_RADIUS : PERSONAL_RADIUS * 0.8;
    this.personal.scale.set((pr * 2) / RADIAL_SIZE);
    this.personal.alpha = this.flashlightOn ? 0.42 : 0.26;
    this.personal.tint = 0xffe8cc;
    this.cone.visible = this.flashlightOn;
    this.cone.position.set(px, py - 8);
    this.cone.rotation = aim;
    this.cone.alpha = 0.9;

    this.renderer.render({ container: this.scene, target: this.rt, clear: true });
  }

  destroy(): void {
    // Baked light textures belong to this instance; collect them before the sprites go.
    // (Room fills share one texture, kept for the next run.)
    const baked = this.statics.filter((s) => !s.def.area).map((s) => s.sprite.texture);
    this.scene.destroy({ children: true });
    for (const t of baked) t.destroy(true);
    this.rt.destroy(true);
  }

  // ---------------------------------------------------------------------------

  private addStatic(def: LightDef): void {
    if (def.area) {
      this.addFill(def, def.area);
      return;
    }
    // Bake the occluded light into its own texture once. The shadows are cast from a few
    // points across the lamp and averaged: a real tube is not a point, so shadow edges
    // get a soft penumbra instead of a ruler-straight line.
    const size = Math.ceil(def.radius * 2);
    const tmp = new Container();
    for (const [ox, oy] of PENUMBRA) {
      const light = new Sprite(radialTexture());
      light.width = light.height = size;
      light.tint = def.color;
      light.alpha = 1 / PENUMBRA.length;
      light.blendMode = 'add';
      const mask = new Graphics();
      const pts = visibilityPolygon(this.map, def.x + ox, def.y + oy, def.radius, 240, 16);
      mask.poly(pts.map((v, i) => (i % 2 === 0 ? v - def.x : v - def.y) + def.radius)).fill({ color: 0xffffff });
      light.mask = mask;
      tmp.addChild(light, mask);
    }
    const rt = RenderTexture.create({ width: size, height: size });
    this.renderer.render({ container: tmp, target: rt, clear: true });
    tmp.destroy({ children: true });

    const sprite = new Sprite(rt);
    sprite.anchor.set(0.5);
    sprite.position.set(def.x, def.y);
    sprite.blendMode = 'add';
    this.world.addChild(sprite);
    this.statics.push({ def, sprite, on: true, timer: Math.random() * 4, burst: 0, phase: Math.random() * 6 });

    // Light levels per tile, for gameplay (who can be seen).
    const r = Math.ceil(def.radius / TILE);
    const ltx = Math.floor(def.x / TILE);
    const lty = Math.floor(def.y / TILE);
    for (let ty = lty - r; ty <= lty + r; ty++) {
      for (let tx = ltx - r; tx <= ltx + r; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) continue;
        const cx = tx * TILE + TILE / 2;
        const cy = ty * TILE + TILE / 2;
        const d = Math.hypot(cx - def.x, cy - def.y);
        if (d > def.radius || !hasLineOfSight(this.map, def.x, def.y, cx, cy)) continue;
        const i = ty * this.map.width + tx;
        this.levels[i] = Math.min(1, this.levels[i] + def.intensity * (1 - d / def.radius) * 1.4);
      }
    }
  }

  /** A room's bounce light: a feathered fill over its floor (see LightDef.area). */
  private addFill(def: LightDef, a: { x: number; y: number; w: number; h: number }): void {
    const sprite = new Sprite(fillTexture());
    sprite.position.set(a.x, a.y);
    sprite.width = a.w;
    sprite.height = a.h;
    sprite.tint = def.color;
    sprite.blendMode = 'add';
    this.world.addChild(sprite);
    this.statics.push({ def, sprite, on: true, timer: 0, burst: 0, phase: 0 });
    // Gameplay light levels: the fill is dimmer toward the edges, like the texture.
    const tx0 = Math.floor(a.x / TILE);
    const ty0 = Math.floor(a.y / TILE);
    for (let ty = ty0; ty * TILE < a.y + a.h; ty++) {
      for (let tx = tx0; tx * TILE < a.x + a.w; tx++) {
        if (tx < 0 || ty < 0 || tx >= this.map.width || ty >= this.map.height) continue;
        const nx = ((tx + 0.5) * TILE - a.x) / a.w * 2 - 1;
        const ny = ((ty + 0.5) * TILE - a.y) / a.h * 2 - 1;
        const k = Math.max(0, 1 - Math.hypot(nx * 0.7, ny * 0.7));
        const i = ty * this.map.width + tx;
        this.levels[i] = Math.min(1, this.levels[i] + def.intensity * k);
      }
    }
  }
}

/** Shadow-casting points across a lamp (px offsets): averaged for a soft penumbra. */
const PENUMBRA: [number, number][] = [[0, 0], [-5, 2], [5, 2], [0, 5]];
/** Rays cast for a muzzle flash's occlusion: coarse, it lasts a few frames. */
const FLASH_RAYS = 56;

function rgb(r: number, g: number, b: number): number {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

// --- Light textures (banded falloff keeps the pixel-art look) ------------------

const RADIAL_SIZE = 128;
const BANDS = 7;
let radialTex: Texture | null = null;

function radialTexture(): Texture {
  if (radialTex) return radialTex;
  const c = document.createElement('canvas');
  c.width = c.height = RADIAL_SIZE;
  const g = c.getContext('2d')!;
  const img = g.createImageData(RADIAL_SIZE, RADIAL_SIZE);
  const r = RADIAL_SIZE / 2;
  for (let y = 0; y < RADIAL_SIZE; y++) {
    for (let x = 0; x < RADIAL_SIZE; x++) {
      const d = Math.hypot(x + 0.5 - r, y + 0.5 - r) / r;
      const v = band(Math.pow(Math.max(0, 1 - d), 1.5));
      const i = (y * RADIAL_SIZE + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  radialTex = Texture.from(c);
  return radialTex;
}

const FILL_W = 64;
const FILL_H = 48;
let fillTex: Texture | null = null;

/** Room fill: brightest in the middle, rolling off softly well before the walls. */
function fillTexture(): Texture {
  if (fillTex) return fillTex;
  const c = document.createElement('canvas');
  c.width = FILL_W;
  c.height = FILL_H;
  const g = c.getContext('2d')!;
  const img = g.createImageData(FILL_W, FILL_H);
  const feather = (t: number) => Math.min(1, t / 0.16);
  for (let y = 0; y < FILL_H; y++) {
    for (let x = 0; x < FILL_W; x++) {
      const u = (x + 0.5) / FILL_W;
      const v = (y + 0.5) / FILL_H;
      const edge = feather(Math.min(u, 1 - u)) * feather(Math.min(v, 1 - v));
      const centre = 1 - Math.min(1, Math.hypot((u - 0.5) * 1.3, (v - 0.55) * 1.3));
      const k = band(edge * (0.35 + 0.65 * centre));
      const i = (y * FILL_W + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(k * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  fillTex = Texture.from(c);
  fillTex.source.scaleMode = 'linear';
  return fillTex;
}

const CONE_LEN = 128;
let coneTex: Texture | null = null;

function coneTexture(): Texture {
  if (coneTex) return coneTex;
  const half = Math.ceil(Math.tan(FLASHLIGHT_HALF_ANGLE) * CONE_LEN) + 2;
  const c = document.createElement('canvas');
  c.width = CONE_LEN;
  c.height = half * 2;
  const g = c.getContext('2d')!;
  const img = g.createImageData(c.width, c.height);
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < CONE_LEN; x++) {
      const dx = x + 0.5;
      const dy = y + 0.5 - half;
      const d = Math.hypot(dx, dy) / CONE_LEN;
      const ang = Math.abs(Math.atan2(dy, dx)) / FLASHLIGHT_HALF_ANGLE;
      let v = 0;
      if (ang < 1 && d < 1) {
        const edge = Math.min(1, (1 - ang) * 3.5);
        const near = Math.min(1, d * 6); // don't blow out right at the lens
        v = band(Math.pow(1 - d, 0.9) * edge * (0.55 + 0.45 * near));
      }
      const i = (y * c.width + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.round(v * 255);
      img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  coneTex = Texture.from(c);
  return coneTex;
}

function band(v: number): number {
  return Math.ceil(v * BANDS) / BANDS * (v > 0.02 ? 1 : 0);
}
