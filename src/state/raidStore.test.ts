import { beforeEach, describe, expect, it } from 'vitest';
import { createItem, emptyGrid, emptyLoadout, loadoutAdd, place } from '../core/inventory';
import { foundItems } from '../core/raidResult';
import { raid, useRaid } from './raidStore';

function startWith(...items: ReturnType<typeof createItem>[]) {
  let l = emptyLoadout();
  l.primary = createItem('akr74', { loaded: 20, ammoType: 'ammo_545' });
  for (const it of items) l = loadoutAdd(l, it).loadout;
  raid.start('facility', 1, 'tikhaya', l);
}

const found = () => {
  const s = useRaid.getState();
  return foundItems(s.loadout, s.brought);
};

describe('found-in-raid provenance', () => {
  beforeEach(() => startWith(createItem('ammo_545', { qty: 40 })));

  it('splitting your own stack does not make it found', () => {
    const stack = useRaid.getState().loadout.pockets.items[0];
    expect(raid.split(stack.item.uid, 15, { grid: 'pockets', x: 3, y: 0 })).toBe(true);
    expect(useRaid.getState().loadout.pockets.items).toHaveLength(2);
    expect(found()).toHaveLength(0);
  });

  it('unloading your own gun does not make the rounds found', () => {
    const gun = useRaid.getState().loadout.primary!;
    expect(raid.unload(gun.uid)).toBe(true);
    expect(found()).toHaveLength(0);
  });

  it('merging your own rounds into a found stack does not launder them', () => {
    // A found stack of the same ammo in a container, taken into the pockets.
    const loot = createItem('ammo_545', { qty: 5 });
    raid.setContainer('c0', place(emptyGrid(4, 3), loot, 0, 0, false));
    raid.openContainer('c0', 'BOX');
    expect(raid.move(loot.uid, { grid: 'pockets', x: 4, y: 1, rot: false })).toBe(true);
    expect(found().map((i) => i.qty)).toEqual([5]);
    const mine = useRaid.getState().loadout.pockets.items.find((p) => p.item.qty === 40)!;
    raid.move(mine.item.uid, { grid: 'pockets', x: 4, y: 1, rot: false });
    // Whatever merged, nothing of the 40 brought rounds counts as found.
    expect(found().reduce((n, i) => n + i.qty, 0)).toBeLessThanOrEqual(5);
  });

  it('found items stay found when moved around', () => {
    const loot = createItem('gold_bar');
    raid.setContainer('c0', place(emptyGrid(4, 3), loot, 0, 0, false));
    raid.openContainer('c0', 'BOX');
    expect(raid.quickMove(loot.uid, ['pockets', 'backpack'])).toBe(true);
    expect(found().map((i) => i.id)).toEqual(['gold_bar']);
  });
});
