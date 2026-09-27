import { describe, expect, it } from 'vitest';
import { facilityName } from './themes';
import { PROLOGUE_DESTINATION, PROLOGUE_SEED, STEP_LINES, prologueStep } from './prologue';
import { CREW } from './crew';

describe('prologue', () => {
  it('walks locker, cockpit, airlock, then gets out of the way', () => {
    expect(prologueStep({})).toBeNull();
    expect(prologueStep({ started: true })).toBeNull();
    expect(prologueStep({ prologue: true })).toBe('kit');
    expect(prologueStep({ prologue: true, pro_kit: true })).toBe('job');
    expect(prologueStep({ prologue: true, pro_kit: true, pro_job: true })).toBe('airlock');
    expect(prologueStep({ prologue: true, pro_kit: true, pro_job: true, pro_done: true })).toBeNull();
  });

  it('sends the operator to Zarya-7, and only real crew speak', () => {
    expect(facilityName(PROLOGUE_DESTINATION, PROLOGUE_SEED)).toContain('ZARYA-7');
    for (const lines of Object.values(STEP_LINES)) for (const l of lines) expect(CREW[l.who], l.text).toBeDefined();
  });
});
