import { describe, expect, it } from 'vitest';
import { CREW } from '../data/crew';
import { DESTINATION } from '../data/destinations';
import { ENEMIES } from '../data/enemies';
import { ITEMS } from '../data/items';
import { QUEST, QUESTS } from '../data/quests';
import { addToGrid, countInGrid, createItem } from './inventory';
import { newProfile, type Profile } from './profile';
import { accept, applyRaid, questStatus, turnIn, type RaidReport } from './quests';

const report = (r: Partial<RaidReport> = {}): RaidReport => ({
  destination: 'tikhaya', extracted: true, kills: [], searched: 0, visited: [], found: [], ...r,
});

function give(p: Profile, id: string, n = 1): Profile {
  let stash = p.stash;
  for (let i = 0; i < n; i++) stash = addToGrid(stash, createItem(id)).grid;
  return { ...p, stash };
}

describe('quest data', () => {
  it('references real items, enemies, destinations, crew and quests', () => {
    for (const q of QUESTS) {
      expect(CREW[q.giver], q.id).toBeDefined();
      for (const r of q.requires?.quests ?? []) expect(QUEST[r], `${q.id} requires ${r}`).toBeDefined();
      for (const o of q.objectives) {
        if ('item' in o) expect(ITEMS[o.item], `${q.id} ${o.item}`).toBeDefined();
        if (o.kind === 'kill' && o.enemy) expect(ENEMIES[o.enemy], `${q.id} ${o.enemy}`).toBeDefined();
        if ('destination' in o && o.destination) expect(DESTINATION[o.destination], q.id).toBeDefined();
      }
      for (const [id] of q.reward.items ?? []) expect(ITEMS[id], `${q.id} reward ${id}`).toBeDefined();
      if (q.reward.destination) expect(DESTINATION[q.reward.destination]).toBeDefined();
    }
  });

  it('every destination except the first can be unlocked by some contract', () => {
    const unlocks = new Set(QUESTS.map((q) => q.reward.destination).filter(Boolean));
    for (const d of Object.keys(DESTINATION)) if (d !== 'tikhaya') expect(unlocks.has(d), d).toBe(true);
  });
});

describe('quest flow', () => {
  it('first salvage: accept, extract, turn in', () => {
    let p = newProfile();
    expect(questStatus(p, 'fedya_first')).toBe('available');
    p = accept(p, 'fedya_first');
    expect(questStatus(p, 'fedya_first')).toBe('active');
    p = applyRaid(p, report({ extracted: false })).profile;
    expect(questStatus(p, 'fedya_first')).toBe('active'); // dying doesn't count
    p = applyRaid(p, report()).profile;
    expect(questStatus(p, 'fedya_first')).toBe('ready');
    const r = turnIn(p, 'fedya_first');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.credits).toBe(p.credits + QUEST.fedya_first.reward.credits!);
    expect(r.profile.crew.trader!.trust).toBeGreaterThan(0);
    expect(questStatus(r.profile, 'fedya_first')).toBe('turnedIn');
    expect(questStatus(r.profile, 'fedya_parts')).toBe('available');
  });

  it('kills count even when you die', () => {
    let p = accept(newProfile(), 'molot_zero');
    p = applyRaid(p, report({ extracted: false, kills: Array.from({ length: 5 }, () => ({ enemy: 'scavenger', headshot: false })) })).profile;
    expect(questStatus(p, 'molot_zero')).toBe('ready');
  });

  it('hand-ins are consumed from the stash on turn-in', () => {
    let p = newProfile();
    p = { ...p, quests: { fedya_first: { status: 'turnedIn', progress: [1] } } };
    p = accept(p, 'fedya_parts');
    expect(questStatus(p, 'fedya_parts')).toBe('active');
    p = give(p, 'pipe', 2); // the new profile already has 2 scrap; need 3
    expect(questStatus(p, 'fedya_parts')).toBe('active');
    p = give(p, 'scrap', 1);
    expect(questStatus(p, 'fedya_parts')).toBe('ready');
    const r = turnIn(p, 'fedya_parts');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(countInGrid(r.profile.stash, 'scrap')).toBe(0);
    expect(countInGrid(r.profile.stash, 'pipe')).toBe(0);
  });

  it('extractWith counts only items found in the raid, on the right world', () => {
    let p = newProfile();
    p = { ...p, quests: { fedya_crystals: { status: 'active', progress: [0] } } };
    p = applyRaid(p, report({ destination: 'tikhaya', found: [createItem('cryo'), createItem('cryo')] })).profile;
    expect(p.quests.fedya_crystals.progress[0]).toBe(0);
    p = applyRaid(p, report({ destination: 'merzlota', found: [createItem('cryo'), createItem('cryo')] })).profile;
    expect(questStatus(p, 'fedya_crystals')).toBe('ready');
  });

  it('unlocks destinations and respects trust requirements', () => {
    let p = newProfile();
    p = { ...p, quests: { fedya_first: { status: 'turnedIn', progress: [1] }, fedya_parts: { status: 'turnedIn', progress: [0, 0] } } };
    expect(questStatus(p, 'fedya_foreman')).toBe('locked'); // needs trust KNOWN
    p = { ...p, crew: { trader: { trust: 20, met: true } } };
    p = accept(p, 'fedya_foreman');
    p = give(give(p, 'fuel'), 'copper_ore', 2);
    const r = turnIn(p, 'fedya_foreman');
    expect(r.ok && r.profile.destinations.includes('merzlota')).toBe(true);
  });
});
