import { describe, expect, it } from 'vitest';
import atlasJson from '../../public/assets/sprites.json';
import { ITEMS } from './items';
import { WEAPONS } from './weapons';

const atlas = atlasJson as { frames: Record<string, unknown> };

describe('atlas', () => {
  it('has an icon for every item', () => {
    for (const d of Object.values(ITEMS)) expect(atlas.frames[d.icon], d.id).toBeDefined();
  });
  it('has a sprite for every weapon', () => {
    for (const w of Object.values(WEAPONS)) expect(atlas.frames[w.sprite], w.id).toBeDefined();
  });
});
