import { Container, Sprite, type Texture } from 'pixi.js';
import { anim, hasAnim } from '../../engine/assets';

/** Facing rows of the character sheets. */
export const DIR_UP = 0;
export const DIR_LEFT = 1;
export const DIR_DOWN = 2;
export const DIR_RIGHT = 3;
export type Dir = 0 | 1 | 2 | 3;

/** Character sheets are 64 px cells; the feet stand on this row. */
const FEET_Y = 62;
const CELL = 64;

/** Which of the four rows best faces this angle (radians, screen space). */
export function dirOf(angle: number, prev: Dir | null = null): Dir {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // A little hysteresis on the diagonals so the body doesn't flicker between rows.
  const bias = 0.12;
  if (prev !== null) {
    const keep = prev === DIR_RIGHT ? c : prev === DIR_LEFT ? -c : prev === DIR_DOWN ? s : -s;
    if (keep > Math.SQRT1_2 - bias) return prev;
  }
  if (Math.abs(c) >= Math.abs(s)) return c > 0 ? DIR_RIGHT : DIR_LEFT;
  return s > 0 ? DIR_DOWN : DIR_UP;
}

interface Layer {
  set: string;
  sprite: Sprite;
  cache: Map<string, Texture[] | null>;
}

/**
 * One character drawn as a stack of aligned sheets: a base body, then whatever is worn
 * (armour, pack, hair, helmet), all showing the same animation frame. Built by
 * tools/build_characters.py; animations are `c:<set>:<anim>:<dir>`.
 */
export class LayeredSprite {
  readonly container = new Container();
  private layers: Layer[] = [];
  private anim = '';
  private dir: Dir = DIR_DOWN;
  private frame = 0;
  private flash = false;

  constructor(sets: string[]) {
    this.setLayers(sets);
  }

  /** Replace what is worn. Unknown sets are skipped (nothing to draw for them). */
  setLayers(sets: string[]): void {
    const same = sets.length === this.layers.length && sets.every((s, i) => this.layers[i].set === s);
    if (same) return;
    const old = new Map(this.layers.map((l) => [l.set, l]));
    this.container.removeChildren();
    this.layers = [];
    for (const set of sets) {
      const reuse = old.get(set);
      const layer = reuse ?? { set, sprite: new Sprite(), cache: new Map() };
      if (!reuse) layer.sprite.anchor.set(0.5, FEET_Y / CELL);
      old.delete(set);
      this.layers.push(layer);
      this.container.addChild(layer.sprite);
    }
    for (const l of old.values()) l.sprite.destroy();
    this.apply();
  }

  get sets(): string[] {
    return this.layers.map((l) => l.set);
  }

  /** Frames of an animation for the base layer (the body), or null if it has none. */
  frames(name: string, dir: Dir | null): Texture[] | null {
    return this.layers.length ? this.lookup(this.layers[0], name, dir) : null;
  }

  has(name: string): boolean {
    return !!this.frames(name, DIR_DOWN) || !!this.frames(name, null);
  }

  show(name: string, dir: Dir, frame: number, flash = false): void {
    if (name === this.anim && dir === this.dir && frame === this.frame && flash === this.flash) return;
    this.anim = name;
    this.dir = dir;
    this.frame = frame;
    this.flash = flash;
    this.apply();
  }

  /**
   * How far the body's top sits below where it stands in `ref` (px). The torso rises and
   * falls through a walk; whatever the hands hold rides along with it.
   */
  torsoDrop(ref: string): number {
    const base = this.layers[0];
    if (!base) return 0;
    const now = base.sprite.texture;
    const r = this.lookup(base, ref, this.dir)?.[0];
    if (!r || !now?.trim || !r.trim) return 0;
    return now.trim.y - r.trim.y;
  }

  private apply(): void {
    const noDir = this.anim === 'die';
    for (const l of this.layers) {
      let frames = this.flash ? this.lookup(l, `${this.anim}`, noDir ? null : this.dir, true) : null;
      frames ??= this.lookup(l, this.anim, noDir ? null : this.dir);
      const t = frames?.[Math.min(this.frame, frames.length - 1)];
      l.sprite.visible = !!t;
      if (t) l.sprite.texture = t;
    }
  }

  private lookup(l: Layer, name: string, dir: Dir | null, flash = false): Texture[] | null {
    const key = `c:${l.set}:${name}${dir === null ? '' : `:${dir}`}${flash ? ':w' : ''}`;
    let v = l.cache.get(key);
    if (v === undefined) {
      v = hasAnim(key) ? anim(key) : null;
      l.cache.set(key, v);
    }
    return v;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
