import { beforeEach, describe, expect, it } from 'vitest';
import {
  bindQuickSlot, createItem, emptyGrid, emptyLoadout, loadoutAdd, loadoutCount, loadoutItems, place, pruneQuick,
  type ItemInstance, type Loadout,
} from '../core/inventory';
import { die, extract, foundItems } from '../core/raidResult';
import { newProfile, repair } from '../core/profile';
import { issueReserve } from '../core/reserve';
import { raid, useRaid } from './raidStore';

/** Every unit of an id anywhere the raid knows about (carried, containers, ground). */
function everywhere(id: string): number {
  const s = useRaid.getState();
  let n = loadoutCount(s.loadout, id);
  for (const g of Object.values(s.containers)) for (const p of g.items) if (p.item.id === id) n += p.item.qty;
  return n;
}

function start(...items: ItemInstance[]): void {
  let l = emptyLoadout();
  l.backpack = createItem('daypack');
  for (const it of items) l = loadoutAdd(l, it).loadout;
  raid.start('facility', 1, 'tikhaya', l);
}

const bandages = () => loadoutItems(useRaid.getState().loadout).filter((i) => i.id === 'bandage');
const quick = () => useRaid.getState().loadout.quick;

describe('quick use points at real, carried items', () => {
  beforeEach(() => start(createItem('bandage', { qty: 5 })));

  it('binding does not take or copy anything: Bandage ×5 stays Bandage ×5', () => {
    expect(raid.bindQuick(0, 'bandage')).toBe(true);
    expect(quick()[0]).toBe('bandage');
    expect(bandages()).toHaveLength(1);
    expect(bandages()[0].qty).toBe(5);
    expect(everywhere('bandage')).toBe(5);
  });

  it('using one consumes it from the real stack: ×5 → ×4, binding stays', () => {
    raid.bindQuick(0, 'bandage');
    expect(raid.consume(bandages()[0].uid)).toBe(true);
    expect(bandages()[0].qty).toBe(4);
    expect(quick()[0]).toBe('bandage');
  });

  it('using the last one clears the binding (no stale key)', () => {
    start(createItem('bandage'));
    raid.bindQuick(0, 'bandage');
    raid.consume(bandages()[0].uid);
    expect(bandages()).toHaveLength(0);
    expect(quick()[0]).toBeNull();
  });

  it('cannot bind something not carried, or something that is not a consumable', () => {
    expect(raid.bindQuick(1, 'carkit')).toBe(false);
    expect(raid.bindQuick(1, 'ammo_9x18')).toBe(false);
    expect(quick()).toEqual([null, null, null, null]);
  });

  it('survives moving the stack between pockets and backpack', () => {
    raid.bindQuick(0, 'bandage');
    const b = bandages()[0];
    expect(raid.move(b.uid, { grid: 'backpack', x: 0, y: 0, rot: false })).toBe(true);
    expect(quick()[0]).toBe('bandage');
    expect(raid.move(b.uid, { grid: 'pockets', x: 4, y: 1, rot: false })).toBe(true);
    expect(quick()[0]).toBe('bandage');
    expect(everywhere('bandage')).toBe(5);
  });

  it('survives splitting and merging the stack', () => {
    raid.bindQuick(0, 'bandage');
    expect(raid.splitAuto(bandages()[0].uid, 2)).toBe(true);
    expect(bandages().map((i) => i.qty).sort()).toEqual([2, 3]);
    expect(quick()[0]).toBe('bandage');
    const [a, b] = bandages();
    const where = useRaid.getState().loadout.pockets.items.find((p) => p.item.uid === b.uid)!;
    expect(raid.move(a.uid, { grid: 'pockets', x: where.x, y: where.y, rot: false })).toBe(true);
    expect(bandages()).toHaveLength(1);
    expect(bandages()[0].qty).toBe(5);
    expect(quick()[0]).toBe('bandage');
  });

  it('dropping the stack clears the binding and puts the same units on the ground', () => {
    raid.bindQuick(0, 'bandage');
    expect(raid.drop(bandages()[0].uid)).toBe(true);
    expect(quick()[0]).toBeNull();
    const dropped = raid.takeCommands().filter((c) => c.type === 'drop');
    expect(dropped).toHaveLength(1);
    expect(dropped[0].type === 'drop' && dropped[0].item.qty).toBe(5);
  });

  it('moving it into a container clears the binding; nothing is duplicated', () => {
    raid.bindQuick(0, 'bandage');
    raid.setContainer('c0', emptyGrid(4, 3));
    raid.openContainer('c0', 'BOX');
    expect(raid.quickMove(bandages()[0].uid, ['external'])).toBe(true);
    expect(quick()[0]).toBeNull();
    expect(everywhere('bandage')).toBe(5);
  });

  it('removing the item entirely clears the binding', () => {
    raid.bindQuick(2, 'bandage');
    expect(raid.remove(bandages()[0].uid)).not.toBeNull();
    expect(quick()[2]).toBeNull();
  });

  it('rebinding a type moves it to the new key rather than doubling it', () => {
    raid.bindQuick(0, 'bandage');
    raid.bindQuick(3, 'bandage');
    expect(quick()).toEqual([null, null, null, 'bandage']);
  });
});

describe('quick use across the raid lifecycle and saves', () => {
  function kit(): Loadout {
    let l = emptyLoadout();
    l = loadoutAdd(l, createItem('bandage', { qty: 3 })).loadout;
    l = loadoutAdd(l, createItem('carkit', { qty: 2 })).loadout;
    l = bindQuickSlot(l, 0, 'bandage');
    return bindQuickSlot(l, 1, 'carkit');
  }

  it('extraction keeps bindings for what came home, and drops the rest', () => {
    const l = kit();
    const usedUp = { ...l, pockets: { ...l.pockets, items: l.pockets.items.filter((p) => p.item.id !== 'carkit') } };
    const p = extract({ ...newProfile(), raid: { destination: 'tikhaya', seed: 1, startedAt: 0 } }, usedUp, [], 0);
    expect(p.loadout.quick).toEqual(['bandage', null, null, null]);
  });

  it('death loses the kit and every binding with it', () => {
    const p = die({ ...newProfile(), loadout: kit() }, 0);
    expect(p.loadout.quick).toEqual([null, null, null, null]);
    expect(loadoutItems(p.loadout)).toHaveLength(0);
  });

  it('the reserve re-binds the dressing it issues after a death', () => {
    const dead = die({ ...newProfile(), loadout: kit() }, 0);
    const r = issueReserve(dead.loadout, emptyGrid(10, 6));
    expect(r.loadout.quick[0]).toBe('bandage');
    expect(loadoutCount(r.loadout, 'bandage')).toBe(1);
  });

  it('a save/load round trip keeps valid bindings and clears stale ones', () => {
    const p = { ...newProfile(), loadout: { ...kit(), quick: ['bandage', 'carkit', 'frag', 'nonsense'] } };
    const loaded = repair(JSON.parse(JSON.stringify(p))).profile;
    expect(loaded.loadout.quick).toEqual(['bandage', 'carkit', null, null]);
  });

  it('pruneQuick is a no-op (same object) when every key points at something carried', () => {
    const l = kit();
    expect(pruneQuick(l)).toBe(l);
  });

  it('found-in-raid medical stacks keep their provenance through split and use', () => {
    start();
    const loot = createItem('bandage', { qty: 4 });
    raid.setContainer('c0', place(emptyGrid(4, 3), loot, 0, 0, false));
    raid.openContainer('c0', 'BOX');
    expect(raid.quickMove(loot.uid, ['pockets', 'backpack'])).toBe(true);
    expect(raid.splitAuto(loot.uid, 1)).toBe(true);
    const s = useRaid.getState();
    expect(foundItems(s.loadout, s.brought).reduce((n, i) => n + i.qty, 0)).toBe(4);
  });

  it('a brought-in stack stays brought-in when split', () => {
    start(createItem('carkit', { qty: 4 }));
    const k = loadoutItems(useRaid.getState().loadout).find((i) => i.id === 'carkit')!;
    expect(raid.splitAuto(k.uid, 2)).toBe(true);
    const s = useRaid.getState();
    expect(foundItems(s.loadout, s.brought)).toHaveLength(0);
  });
});
