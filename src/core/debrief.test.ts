import { describe, expect, it } from 'vitest';
import { deathCause, deathLesson, haulMeaning, type DeathFacts } from './debrief';

const base: DeathFacts = { by: 'a raider\'s TOZ-12 Pump', bled: false, mia: false, room: 'WORKSHOP', zone: 'working', elapsed: 400, shots: 10, carried: 300 };

describe('after-action debrief', () => {
  it('says who, how and where', () => {
    expect(deathCause(base)).toBe('KILLED BY A RAIDER\'S TOZ-12 PUMP · WORKSHOP');
    expect(deathCause({ ...base, zone: 'deep' })).toContain('(DEEP SECTOR)');
    expect(deathCause({ ...base, bled: true })).toMatch(/^BLED OUT AFTER/);
    expect(deathCause({ ...base, mia: true })).toContain('ORBIT WINDOW');
  });

  it('draws the lesson from what actually went wrong, most telling first', () => {
    expect(deathLesson({ ...base, mia: true })).toMatch(/five minutes/);
    expect(deathLesson({ ...base, bled: true, shots: 200 })).toMatch(/bandage/i);
    expect(deathLesson({ ...base, zone: 'deep', carried: 2400 })).toMatch(/2,400 KR on you and kept going deeper/);
    expect(deathLesson({ ...base, shots: 90 })).toMatch(/90 rounds/);
    expect(deathLesson({ ...base, zone: 'deep' })).toMatch(/fewer people come back/);
    expect(deathLesson({ ...base, elapsed: 40 })).toMatch(/Listen first/);
    expect(deathLesson(base)).toMatch(/corner/);
  });

  it('turns a haul into fuel, the unit the ship thinks in', () => {
    expect(haulMeaning(0, 250)).toMatch(/Nothing found/);
    expect(haulMeaning(300, 250)).toMatch(/Not a jump/);
    expect(haulMeaning(500, 250)).toMatch(/a jump of fuel/);
    expect(haulMeaning(2300, 250)).toMatch(/5 jumps/); // 2,300 of salvage fetches about 1,265 at a counter
    expect(haulMeaning(9000, 250, 1)).toMatch(/36 jumps/);
  });
});
