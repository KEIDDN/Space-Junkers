import { describe, expect, it } from 'vitest';
import { countInGrid, loadoutItems } from './inventory';
import { migrate, newProfile, repair, PROFILE_VERSION, type Profile } from './profile';

describe('profile', () => {
  it('a new profile is valid and survives repair unchanged in substance', () => {
    const p = newProfile();
    const r = repair(JSON.parse(JSON.stringify(p))).profile;
    expect(r.credits).toBe(p.credits);
    expect(r.stash.items.length).toBe(p.stash.items.length);
    expect(loadoutItems(r.loadout).map((i) => i.id).sort()).toEqual(loadoutItems(p.loadout).map((i) => i.id).sort());
    // The starting kit can actually fight: a gun and matching ammo.
    expect(r.loadout.secondary?.id).toBe('pm9');
    expect(countInGrid(r.loadout.pockets, 'ammo_9x18')).toBeGreaterThan(0);
  });

  it('migrates a build 0.2 stash', () => {
    const { profile, notes } = migrate({ stash: { ring: 2, crown: 1, nonsense: 5 }, extractions: 3, deaths: 1 }, 0);
    expect(profile.version).toBe(PROFILE_VERSION);
    expect(countInGrid(profile.stash, 'ring')).toBe(2);
    expect(countInGrid(profile.stash, 'crown')).toBe(1);
    expect(profile.stats.extractions).toBe(3);
    expect(notes.length).toBeGreaterThan(0);
  });

  it('repairs garbage without throwing', () => {
    const junk = {
      credits: -50, operator: 'x', upgrades: 'no', stash: { items: [{ item: { id: 'ring', uid: 'a' }, x: 0, y: 0 }, { item: { id: 'ring', uid: 'a' }, x: 0, y: 0 }, { item: { id: 'bogus' } }, null] },
      loadout: { primary: { id: 'ring', uid: 'b' }, secondary: { id: 'akr74', uid: 'c', loaded: 999, ammoType: 'ammo_12buck' }, pockets: 7 },
    } as unknown as Profile;
    const { profile } = repair(junk);
    expect(profile.credits).toBe(0);
    expect(profile.operator).toBe('m');
    // Both rings kept with distinct uids; the bogus item dropped.
    const rings = profile.stash.items.filter((p) => p.item.id === 'ring');
    expect(rings.length).toBe(3); // two stash rings + the ring that was wrongly in the primary slot
    expect(new Set(rings.map((p) => p.item.uid)).size).toBe(3);
    // A rifle is not a holster weapon: it moves to the stash, magazine clamped, ammo fixed.
    expect(profile.loadout.secondary).toBeNull();
    const ak = profile.stash.items.find((p) => p.item.id === 'akr74')!.item;
    expect(ak.loaded).toBe(30);
    expect(ak.ammoType).toBe('ammo_545');
    expect(profile.loadout.pockets.w).toBe(5);
  });

  it('never duplicates uids across the whole save', () => {
    const p = newProfile();
    const dupe = JSON.parse(JSON.stringify(p)) as Profile;
    dupe.stash.items.push(JSON.parse(JSON.stringify(dupe.stash.items[0])));
    const r = repair(dupe).profile;
    const uids = [...r.stash.items.map((q) => q.item.uid), ...loadoutItems(r.loadout).map((i) => i.uid)];
    expect(new Set(uids).size).toBe(uids.length);
  });
});
