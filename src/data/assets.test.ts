import { describe, expect, it } from 'vitest';
import atlasJson from '../../public/assets/sprites.json';
import { generateFacility } from '../game/world/facilityGen';
import { ITEMS } from './items';
import { CONTAINERS } from './loot';
import { THEMES } from './themes';
import { WEAPONS } from './weapons';

const atlas = atlasJson as { frames: Record<string, unknown> };

describe('atlas', () => {
  it('has an icon for every item', () => {
    for (const d of Object.values(ITEMS)) expect(atlas.frames[d.icon], d.id).toBeDefined();
  });
  it('has a sprite for every weapon', () => {
    for (const w of Object.values(WEAPONS)) expect(atlas.frames[w.sprite], w.id).toBeDefined();
  });
  it('has a sprite for every container', () => {
    for (const c of Object.values(CONTAINERS)) expect(atlas.frames[c.sprite], c.id).toBeDefined();
  });
  it('has every sprite a facility can place, for every theme', () => {
    for (const theme of Object.values(THEMES)) {
      expect(atlas.frames[theme.wall], theme.id).toBeDefined();
      for (const [floor] of theme.floor) expect(atlas.frames[`${floor}_2x`], floor).toBeDefined();
      for (let seed = 1; seed <= 25; seed++) {
        for (const p of generateFacility(seed, { theme }).props) expect(atlas.frames[p.sprite], `${theme.id} ${p.sprite}`).toBeDefined();
      }
    }
  });
});
