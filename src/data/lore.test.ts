import { describe, expect, it } from 'vitest';
import { loreEntry, lorePool } from './lore';
import { THEMES } from './themes';

describe('lore', () => {
  it('never repeats an entry within a raid', () => {
    for (const id of Object.keys(THEMES)) {
      const pool = lorePool(id);
      for (let seed = 0; seed < 50; seed++) {
        const seen = new Set(Array.from({ length: pool.length }, (_, n) => loreEntry(id, seed, n).title));
        expect(seen.size).toBe(pool.length);
      }
    }
  });
  it('keeps entries short enough for the terminal screen', () => {
    for (const id of Object.keys(THEMES)) {
      for (const e of lorePool(id)) {
        expect(e.lines.length, e.title).toBeLessThanOrEqual(5);
        for (const l of e.lines) expect(l.length, e.title).toBeLessThanOrEqual(110);
      }
    }
  });
});
