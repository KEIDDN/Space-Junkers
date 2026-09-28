import { describe, expect, it } from 'vitest';
import { planEvents } from './events';

describe('raid events', () => {
  it('are sparse: most raids get one, some none, a few two, never more', () => {
    const counts = [0, 0, 0, 0];
    for (let seed = 1; seed <= 1000; seed++) counts[planEvents(seed, 20 * 60).length]++;
    expect(counts[3]).toBe(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[1]).toBeGreaterThan(counts[2]);
    expect(counts[0]).toBeGreaterThan(150);
  });

  it('leave the opening and the way out alone, and never pile up', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const ev = planEvents(seed, 18 * 60);
      for (const e of ev) {
        expect(e.at).toBeGreaterThanOrEqual(90);
        expect(e.at).toBeLessThanOrEqual(18 * 60 - 240);
      }
      if (ev.length === 2) {
        expect(ev[1].at - ev[0].at).toBeGreaterThanOrEqual(150);
        expect(ev[0].kind).not.toBe(ev[1].kind);
      }
    }
  });

  it('are deterministic per seed, and spare an operator still learning', () => {
    expect(planEvents(77, 1200)).toEqual(planEvents(77, 1200));
    for (let seed = 1; seed <= 50; seed++) expect(planEvents(seed, 1200, true)).toEqual([]);
    expect(planEvents(5, Infinity)).toEqual([]);
  });
});
