import { describe, expect, it } from 'vitest';
import atlasJson from '../../public/assets/sprites.json';
import charsJson from '../../public/assets/chars.json';
import { generateFacility } from '../game/world/facilityGen';
import { CREW } from './crew';
import { ENEMIES } from './enemies';
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


const chars = charsJson as { frames: Record<string, unknown>; animations: Record<string, string[]> };
const DIRS = [0, 1, 2, 3];

function hasSet(set: string, anims: string[]): void {
  for (const a of anims) {
    if (a === 'die') expect(chars.animations[`c:${set}:die`]?.length, `${set} die`).toBe(6);
    else for (const d of DIRS) expect(chars.animations[`c:${set}:${a}:${d}`]?.length, `${set} ${a} ${d}`).toBeGreaterThan(0);
  }
}

describe('character atlas', () => {
  const armed = ['hold', 'holdrun', 'holdidle', 'kneel', 'die'];
  it('has both operators, armed and aboard ship', () => {
    for (const op of ['m', 'f']) {
      hasSet(`op_${op}`, [...armed, 'walk', 'idle']);
    }
  });
  it('draws every helmet, armour and pack on both operators', () => {
    for (const d of Object.values(ITEMS)) {
      if (d.kind !== 'helmet' && d.kind !== 'armor' && d.kind !== 'backpack') continue;
      for (const op of ['m', 'f']) hasSet(`g_${d.id}_${op}`, [...armed, 'walk', 'idle']);
    }
  });
  it('has both looks of every enemy faction, with hit flashes', () => {
    for (const e of Object.values(ENEMIES)) {
      for (const v of ['a', 'b']) {
        hasSet(`en_${e.anim}_${v}`, armed);
        hasSet(`en_${e.anim}_${v}_h`, armed);
        expect(chars.animations[`c:en_${e.anim}_${v}:hold:2:w`], e.id).toBeDefined();
      }
    }
  });
  it('has every crew member with their station animations', () => {
    for (const c of Object.values(CREW)) hasSet(`crew_${c.sprite}`, ['walk', 'idle', 'spellcast', 'sit']);
  });
  it('points every animation at a real frame', () => {
    for (const [name, frames] of Object.entries(chars.animations)) {
      for (const f of frames) expect(chars.frames[f], name).toBeDefined();
    }
  });
});
