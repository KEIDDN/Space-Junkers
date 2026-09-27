import { itemDef } from '../data/items';
import {
  EQUIP_SLOTS, addToGrid, createItem, findSpot, loadoutAdd, loadoutItems, newUid, slotAccepts, sortGrid,
  type ItemInstance,
} from '../core/inventory';
import {
  getGrid, loadWeapon, locate, moveItem, quickMove, splitStack, unloadWeapon,
  type GridKey, type Target, type Workspace,
} from '../core/transfer';
import { useProfile } from './profileStore';

/**
 * Inventory operations on the persistent save while aboard the ship (stash ↔ loadout).
 * Every operation is validated by the pure transfer layer before anything is written.
 */

function ws(): Workspace {
  const p = useProfile.getState();
  return { loadout: p.loadout, stash: p.stash, external: null };
}

function commit(next: Workspace | null): boolean {
  if (!next) return false;
  useProfile.getState().apply({ loadout: next.loadout, stash: next.stash! });
  return true;
}

const CARRY: GridKey[] = ['backpack', 'pockets'];

export const ship = {
  workspace: ws,

  move(uid: string, to: Target): boolean {
    return commit(moveItem(ws(), uid, to));
  },

  /** Shift-click: stash → loadout (equip if a slot is free), loadout → stash. */
  quick(uid: string): boolean {
    const w = ws();
    const loc = locate(w, uid);
    if (!loc) return false;
    if ('slot' in loc.where) return commit(quickMove(w, uid, ['stash']));
    if (loc.where.grid === 'stash' || loc.where.grid.startsWith('bag:')) return commit(quickMove(w, uid, CARRY, true));
    return commit(quickMove(w, uid, ['stash']));
  },

  /** Double-click: equip into the matching slot (swapping), or unequip to the stash. */
  activate(uid: string): boolean {
    const w = ws();
    const loc = locate(w, uid);
    if (!loc) return false;
    if ('slot' in loc.where) return commit(quickMove(w, uid, ['stash']));
    const slot = EQUIP_SLOTS.find((s) => !w.loadout[s] && slotAccepts(s, loc.item)) ?? EQUIP_SLOTS.find((s) => slotAccepts(s, loc.item));
    return slot ? commit(moveItem(w, uid, { slot })) : false;
  },

  load(weaponUid: string, ammoUid: string): boolean {
    return commit(loadWeapon(ws(), weaponUid, ammoUid, newUid));
  },

  unload(uid: string): boolean {
    const w = ws();
    const loc = locate(w, uid);
    if (!loc) return false;
    const into: GridKey[] = 'slot' in loc.where ? [...CARRY, 'stash'] : [loc.where.grid, 'stash'];
    return commit(unloadWeapon(w, uid, into, newUid));
  },

  split(uid: string): boolean {
    const w = ws();
    const loc = locate(w, uid);
    if (!loc || 'slot' in loc.where || loc.item.qty < 2) return false;
    const g = getGrid(w, loc.where.grid)!;
    const half = Math.floor(loc.item.qty / 2);
    const spot = findSpot(g, { ...loc.item, qty: half });
    return spot ? commit(splitStack(w, uid, half, { grid: loc.where.grid, x: spot.x, y: spot.y }, newUid())) : false;
  },

  bindQuick(slot: number, itemId: string | null): void {
    const p = useProfile.getState();
    const quick = p.loadout.quick.map((q) => (q === itemId ? null : q));
    quick[slot] = itemId;
    p.apply({ loadout: { ...p.loadout, quick } });
  },

  sortStash(): boolean {
    const p = useProfile.getState();
    const sorted = sortGrid(p.stash);
    if (!sorted) return false;
    p.apply({ stash: sorted });
    return true;
  },

  /** Does the player have any gun at all, anywhere? */
  hasAnyWeapon(): boolean {
    const p = useProfile.getState();
    if (loadoutItems(p.loadout).some((i) => itemDef(i.id).kind === 'weapon')) return true;
    return p.stash.items.some((q) => itemDef(q.item.id).kind === 'weapon' || !!q.item.contents?.items.some((c) => itemDef(c.item.id).kind === 'weapon'));
  },

  /**
   * The crew never lets you go out empty-handed. When you own no gun at all, the locker
   * hands out a crew-issue kit. Crew issue is worthless to traders, so it can't be farmed.
   */
  takeCrewKit(): boolean {
    if (ship.hasAnyWeapon()) return false;
    const p = useProfile.getState();
    let loadout = p.loadout;
    let stash = p.stash;
    const gun = createItem('sp5', { loaded: 7, crew: true });
    if (!loadout.secondary) loadout = { ...loadout, secondary: gun };
    else stash = addToGrid(stash, gun).grid;
    if (!loadout.backpack) loadout = { ...loadout, backpack: createItem('sack', { crew: true }) };
    const extras: ItemInstance[] = [
      createItem('ammo_9x18', { qty: 28, crew: true }),
      createItem('bandage', { crew: true }),
    ];
    for (const it of extras) {
      const r = loadoutAdd(loadout, it);
      loadout = r.loadout;
      if (r.rest) stash = addToGrid(stash, r.rest).grid;
    }
    if (!loadout.quick.includes('bandage')) loadout = { ...loadout, quick: ['bandage', ...loadout.quick.slice(1)] };
    p.apply({ loadout, stash });
    return true;
  },
};
