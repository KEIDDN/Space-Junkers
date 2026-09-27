import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { WEAPONS } from '../data/weapons';
import {
  addToGrid, canPlace, countInGrid, createItem, emptyGrid, emptyLoadout, findSpot, gridValue, itemValue,
  loadoutAdd, loadoutCount, loadoutTake, loadoutWeight, place, sortGrid, speedMultiplier, takeFromGrid,
} from './inventory';

describe('item catalog', () => {
  it('every item is well-formed', () => {
    for (const d of Object.values(ITEMS)) {
      expect(d.w, d.id).toBeGreaterThanOrEqual(1);
      expect(d.h, d.id).toBeGreaterThanOrEqual(1);
      expect(d.stack, d.id).toBeGreaterThanOrEqual(1);
      expect(d.value, d.id).toBeGreaterThan(0);
      expect(d.short.length, d.id).toBeLessThanOrEqual(10);
      if (d.kind === 'weapon') expect(WEAPONS[d.weapon], d.id).toBeDefined();
      // The biggest backpack is 6 wide: every item must fit in some carried grid or slot.
      expect(Math.min(d.w, d.h), d.id).toBeLessThanOrEqual(6);
    }
  });

  it('every weapon has an ammo type for its caliber', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(Object.values(ITEMS).some((d) => d.kind === 'ammo' && d.caliber === w.caliber), w.id).toBe(true);
    }
  });
});

describe('grid', () => {
  it('places items without overlap and respects bounds', () => {
    let g = emptyGrid(4, 3);
    const rifle = createItem('akr74'); // 4x2
    expect(canPlace(g, rifle, 0, 0, false)).toBe(true);
    expect(canPlace(g, rifle, 1, 0, false)).toBe(false); // out of bounds
    g = place(g, rifle, 0, 0, false);
    const ring = createItem('ring');
    expect(canPlace(g, ring, 3, 1, false)).toBe(false);
    expect(canPlace(g, ring, 3, 2, false)).toBe(true);
    // Rotated rifle would be 2x4, too tall.
    expect(canPlace(emptyGrid(4, 3), rifle, 0, 0, true)).toBe(false);
  });

  it('finds a spot, rotating when that is the only fit', () => {
    const g = emptyGrid(1, 3);
    const spot = findSpot(g, createItem('coolant')); // 2x1
    expect(spot).toEqual({ x: 0, y: 0, rot: true });
    expect(findSpot(emptyGrid(1, 1), createItem('coolant'))).toBeNull();
  });

  it('stacks ammo up to the stack size, spilling into new stacks', () => {
    let g = emptyGrid(3, 1);
    g = addToGrid(g, createItem('ammo_9x18', { qty: 50 })).grid;
    const r = addToGrid(g, createItem('ammo_9x18', { qty: 30 }));
    expect(r.rest).toBeNull();
    expect(r.grid.items).toHaveLength(2);
    expect(countInGrid(r.grid, 'ammo_9x18')).toBe(80);
    expect(r.grid.items.map((p) => p.item.qty).sort((a, b) => a - b)).toEqual([20, 60]);
  });

  it('reports leftovers when full', () => {
    let g = emptyGrid(1, 1);
    g = addToGrid(g, createItem('ring')).grid;
    const r = addToGrid(g, createItem('watch'));
    expect(r.rest?.id).toBe('watch');
  });

  it('takes from smallest stacks first', () => {
    let g = emptyGrid(3, 1);
    g = place(g, createItem('ammo_545', { qty: 60 }), 0, 0, false);
    g = place(g, createItem('ammo_545', { qty: 10 }), 1, 0, false);
    const r = takeFromGrid(g, 'ammo_545', 25);
    expect(r.taken).toBe(25);
    expect(r.grid.items).toHaveLength(1);
    expect(r.grid.items[0].item.qty).toBe(45);
    expect(takeFromGrid(g, 'ammo_545', 500).taken).toBe(70);
  });

  it('sorting merges stacks and keeps every item', () => {
    let g = emptyGrid(6, 4);
    g = place(g, createItem('ammo_9x18', { qty: 7 }), 5, 3, false);
    g = place(g, createItem('ring'), 2, 2, false);
    g = place(g, createItem('ammo_9x18', { qty: 9 }), 0, 3, false);
    g = place(g, createItem('fuel'), 3, 0, false);
    const s = sortGrid(g)!;
    expect(s).not.toBeNull();
    expect(countInGrid(s, 'ammo_9x18')).toBe(16);
    expect(s.items.filter((p) => p.item.id === 'ammo_9x18')).toHaveLength(1);
    expect(s.items.find((p) => p.item.id === 'fuel')).toMatchObject({ x: 0, y: 0 });
  });
});

describe('value', () => {
  it('worn armor and crew issue are worth less', () => {
    const fresh = createItem('vest_zhuk');
    const worn = { ...fresh, dur: 0 };
    expect(itemValue(worn)).toBeLessThan(itemValue(fresh));
    expect(itemValue(createItem('pm9', { crew: true }))).toBe(0);
  });

  it('counts loaded rounds and backpack contents', () => {
    const gun = createItem('pm9', { loaded: 9 });
    const bag = createItem('daypack');
    bag.contents = addToGrid(bag.contents!, createItem('gold_bar')).grid;
    let g = emptyGrid(10, 10);
    g = addToGrid(g, gun).grid;
    g = addToGrid(g, bag).grid;
    expect(gridValue(g)).toBe(ITEMS.pm9.value + 9 * ITEMS.ammo_9x18.value + ITEMS.daypack.value + ITEMS.gold_bar.value);
  });
});

describe('loadout', () => {
  it('puts ammo in pockets and loot in the backpack', () => {
    let l = emptyLoadout();
    l.backpack = createItem('daypack');
    l = loadoutAdd(l, createItem('ammo_545', { qty: 30 })).loadout;
    l = loadoutAdd(l, createItem('gold_bar')).loadout;
    expect(l.pockets.items.map((p) => p.item.id)).toEqual(['ammo_545']);
    expect(l.backpack!.contents!.items.map((p) => p.item.id)).toEqual(['gold_bar']);
    expect(loadoutCount(l, 'ammo_545')).toBe(30);
    const t = loadoutTake(l, 'ammo_545', 12);
    expect(t.taken).toBe(12);
    expect(loadoutCount(t.loadout, 'ammo_545')).toBe(18);
  });

  it('without a backpack, loot overflows to pockets then refuses', () => {
    let l = emptyLoadout();
    let rest = null;
    for (let i = 0; i < 11; i++) {
      const r = loadoutAdd(l, createItem('ring'));
      l = r.loadout;
      rest = r.rest;
    }
    expect(l.pockets.items).toHaveLength(10);
    expect(rest).not.toBeNull();
  });

  it('heavy loads and heavy armor slow you down', () => {
    const light = emptyLoadout();
    expect(speedMultiplier(light)).toBe(1);
    const heavy = emptyLoadout();
    heavy.armor = createItem('vest_granit');
    heavy.backpack = createItem('raidpack');
    for (let i = 0; i < 8; i++) heavy.backpack.contents = addToGrid(heavy.backpack.contents!, createItem('fuel')).grid;
    expect(loadoutWeight(heavy)).toBeGreaterThan(40);
    expect(speedMultiplier(heavy)).toBeLessThan(0.8);
  });
});
