import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { addToGrid, createItem, emptyGrid, emptyLoadout, gridItems, loadoutAdd, place, type ItemInstance } from './inventory';
import { locate, moveItem, parseSplitQty, splitRange, splitStack, splitStackAuto, type Workspace } from './transfer';
import { repair, newProfile } from './profile';

function addAll(n: number, id: string, w = 5, h = 2) {
  let g = emptyGrid(w, h);
  for (let i = 0; i < n; i++) g = addToGrid(g, createItem(id)).grid;
  return g;
}

function ws(): Workspace {
  const loadout = emptyLoadout();
  loadout.backpack = createItem('daypack');
  return { loadout, stash: emptyGrid(10, 6), external: emptyGrid(4, 4) };
}

function totalQty(w: Workspace, id: string): number {
  let n = 0;
  const walk = (items: ItemInstance[]) => {
    for (const it of items) {
      if (it.id === id) n += it.qty;
      if (it.contents) walk(gridItems(it.contents));
    }
  };
  walk(gridItems(w.loadout.pockets));
  if (w.loadout.backpack) walk([w.loadout.backpack]);
  if (w.stash) walk(gridItems(w.stash));
  if (w.external) walk(gridItems(w.external));
  return n;
}

describe('stacking is intentional, not universal', () => {
  it.each([
    ['bandage', 2], ['bandage', 5], ['medkit', 2], ['medkit', 5], ['carkit', 2], ['carkit', 5],
  ])('%s ×%i picked up one by one ends up as one stack', (id, n) => {
    const g = addAll(n, id);
    expect(g.items).toHaveLength(1);
    expect(g.items[0].item.qty).toBe(n);
  });

  it('ammunition stacks up to its limit, then starts a new stack', () => {
    let g = emptyGrid(5, 2);
    g = addToGrid(g, createItem('ammo_545', { qty: 50 })).grid;
    g = addToGrid(g, createItem('ammo_545', { qty: 30 })).grid;
    expect(g.items.map((p) => p.item.qty)).toEqual([60, 20]);
  });

  it('loot, weapons, armour and grenades never stack', () => {
    for (const id of ['gold_bar', 'scrap', 'pm9', 'vest_ps2', 'frag', 'surgkit', 'keycard']) {
      expect(ITEMS[id].stack).toBe(1);
      expect(addAll(3, id, 10, 10).items).toHaveLength(3);
    }
  });

  it('only bandages and field kits among the medical items stack', () => {
    const meds = Object.values(ITEMS).filter((d) => d.kind === 'med');
    expect(meds.filter((d) => d.stack > 1).map((d) => d.id).sort()).toEqual(['bandage', 'carkit', 'medkit']);
  });

  it('loot rolled into a container merges into the stack already there', () => {
    const loadout = loadoutAdd(loadoutAdd(emptyLoadout(), createItem('bandage')).loadout, createItem('bandage')).loadout;
    expect(loadout.pockets.items).toHaveLength(1);
    expect(loadout.pockets.items[0].item.qty).toBe(2);
  });

  it('a new operator starts with one stack of two bandages', () => {
    const p = newProfile();
    const b = p.loadout.pockets.items.filter((q) => q.item.id === 'bandage');
    expect(b).toHaveLength(1);
    expect(b[0].item.qty).toBe(2);
  });
});

describe('medkit semantics: quantity is units, heal is per unit', () => {
  it('a medkit stack of 2 is two kits, each healing its own amount', () => {
    const kit = createItem('carkit', { qty: 2 });
    expect(kit.qty).toBe(2);
    expect(kit.dur).toBeUndefined();
    const def = ITEMS.carkit;
    expect(def.kind === 'med' && def.heal).toBe(60);
  });

  it('a fresh kit is not a pool of 60 units', () => {
    const kit = createItem('carkit');
    expect(kit.qty).toBe(1);
    expect(kit.dur).toBeUndefined();
  });

  it('an old save with a medkit health pool loads as one kit, not as 60 of them', () => {
    const p = newProfile();
    const raw = JSON.parse(JSON.stringify(p));
    raw.stash.items = [{ item: { uid: 'old-kit', id: 'carkit', qty: 1, dur: 37 }, x: 0, y: 0, rot: false }];
    const fixed = repair(raw).profile;
    const kit = fixed.stash.items.find((q) => q.item.id === 'carkit')!.item;
    expect(kit.qty).toBe(1);
    expect(kit.dur).toBeUndefined();
  });

  it('merging medkit stacks moves units and caps at the stack size', () => {
    const w = ws();
    const a = createItem('medkit', { qty: 3 });
    const b = createItem('medkit', { qty: 4 });
    w.external = place(place(w.external!, a, 0, 0, false), b, 0, 1, false);
    const n = moveItem(w, a.uid, { grid: 'external', x: 0, y: 1, rot: false })!;
    expect(locate(n, b.uid)!.item.qty).toBe(5);
    expect(locate(n, a.uid)!.item.qty).toBe(2);
    expect(totalQty(n, 'medkit')).toBe(7);
  });
});

describe('stack splitting', () => {
  it.each([
    [2, 1], [10, 3], [40, 20], [40, 1], [40, 39],
  ])('%i → %i + rest, nothing gained or lost', (qty, take) => {
    const w = ws();
    const ammo = createItem('ammo_9x18', { qty });
    w.loadout.pockets = place(w.loadout.pockets, ammo, 0, 0, false);
    const n = splitStackAuto(w, ammo.uid, take, 'new')!;
    expect(n).not.toBeNull();
    expect(locate(n, ammo.uid)!.item.qty).toBe(qty - take);
    expect(locate(n, 'new')!.item.qty).toBe(take);
    expect(totalQty(n, 'ammo_9x18')).toBe(qty);
  });

  it('refuses 0, the whole stack, more than the stack and fractions', () => {
    const w = ws();
    const ammo = createItem('ammo_9x18', { qty: 40 });
    w.loadout.pockets = place(w.loadout.pockets, ammo, 0, 0, false);
    for (const q of [0, 40, 41, -3, 2.5]) expect(splitStackAuto(w, ammo.uid, q, 'new')).toBeNull();
  });

  it('reads typed amounts strictly', () => {
    expect(splitRange(40)).toEqual({ min: 1, max: 39 });
    expect(splitRange(1)).toBeNull();
    expect(parseSplitQty('20', 40)).toBe(20);
    expect(parseSplitQty(' 39 ', 40)).toBe(39);
    for (const bad of ['', '0', '40', 'abc', '1.5', '-2', '1e1']) expect(parseSplitQty(bad, 40)).toBeNull();
  });

  it('cancelling (never calling split) leaves the stack exactly as it was', () => {
    const w = ws();
    const ammo = createItem('ammo_9x18', { qty: 40 });
    w.loadout.pockets = place(w.loadout.pockets, ammo, 0, 0, false);
    splitStackAuto(w, ammo.uid, 20, 'probe'); // the dialog's live probe
    expect(locate(w, ammo.uid)!.item.qty).toBe(40);
    expect(w.loadout.pockets.items).toHaveLength(1);
  });

  it('goes to the other carried grid when the pockets are full, and fails when both are', () => {
    const w = ws();
    const ammo = createItem('ammo_9x18', { qty: 40 });
    let pockets = place(w.loadout.pockets, ammo, 0, 0, false);
    for (let i = 1; i < 10; i++) pockets = place(pockets, createItem('scrap'), i % 5, Math.floor(i / 5), false);
    w.loadout.pockets = pockets;
    const n = splitStackAuto(w, ammo.uid, 10, 'new')!;
    expect(locate(n, 'new')!.where).toEqual({ grid: 'backpack' });

    let full = w.loadout.backpack!.contents!;
    for (let y = 0; y < full.h; y++) for (let x = 0; x < full.w; x++) full = place(full, createItem('scrap'), x, y, false);
    const packed = { ...w, loadout: { ...w.loadout, backpack: { ...w.loadout.backpack!, contents: full } } };
    expect(splitStackAuto(packed, ammo.uid, 10, 'new')).toBeNull();
  });

  it('a container split stays in the container', () => {
    const w = ws();
    const b = createItem('bandage', { qty: 6 });
    w.external = place(w.external!, b, 0, 0, false);
    const n = splitStackAuto(w, b.uid, 2, 'new')!;
    expect(locate(n, 'new')!.where).toEqual({ grid: 'external' });
  });

  it('splits 2×1 stacks (Sanitar) even when only a rotated spot is free', () => {
    const w = ws();
    w.external = emptyGrid(2, 2);
    const kits = createItem('medkit', { qty: 4 });
    w.external = place(w.external, kits, 0, 0, false);
    // Only the bottom row is left: fits 2×1 unrotated. Block it and leave a column instead.
    const n = splitStackAuto(w, kits.uid, 1, 'new');
    expect(n).not.toBeNull();
    expect(totalQty(n!, 'medkit')).toBe(4);
    const tall = { ...w, external: place(emptyGrid(3, 2), kits, 0, 0, false) };
    tall.external = place(tall.external, createItem('scrap'), 0, 1, false);
    tall.external = place(tall.external, createItem('scrap'), 1, 1, false);
    const r = splitStackAuto(tall, kits.uid, 2, 'new')!;
    expect(r).not.toBeNull();
    expect(r.external!.items.find((p) => p.item.uid === 'new')!.rot).toBe(true);
  });

  it('a split never overlaps its source', () => {
    const w = ws();
    const ammo = createItem('ammo_9x18', { qty: 40 });
    w.loadout.pockets = place(w.loadout.pockets, ammo, 0, 0, false);
    expect(splitStack(w, ammo.uid, 10, { grid: 'pockets', x: 0, y: 0 }, 'new')).toBeNull();
  });
});
