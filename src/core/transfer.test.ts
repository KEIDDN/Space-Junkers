import { describe, expect, it } from 'vitest';
import { addToGrid, createItem, emptyGrid, emptyLoadout, findInGrid, newUid, place, type ItemInstance } from './inventory';
import { loadWeapon, locate, moveItem, quickMove, splitStack, unloadWeapon, type Workspace } from './transfer';

function ws(): Workspace {
  const loadout = emptyLoadout();
  loadout.backpack = createItem('daypack');
  return { loadout, stash: emptyGrid(10, 6), external: emptyGrid(4, 4) };
}

function all(w: Workspace): ItemInstance[] {
  const out: ItemInstance[] = [];
  const walk = (it: ItemInstance) => {
    out.push(it);
    it.contents?.items.forEach((p) => walk(p.item));
  };
  for (const s of ['primary', 'secondary', 'helmet', 'armor', 'backpack'] as const) if (w.loadout[s]) walk(w.loadout[s]!);
  w.loadout.pockets.items.forEach((p) => walk(p.item));
  w.stash?.items.forEach((p) => walk(p.item));
  w.external?.items.forEach((p) => walk(p.item));
  return out;
}

describe('moveItem', () => {
  it('moves between grids and never duplicates', () => {
    const w = ws();
    const ring = createItem('ring');
    w.external = place(w.external!, ring, 0, 0, false);
    const n = moveItem(w, ring.uid, { grid: 'backpack', x: 1, y: 1, rot: false })!;
    expect(locate(n, ring.uid)!.where).toEqual({ grid: 'backpack' });
    expect(all(n).filter((i) => i.uid === ring.uid)).toHaveLength(1);
  });

  it('rejects overlapping and out-of-bounds drops', () => {
    const w = ws();
    const a = createItem('ring');
    const b = createItem('watch');
    w.external = place(place(w.external!, a, 0, 0, false), b, 1, 0, false);
    expect(moveItem(w, a.uid, { grid: 'external', x: 1, y: 0, rot: false })).toBeNull();
    expect(moveItem(w, a.uid, { grid: 'external', x: 4, y: 0, rot: false })).toBeNull();
  });

  it('can move an item within its own grid onto its own footprint', () => {
    const w = ws();
    const bar = createItem('coolant'); // 2x1
    w.external = place(w.external!, bar, 0, 0, false);
    const n = moveItem(w, bar.uid, { grid: 'external', x: 1, y: 0, rot: false })!;
    expect(findInGrid(n.external!, bar.uid)).toMatchObject({ x: 1, y: 0 });
  });

  it('equips into slots and swaps with the occupant', () => {
    const w = ws();
    const ak = createItem('akr74');
    const toz = createItem('toz12');
    w.stash = place(w.stash!, ak, 0, 0, false);
    w.loadout.primary = toz;
    const n = moveItem(w, ak.uid, { slot: 'primary' })!;
    expect(n.loadout.primary!.uid).toBe(ak.uid);
    expect(locate(n, toz.uid)!.where).toEqual({ grid: 'stash' });
  });

  it('enforces slot rules', () => {
    const w = ws();
    const ak = createItem('akr74');
    w.stash = place(w.stash!, ak, 0, 0, false);
    expect(moveItem(w, ak.uid, { slot: 'secondary' })).toBeNull();
    expect(moveItem(w, ak.uid, { slot: 'helmet' })).toBeNull();
    const pm = createItem('pm9');
    w.stash = place(w.stash!, pm, 5, 0, false);
    expect(moveItem(w, pm.uid, { slot: 'secondary' })).not.toBeNull();
  });

  it('a full backpack cannot go into pockets or another bag, but can go to the stash', () => {
    const w = ws();
    w.loadout.backpack!.contents = addToGrid(w.loadout.backpack!.contents!, createItem('ring')).grid;
    const bagUid = w.loadout.backpack!.uid;
    expect(moveItem(w, bagUid, { grid: 'pockets', x: 0, y: 0, rot: false })).toBeNull();
    expect(moveItem(w, bagUid, { grid: 'backpack', x: 0, y: 0, rot: false })).toBeNull();
    const n = moveItem(w, bagUid, { grid: 'stash', x: 0, y: 0, rot: false })!;
    expect(n.loadout.backpack).toBeNull();
    expect(findInGrid(n.stash!, bagUid)!.item.contents!.items).toHaveLength(1);
  });

  it('merges stacks when dropped on the same ammo', () => {
    const w = ws();
    const a = createItem('ammo_545', { qty: 50 });
    const b = createItem('ammo_545', { qty: 30 });
    w.loadout.pockets = place(w.loadout.pockets, a, 0, 0, false);
    w.external = place(w.external!, b, 0, 0, false);
    const n = moveItem(w, b.uid, { grid: 'pockets', x: 0, y: 0, rot: false })!;
    expect(findInGrid(n.loadout.pockets, a.uid)!.item.qty).toBe(60);
    expect(findInGrid(n.external!, b.uid)!.item.qty).toBe(20);
  });
});

describe('quickMove / split', () => {
  it('shift-click moves loot into the first grid with room', () => {
    const w = ws();
    const bar = createItem('gold_bar');
    w.external = place(w.external!, bar, 0, 0, false);
    const n = quickMove(w, bar.uid, ['backpack', 'pockets'])!;
    expect(locate(n, bar.uid)!.where).toEqual({ grid: 'backpack' });
  });

  it('quick-equip goes to an empty matching slot', () => {
    const w = ws();
    const helmet = createItem('k6helmet');
    w.stash = place(w.stash!, helmet, 0, 0, false);
    const n = quickMove(w, helmet.uid, ['pockets'], true)!;
    expect(n.loadout.helmet!.uid).toBe(helmet.uid);
  });

  it('splits a stack', () => {
    const w = ws();
    const a = createItem('ammo_9x18', { qty: 40 });
    w.stash = place(w.stash!, a, 0, 0, false);
    const n = splitStack(w, a.uid, 15, { grid: 'pockets', x: 0, y: 0 }, newUid())!;
    expect(findInGrid(n.stash!, a.uid)!.item.qty).toBe(25);
    expect(n.loadout.pockets.items[0].item.qty).toBe(15);
  });
});

describe('weapon ammo', () => {
  it('loads a matching stack and swaps out different rounds', () => {
    const w = ws();
    const ak = createItem('akr74', { loaded: 10, ammoType: 'ammo_545' });
    w.loadout.primary = ak;
    const ap = createItem('ammo_545_ap', { qty: 40 });
    w.loadout.pockets = place(w.loadout.pockets, ap, 0, 0, false);
    const n = loadWeapon(w, ak.uid, ap.uid, newUid)!;
    expect(n.loadout.primary).toMatchObject({ loaded: 30, ammoType: 'ammo_545_ap' });
    const ids = n.loadout.pockets.items.map((p) => `${p.item.id}:${p.item.qty}`).sort();
    expect(ids).toEqual(['ammo_545:10', 'ammo_545_ap:10']);
  });

  it('refuses the wrong caliber', () => {
    const w = ws();
    const ak = createItem('akr74');
    w.loadout.primary = ak;
    const buck = createItem('ammo_12buck', { qty: 10 });
    w.loadout.pockets = place(w.loadout.pockets, buck, 0, 0, false);
    expect(loadWeapon(w, ak.uid, buck.uid, newUid)).toBeNull();
  });

  it('unloads into pockets', () => {
    const w = ws();
    const pm = createItem('pm9', { loaded: 9 });
    w.loadout.secondary = pm;
    const n = unloadWeapon(w, pm.uid, ['pockets'], newUid)!;
    expect(n.loadout.secondary!.loaded).toBe(0);
    expect(n.loadout.pockets.items[0].item).toMatchObject({ id: 'ammo_9x18', qty: 9 });
  });
});
