import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { UPGRADE, UPGRADES } from '../data/upgrades';
import { addToGrid, createItem, findInGrid } from './inventory';
import { newProfile, STASH_BASE_ROWS, type Profile } from './profile';
import { install, jumpCost, repair, repairCost, travelCost, upgradeStatus } from './upgrades';

function give(p: Profile, id: string, n = 1): Profile {
  let stash = p.stash;
  for (let i = 0; i < n; i++) stash = addToGrid(stash, createItem(id)).grid;
  return { ...p, stash };
}

describe('upgrades', () => {
  it('data references real items and upgrades', () => {
    for (const u of UPGRADES) {
      for (const [id] of u.items) expect(ITEMS[id], `${u.id} ${id}`).toBeDefined();
      for (const r of u.requires ?? []) expect(UPGRADE[r]).toBeDefined();
    }
  });

  it('installing takes credits and parts, and grows the stash', () => {
    let p = { ...newProfile(), credits: 10000 };
    expect(install(p, 'stash1').ok).toBe(false); // missing parts (has 2 scrap, needs 4 + 2 pipe)
    p = give(give(p, 'scrap', 2), 'pipe', 2);
    const r = install(p, 'stash1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.credits).toBe(10000 - UPGRADE.stash1.cost);
    expect(r.profile.stash.h).toBe(STASH_BASE_ROWS + 6);
    expect(upgradeStatus(r.profile, 'stash1')).toBe('installed');
    expect(upgradeStatus(r.profile, 'stash2')).toBe('available');
    expect(upgradeStatus(p, 'stash2')).toBe('locked');
  });

  it('the reactor overhaul cuts fuel costs', () => {
    expect(travelCost({ upgrades: [] }, 1000)).toBe(1000);
    expect(travelCost({ upgrades: ['reactor'] }, 1000)).toBe(700);
  });

  it('the bench repairs worn armor for a price', () => {
    const vest = createItem('vest_zhuk', { dur: 20 });
    let p = { ...newProfile(), credits: 10000 };
    p = { ...p, stash: addToGrid(p.stash, vest).grid };
    expect(repair(p, vest.uid).ok).toBe(false); // no bench
    p = { ...p, upgrades: ['workbench'] };
    const cost = repairCost(vest)!;
    const r = repair(p, vest.uid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(findInGrid(r.profile.stash, vest.uid)!.item.dur).toBe(70);
    expect(r.profile.credits).toBe(10000 - cost);
  });
});

describe('jumpCost', () => {
  it('flies a broke operator home for free, and only home', () => {
    expect(jumpCost({ upgrades: [], credits: 100 }, 'tikhaya', 250)).toEqual({ cost: 0, onTab: true });
    expect(jumpCost({ upgrades: [], credits: 100 }, 'merzlota', 900)).toEqual({ cost: 900, onTab: false });
    expect(jumpCost({ upgrades: [], credits: 5000 }, 'tikhaya', 250)).toEqual({ cost: 250, onTab: false });
    expect(jumpCost({ upgrades: ['reactor'], credits: 200 }, 'tikhaya', 250)).toEqual({ cost: 175, onTab: false });
  });
});
