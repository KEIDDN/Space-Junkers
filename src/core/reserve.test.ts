import { describe, expect, it } from 'vitest';
import { createItem, emptyGrid, emptyLoadout, gridItems, itemValue, loadoutItems, addToGrid } from './inventory';
import { RESERVE_GUN, RESERVE_PACK, hasPack, hasUsableGun, issueReserve } from './reserve';

describe('ship reserve', () => {
  it('re-arms an operator who lost everything', () => {
    const r = issueReserve(emptyLoadout(), emptyGrid(10, 10));
    expect(r.issued.sort()).toEqual([RESERVE_GUN, RESERVE_PACK].sort());
    expect(r.loadout.secondary?.id).toBe(RESERVE_GUN);
    expect(r.loadout.secondary?.loaded).toBeGreaterThan(0);
    expect(r.loadout.backpack?.id).toBe(RESERVE_PACK);
    expect(hasUsableGun(r.loadout, r.stash)).toBe(true);
    expect(hasPack(r.loadout, r.stash)).toBe(true);
  });

  it('is worthless to traders (no farming)', () => {
    const r = issueReserve(emptyLoadout(), emptyGrid(10, 10));
    for (const it of loadoutItems(r.loadout)) expect(itemValue(it), it.id).toBe(0);
  });

  it('never hands out twice, and never replaces anything', () => {
    const first = issueReserve(emptyLoadout(), emptyGrid(10, 10));
    const again = issueReserve(first.loadout, first.stash);
    expect(again.issued).toEqual([]);
    expect(again.loadout).toBe(first.loadout);
  });

  it('arms the operator even when the locker holds a gun (the kit goes on you)', () => {
    let stash = addToGrid(emptyGrid(10, 10), createItem('obrez', { loaded: 2 })).grid;
    stash = addToGrid(stash, createItem('ammo_12buck', { qty: 20 })).grid;
    const r = issueReserve(emptyLoadout(), stash);
    expect(r.loadout.secondary?.id).toBe(RESERVE_GUN);
    expect(gridItems(r.stash).map((i) => i.id)).toContain('obrez');
  });

  it('hands back crew issue from the locker instead of issuing more', () => {
    const first = issueReserve(emptyLoadout(), emptyGrid(10, 10));
    // Everything put away in the stash, then the operator goes out with nothing and dies.
    let stash = emptyGrid(10, 10);
    for (const it of loadoutItems(first.loadout)) stash = addToGrid(stash, it).grid;
    const again = issueReserve(emptyLoadout(), stash);
    expect(gridItems(again.stash)).toEqual([]);
    expect(loadoutItems(again.loadout).map((i) => i.uid).sort()).toEqual(loadoutItems(first.loadout).map((i) => i.uid).sort());
  });

  it('leaves an operator who is carrying what they need alone', () => {
    const l = { ...emptyLoadout(), primary: createItem('akr74', { loaded: 30 }), backpack: createItem('daypack') };
    expect(issueReserve(l, emptyGrid(10, 10)).issued).toEqual([]);
  });

  it('a gun with no rounds anywhere is not a gun', () => {
    const l = { ...emptyLoadout(), primary: createItem('akr74', { loaded: 0 }), backpack: createItem('daypack') };
    const r = issueReserve(l, emptyGrid(10, 10));
    expect(r.issued).toEqual([RESERVE_GUN]);
    expect(r.loadout.primary?.id).toBe('akr74');
    expect(r.loadout.secondary?.id).toBe(RESERVE_GUN);
  });

  it('says where everything went, rounds and dressing included', () => {
    const r = issueReserve(emptyLoadout(), emptyGrid(10, 10));
    const where = Object.fromEntries(r.items.map((i) => [i.id, i.where]));
    expect(where).toEqual({ [RESERVE_PACK]: 'backpack', [RESERVE_GUN]: 'secondary', ammo_9x18: 'carried', bandage: 'carried' });
    expect(r.loadout.quick).toContain('bandage');
  });

  it('adds a dressing only when the operator carries no meds', () => {
    const l = { ...emptyLoadout(), pockets: addToGrid(emptyLoadout().pockets, createItem('medkit')).grid };
    const r = issueReserve(l, emptyGrid(10, 10));
    expect(r.items.map((i) => i.id)).not.toContain('bandage');
  });

  it('only adds the pack when the gun is fine', () => {
    const l = { ...emptyLoadout(), secondary: createItem('pm9', { loaded: 9 }) };
    const r = issueReserve(l, emptyGrid(10, 10));
    expect(r.issued).toEqual([RESERVE_PACK]);
    expect(gridItems(r.stash)).toEqual([]);
  });
});
