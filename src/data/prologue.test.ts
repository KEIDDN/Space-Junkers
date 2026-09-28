import { describe, expect, it } from 'vitest';
import { facilityName } from './themes';
import { PROLOGUE_DESTINATION, PROLOGUE_SEED, STEP_LINES, prologueStep } from './prologue';
import { CREW } from './crew';
import { THEMES } from './themes';
import { generateFacility } from '../game/world/facilityGen';
import { accept, raidPlan } from '../core/quests';
import { newProfile } from '../core/profile';

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

  it('gives the first raid a reason: the pump regulator is on a wall in Zarya-7, mid-station', () => {
    const p = accept(newProfile(), 'fedya_first');
    const plan = raidPlan(p, PROLOGUE_DESTINATION);
    const map = generateFacility(PROLOGUE_SEED, { theme: THEMES.tikhaya, gentle: true, plan, enemies: { scavenger: 8, raider: 2 } });
    const site = map.sites.find((q) => q.id === 'regulator')!;
    expect(site).toBeDefined();
    const room = map.rooms.find((r) => site.tx >= r.x && site.tx < r.x + r.w && site.ty >= r.y && site.ty < r.y + r.h)!;
    expect(['reactor', 'workshop']).toContain(room.kind);
    expect(room.zone === 'working' || room.zone === 'restricted').toBe(true);
    // Fedya says why before the operator goes: the pump, the regulator, the station.
    const said = STEP_LINES.job.map((l) => l.text).join(' ');
    expect(said).toMatch(/regulator/i);
    expect(said).toMatch(/Zarya-7/);
  });
});
