import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../data/weapons';
import { FALLOFF } from './fire';
import { damageAt, type Falloff } from './projectiles';

const at = (damage: number, range: number, travelled: number, falloff: Falloff | null) => damageAt({ damage, range, travelled, falloff });

describe('damage over distance: each gun has a range it belongs at', () => {
  it('rifles carry their damage all the way', () => {
    const w = WEAPONS.akr74;
    expect(FALLOFF[w.archetype]).toBeUndefined();
    expect(at(w.damage, w.range, w.range * 0.95, null)).toBe(w.damage);
  });

  it('buckshot is murder across a table and a rumour across a hall', () => {
    const w = WEAPONS.toz12;
    const close = at(w.damage, w.range, 40, FALLOFF.pellet!) * w.pellets;
    const far = at(w.damage, w.range, w.range * 0.95, FALLOFF.pellet!) * w.pellets;
    expect(close).toBe(w.damage * w.pellets);
    expect(far).toBeLessThan(close * 0.4);
    // At the far end of a hall a pistol round lands harder than any one pellet.
    const pistolFar = at(WEAPONS.pm9.damage, WEAPONS.pm9.range, w.range * 0.95, FALLOFF.pistol!);
    expect(pistolFar).toBeGreaterThan(at(w.damage, w.range, w.range * 0.95, FALLOFF.pellet!));
  });

  it('pistol and SMG rounds tire past half their reach, never below their floor', () => {
    for (const id of ['pm9', 'kedr', 'ppd41'] as const) {
      const w = WEAPONS[id];
      const f = FALLOFF[w.archetype]!;
      expect(at(w.damage, w.range, w.range * 0.3, f)).toBe(w.damage);
      const end = at(w.damage, w.range, w.range, f);
      expect(end).toBeCloseTo(w.damage * f.min);
      expect(at(w.damage, w.range, w.range * 0.8, f)).toBeGreaterThan(end);
    }
  });
});
