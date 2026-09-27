import { describe, expect, it } from 'vitest';
import { ALL_LORE, LORE_BY_ID, THREADS, loreEntry, lorePool } from './lore';
import { CREW } from './crew';

describe('lore', () => {
  it('every entry has a unique id, a real thread and a real crew member to react', () => {
    const ids = ALL_LORE.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of ALL_LORE) {
      if (e.thread) expect(THREADS[e.thread], e.id).toBeDefined();
      if (e.react) expect(CREW[e.react.crew], e.id).toBeDefined();
    }
  });

  it('a raid never shows the same entry twice', () => {
    for (const dest of ['tikhaya', 'merzlota', 'krasnaya', 'kombinat', 'sirin']) {
      const n = lorePool(dest).length;
      for (let seed = 1; seed < 30; seed++) {
        const seen = new Set(Array.from({ length: n }, (_, i) => loreEntry(dest, seed, i).id));
        expect(seen.size, `${dest} ${seed}`).toBe(n);
      }
    }
  });

  it('threads unfold in order: early chapters and unread entries first', () => {
    for (let seed = 1; seed < 40; seed++) {
      const first = loreEntry('merzlota', seed, 0);
      expect(first.chapter ?? 1, `seed ${seed}`).toBe(1);
    }
    // Having read the early Blackout entry, its next chapter becomes eligible before the rest.
    const read = ['clocks'];
    const shown = Array.from({ length: 6 }, (_, i) => loreEntry('tikhaya', 7, i, read).id);
    expect(shown).not.toContain('clocks');
    expect(LORE_BY_ID.blackout_protocol.chapter).toBe(2);
  });
});
