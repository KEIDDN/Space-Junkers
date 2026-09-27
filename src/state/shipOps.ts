import { EQUIP_SLOTS, findSpot, newUid, slotAccepts, sortGrid } from '../core/inventory';
import {
  getGrid, loadWeapon, locate, moveItem, quickMove, splitStack, unloadWeapon,
  type GridKey, type Target, type Workspace,
} from '../core/transfer';
import { hasUsableGun, issueReserve } from '../core/reserve';
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

  /** Can the operator go out armed: a gun with rounds for it, anywhere aboard? */
  hasAnyWeapon(): boolean {
    const p = useProfile.getState();
    return hasUsableGun(p.loadout, p.stash);
  },

  /**
   * The ship's reserve (see core/reserve.ts): fills in a crew-issue sidearm with rounds and
   * a sack when the operator has lost theirs. Returns what was handed out.
   */
  stockReserve(): string[] {
    const p = useProfile.getState();
    const r = issueReserve(p.loadout, p.stash);
    if (r.issued.length) p.apply({ loadout: r.loadout, stash: r.stash });
    return r.issued;
  },

  /** The stash button for the same thing (kept for saves that arrive short). */
  takeCrewKit(): boolean {
    return ship.stockReserve().length > 0;
  },
};
