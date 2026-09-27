import { Texture } from 'pixi.js';
import type { WeaponArchetype } from '../../data/weapons';

/**
 * Muzzle flashes drawn pixel by pixel, one look per weapon type, so a shotgun blast and a
 * pistol pop are different shapes rather than one sprite scaled. Each has a few frames
 * that are picked at random per shot. The muzzle is at the left edge, vertically centred.
 */

const WHITE = '#fffbe8';
const YELLOW = '#ffe07a';
const ORANGE = '#ff9a3a';
const RED = '#d24a1e';

type Painter = (px: (x: number, y: number, c: string) => void, v: number) => void;

interface FlashShape {
  w: number;
  h: number;
  paint: Painter;
}

/** Fill a horizontal cone from x0 to x1 whose half-height goes from h0 to h1. */
function cone(px: (x: number, y: number, c: string) => void, cy: number, x0: number, x1: number, h0: number, h1: number, c: string, jag = 0, seed = 1): void {
  for (let x = x0; x <= x1; x++) {
    const k = (x - x0) / Math.max(1, x1 - x0);
    const hh = Math.round(h0 + (h1 - h0) * k + (jag ? ((x * 7 + seed * 13) % 3) - 1 : 0) * jag);
    for (let y = -hh; y <= hh; y++) px(x, cy + y, c);
  }
}

const SHAPES: Record<WeaponArchetype, FlashShape> = {
  // A tight star: short forward tongue and two little whiskers.
  pistol: {
    w: 9, h: 7,
    paint: (px, v) => {
      cone(px, 3, 0, 6 + v, 2, 0, ORANGE);
      cone(px, 3, 0, 4 + v, 1, 0, YELLOW);
      px(0, 3, WHITE); px(1, 3, WHITE); px(2, 3, WHITE);
      px(2, 0 + v, ORANGE); px(2, 6 - v, ORANGE);
    },
  },
  // Flickering cone; alternates long/short so full-auto strobes.
  smg: {
    w: 11, h: 7,
    paint: (px, v) => {
      const len = v === 0 ? 9 : 6;
      cone(px, 3, 0, len, 2, 0, ORANGE, 1, v);
      cone(px, 3, 0, len - 3, 1, 0, YELLOW);
      px(0, 3, WHITE); px(1, 3, WHITE);
    },
  },
  // Long forward flame with side ports from a muzzle brake.
  rifle: {
    w: 15, h: 11,
    paint: (px, v) => {
      cone(px, 5, 1, 12 + v, 2, 0, ORANGE, 1, v);
      cone(px, 5, 1, 8 + v, 1, 0, YELLOW);
      for (let x = 0; x < 4; x++) px(x, 5, WHITE);
      // Side blasts
      cone(px, 5, 1, 2, 5 - v, 5 - v, RED);
      for (let y = 1; y < 4; y++) { px(1, 5 - y - 1, ORANGE); px(1, 5 + y + 1, ORANGE); }
      px(2, 2, YELLOW); px(2, 8, YELLOW);
    },
  },
  // Wide, short, roaring bloom with sparks of unburnt powder.
  shotgun: {
    w: 15, h: 13,
    paint: (px, v) => {
      cone(px, 6, 0, 11 + v, 2, 6, RED, 1, v);
      cone(px, 6, 0, 9 + v, 2, 4, ORANGE, 1, v + 2);
      cone(px, 6, 0, 6, 1, 2, YELLOW);
      for (let x = 0; x < 4; x++) { px(x, 6, WHITE); px(x, 5, WHITE); px(x, 7, WHITE); }
      px(13 + v, 2, ORANGE); px(12, 10 - v, ORANGE); px(14, 6 + v, YELLOW);
    },
  },
  // A lance of fire and big brake blasts to the sides: you feel this one.
  marksman: {
    w: 20, h: 15,
    paint: (px, v) => {
      cone(px, 7, 1, 17 + v, 2, 0, ORANGE, 1, v);
      cone(px, 7, 1, 12 + v, 1, 0, YELLOW);
      for (let x = 0; x < 6; x++) px(x, 7, WHITE);
      cone(px, 7, 1, 3, 7, 7, RED);
      for (let y = 1; y < 6; y++) { px(2, 7 - y - 1, ORANGE); px(2, 7 + y + 1, ORANGE); }
      for (let y = 1; y < 4; y++) { px(3, 7 - y - 1, YELLOW); px(3, 7 + y + 1, YELLOW); }
    },
  },
};

const FRAMES = 2;
const cache = new Map<WeaponArchetype, Texture[]>();

/** The flash frames for a weapon type (built once). */
export function flashFrames(kind: WeaponArchetype): Texture[] {
  let frames = cache.get(kind);
  if (frames) return frames;
  const shape = SHAPES[kind];
  frames = [];
  for (let v = 0; v < FRAMES; v++) {
    const c = document.createElement('canvas');
    c.width = shape.w + 2;
    c.height = shape.h;
    const g = c.getContext('2d')!;
    shape.paint((x, y, color) => {
      if (x < 0 || y < 0 || x >= c.width || y >= c.height) return;
      g.fillStyle = color;
      g.fillRect(x, y, 1, 1);
    }, v);
    const t = Texture.from(c);
    t.source.scaleMode = 'nearest';
    frames.push(t);
  }
  cache.set(kind, frames);
  return frames;
}

/** Vertical centre (the muzzle row) of a weapon type's flash texture, in pixels. */
export function flashCentre(kind: WeaponArchetype): number {
  return Math.floor(SHAPES[kind].h / 2);
}
