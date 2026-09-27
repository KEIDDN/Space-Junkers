import { describe, expect, it } from 'vitest';
import { RadioCoach, type CoachFacts } from './coach';

const calm: CoachFacts = {
  elapsed: 0, unseenNear: Infinity, suspected: false, fighting: false, kills: 0, searched: 0,
  hp: 1, bleeding: false, haul: 0, left: 1200, onExit: false,
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

  it('stays silent while nothing is happening', () => {
    expect(runFor(new RadioCoach(), { ...calm, elapsed: 1 }, 1)).toEqual([]);
  });
});
