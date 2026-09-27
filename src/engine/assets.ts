import { Assets, Spritesheet, Texture, TextureStyle } from 'pixi.js';

/**
 * Central texture access. Everything comes from one atlas built by tools/build_assets.py.
 * Loaded once and cached by Pixi's Assets for the whole session.
 */
let sheet: Spritesheet | null = null;

export async function loadAssets(): Promise<void> {
  if (sheet) return;
  // Pixel art: never filter.
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  sheet = await Assets.load<Spritesheet>(`${import.meta.env.BASE_URL}assets/sprites.json`);
}

export function tex(name: string): Texture {
  const t = sheet?.textures[name];
  if (!t) throw new Error(`Missing texture "${name}"`);
  return t;
}

/** Is there an animation by this name (optional variants)? */
export function hasAnim(name: string): boolean {
  return !!sheet?.animations[name];
}

export function anim(name: string): Texture[] {
  const a = sheet?.animations[name];
  if (!a) throw new Error(`Missing animation "${name}"`);
  return a;
}
