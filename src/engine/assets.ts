import { Assets, Spritesheet, Texture, TextureStyle } from 'pixi.js';

/**
 * Central texture access. Two atlases: the world and its items (tools/build_assets.py)
 * and the layered characters (tools/build_characters.py). Loaded once and cached by
 * Pixi's Assets for the whole session.
 */
let sheet: Spritesheet | null = null;
let chars: Spritesheet | null = null;

export async function loadAssets(): Promise<void> {
  if (sheet && chars) return;
  // Pixel art: never filter.
  TextureStyle.defaultOptions.scaleMode = 'nearest';
  const base = import.meta.env.BASE_URL;
  [sheet, chars] = await Promise.all([
    Assets.load<Spritesheet>(`${base}assets/sprites.json`),
    Assets.load<Spritesheet>(`${base}assets/chars.json`),
  ]);
}

export function tex(name: string): Texture {
  const t = sheet?.textures[name] ?? chars?.textures[name];
  if (!t) throw new Error(`Missing texture "${name}"`);
  return t;
}

/** Is there an animation by this name (optional variants)? */
export function hasAnim(name: string): boolean {
  return !!(sheet?.animations[name] ?? chars?.animations[name]);
}

export function anim(name: string): Texture[] {
  const a = sheet?.animations[name] ?? chars?.animations[name];
  if (!a) throw new Error(`Missing animation "${name}"`);
  return a;
}
