import { describe, expect, it } from 'vitest';
import { LAST_MINUTE, LOW_HP, exitMoments, raidStory } from './story';

describe('the raid, told back', () => {
  it('in the order it happened, once per kind', () => {
    const s = raidStory([{ kind: 'blackout' }, { kind: 'forced' }, { kind: 'blackout' }]);
    expect(s).toEqual(['The reserve dipped and the lights went out.', 'You forced a shutter, and it was heard.']);
  });

  it('how it ended always makes the cut, at the end', () => {
    const s = raidStory([
      { kind: 'nine' }, { kind: 'forced' }, { kind: 'seal' }, { kind: 'patrol' }, { kind: 'gunfire' },
      { kind: 'hunted' }, { kind: 'lastMinute', n: 48 },
    ]);
    expect(s).toHaveLength(5);
    expect(s[3]).toMatch(/still coming/);
    expect(s[4]).toBe('You made it out with 0:48 left on the window.');
    expect(s[0]).toMatch(/Channel nine/);
    expect(s.join(' ')).not.toMatch(/patrol|somebody else/i);
  });

  it('says what was left behind, and what it was worth', () => {
    expect(raidStory([{ kind: 'leftBehind', n: 1850 }])[0]).toBe('You left 1,850 KR of something on the floor to make room.');
  });

  it('a quiet raid tells no story', () => {
    expect(raidStory([])).toEqual([]);
  });
});

describe('how the extraction went', () => {
  it('cutting it fine, hurt, chased', () => {
    expect(exitMoments({ timeLeft: 600, hpFrac: 1, hunted: false })).toEqual([]);
    const m = exitMoments({ timeLeft: LAST_MINUTE - 30, hpFrac: LOW_HP - 0.05, hunted: true }).map((x) => x.kind);
    expect(m).toEqual(['hunted', 'lastMinute', 'lowHp']);
    expect(exitMoments({ timeLeft: Infinity, hpFrac: 1, hunted: false })).toEqual([]);
  });
});
