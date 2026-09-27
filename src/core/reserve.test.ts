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

  it('counts guns and packs kept in the stash', () => {
    let stash = addToGrid(emptyGrid(10, 10), createItem('akr74', { loaded: 30 })).grid;
    stash = addToGrid(stash, createItem('daypack')).grid;
    expect(issueReserve(emptyLoadout(), stash).issued).toEqual([]);
  });

  it('a gun with no rounds anywhere is not a gun', () => {
    const l = { ...emptyLoadout(), primary: createItem('akr74', { loaded: 0 }), backpack: createItem('daypack') };
    const r = issueReserve(l, emptyGrid(10, 10));
    expect(r.issued).toEqual([RESERVE_GUN]);
    expect(r.loadout.primary?.id).toBe('akr74');
    expect(r.loadout.secondary?.id).toBe(RESERVE_GUN);
  });

  it('only adds the pack when the gun is fine', () => {
    const l = { ...emptyLoadout(), secondary: createItem('pm9', { loaded: 9 }) };
    const r = issueReserve(l, emptyGrid(10, 10));
    expect(r.issued).toEqual([RESERVE_PACK]);
    expect(gridItems(r.stash)).toEqual([]);
  });
});
