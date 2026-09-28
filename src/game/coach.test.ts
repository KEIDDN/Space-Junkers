import { describe, expect, it } from 'vitest';
import { RadioCoach, type CoachFacts } from './coach';

const calm: CoachFacts = {
  elapsed: 0, unseenNear: Infinity, suspected: false, fighting: false, kills: 0, searched: 0,
  hp: 1, bleeding: false, haul: 0, left: 1200, onExit: false, extractPaused: false,
};

function runFor(c: RadioCoach, f: CoachFacts, seconds: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < seconds; t += 0.1) {
    const l = c.step(0.1, f);
    if (l) out.push(l.id);
  }
  return out;
}

describe('radio coach', () => {
  it('says each line once, when it becomes true, and never talks over itself', () => {
    const c = new RadioCoach();
    expect(runFor(c, { ...calm, elapsed: 3 }, 1)).toEqual(['down']);
    // Two things become true at once: the second waits for the gap.
    const f = { ...calm, elapsed: 20, unseenNear: 200, suspected: true };
    expect(runFor(c, f, 5)).toEqual([]);
    expect(runFor(c, f, 10)).toEqual(['hear', 'suspect']);
    expect(runFor(c, f, 30)).toEqual([]);
  });

  it('teaches the key at the moment it matters (functional lines carry a glyph token)', () => {
    const c = new RadioCoach();
    runFor(c, { ...calm, elapsed: 3 }, 1);
    expect(runFor(c, { ...calm, elapsed: 20, kills: 1 }, 10)).toEqual(['kill']);
    const all = [
      ...runFor(c, { ...calm, elapsed: 30, kills: 1, searched: 1 }, 10),
      ...runFor(c, { ...calm, elapsed: 40, kills: 1, searched: 1, bleeding: true }, 10),
      ...runFor(c, { ...calm, elapsed: 40, onExit: true, extractPaused: true }, 20),
    ];
    expect(all).toEqual(['search', 'hurt', 'hold', 'pad']);
  });

  it('stays silent while nothing is happening', () => {
    expect(runFor(new RadioCoach(), { ...calm, elapsed: 1 }, 1)).toEqual([]);
  });

  it('talks the first job through: the site when it is close, and the choice once the part is in the bag', () => {
    const c = new RadioCoach();
    runFor(c, { ...calm, elapsed: 3 }, 1);
    expect(runFor(c, { ...calm, elapsed: 20, nearSite: true, fighting: true }, 10)).toEqual(['fight']);
    expect(runFor(c, { ...calm, elapsed: 30, nearSite: true }, 10)).toEqual(['site']);
    expect(runFor(c, { ...calm, elapsed: 40, hasPart: true }, 10)).toEqual(['part']);
  });
});
