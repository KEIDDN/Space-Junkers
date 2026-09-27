import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { createItem, loadoutAdd, loadoutItems } from './inventory';
import { newProfile } from './profile';
import { deploy, die, extract, haulValue } from './raidResult';

describe('raid result', () => {
  it('deploy marks the raid as running', () => {
    const p = deploy(newProfile(), 'tikhaya', 42, 1000);
    expect(p.raid).toEqual({ destination: 'tikhaya', seed: 42, startedAt: 1000 });
    expect(p.stats.raids).toBe(1);
  });

  it('extracting keeps everything carried and counts the haul', () => {
    const p = deploy(newProfile(), 'tikhaya', 1);
    const brought = loadoutItems(p.loadout).map((i) => i.uid);
    const l = loadoutAdd(p.loadout, createItem('gold_bar')).loadout;
    expect(haulValue(l, brought)).toBe(ITEMS.gold_bar.value);
    const after = extract(p, l, brought, 3);
    expect(after.raid).toBeNull();
    expect(loadoutItems(after.loadout).some((i) => i.id === 'gold_bar')).toBe(true);
    expect(after.stats).toMatchObject({ extractions: 1, kills: 3, bestHaul: ITEMS.gold_bar.value });
    expect(after.day).toBe(p.day + 1);
  });

  it('dying loses the whole loadout but keeps the stash and credits', () => {
    const p = deploy(newProfile(), 'tikhaya', 1);
    const after = die(p, 1);
    expect(loadoutItems(after.loadout)).toHaveLength(0);
    expect(after.stash).toBe(p.stash);
    expect(after.credits).toBe(p.credits);
    expect(after.raid).toBeNull();
    expect(after.stats.deaths).toBe(1);
  });
});
