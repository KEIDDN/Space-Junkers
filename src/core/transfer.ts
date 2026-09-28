import { itemDef } from '../data/items';
import { WEAPONS } from '../data/weapons';
import {
  EQUIP_SLOTS, addToGrid, canPlace, findInGrid, findSpot, footprint, itemAt, place, removeUid, replaceItem,
  slotAccepts, type EquipSlot, type Grid, type ItemInstance, type Loadout,
} from './inventory';

/**
 * Moving items between the places the UI shows side by side: the ship stash, the equipped
 * loadout (slots, pockets, backpack), an opened loot container or ground pile, and bags
 * stored in the stash. Pure: every operation returns a new Workspace, or null if illegal.
 */

export type GridKey = 'stash' | 'pockets' | 'backpack' | 'external' | `bag:${string}`;

export type Target =
  | { grid: GridKey; x: number; y: number; rot: boolean }
  | { slot: EquipSlot };

export interface Workspace {
  loadout: Loadout;
  stash: Grid | null;
  /** An open container, corpse or ground pile during a raid. */
  external: Grid | null;
}

export type Where = { grid: GridKey } | { slot: EquipSlot };

export function getGrid(ws: Workspace, key: GridKey): Grid | null {
  switch (key) {
    case 'stash': return ws.stash;
    case 'external': return ws.external;
    case 'pockets': return ws.loadout.pockets;
    case 'backpack': return ws.loadout.backpack?.contents ?? null;
    default: {
      const uid = key.slice(4);
      return ws.stash ? findInGrid(ws.stash, uid)?.item.contents ?? null : null;
    }
  }
}

export function setGrid(ws: Workspace, key: GridKey, grid: Grid): Workspace {
  switch (key) {
    case 'stash': return { ...ws, stash: grid };
    case 'external': return { ...ws, external: grid };
    case 'pockets': return { ...ws, loadout: { ...ws.loadout, pockets: grid } };
    case 'backpack': return { ...ws, loadout: { ...ws.loadout, backpack: { ...ws.loadout.backpack!, contents: grid } } };
    default: {
      const uid = key.slice(4);
      const bag = findInGrid(ws.stash!, uid)!.item;
      return { ...ws, stash: replaceItem(ws.stash!, { ...bag, contents: grid }) };
    }
  }
}

const GRID_KEYS: GridKey[] = ['pockets', 'backpack', 'stash', 'external'];

/** Where an item currently is. */
export function locate(ws: Workspace, uid: string): { where: Where; item: ItemInstance } | null {
  for (const s of EQUIP_SLOTS) {
    const it = ws.loadout[s];
    if (it?.uid === uid) return { where: { slot: s }, item: it };
  }
  for (const k of GRID_KEYS) {
    const g = getGrid(ws, k);
    const p = g && findInGrid(g, uid);
    if (p) return { where: { grid: k }, item: p.item };
  }
  if (ws.stash) {
    for (const p of ws.stash.items) {
      if (!p.item.contents) continue;
      const inner = findInGrid(p.item.contents, uid);
      if (inner) return { where: { grid: `bag:${p.item.uid}` }, item: inner.item };
    }
  }
  return null;
}

function detach(ws: Workspace, where: Where, uid: string): Workspace {
  if ('slot' in where) return { ...ws, loadout: { ...ws.loadout, [where.slot]: null } };
  return setGrid(ws, where.grid, removeUid(getGrid(ws, where.grid)!, uid));
}

/** A backpack with contents may only rest in the stash or on the ground. Nothing nests in itself. */
function gridAccepts(key: GridKey, item: ItemInstance): boolean {
  const def = itemDef(item.id);
  if (def.kind !== 'backpack') return true;
  if (key === `bag:${item.uid}`) return false;
  const full = !!item.contents && item.contents.items.length > 0;
  return !full || key === 'stash' || key === 'external';
}

/**
 * Move an item to a target. Dropping onto a matching stack merges; dropping onto an
 * occupied equipment slot swaps if the displaced item fits back where this one came from.
 */
export function moveItem(ws: Workspace, uid: string, to: Target): Workspace | null {
  const src = locate(ws, uid);
  if (!src) return null;
  const item = src.item;

  if ('slot' in to) {
    if (!slotAccepts(to.slot, item)) return null;
    if ('slot' in src.where && src.where.slot === to.slot) return ws;
    // The backpack slot can't take a bag while you're wearing the one it came out of.
    if (to.slot === 'backpack' && 'grid' in src.where && src.where.grid === 'backpack') return null;
    const displaced = ws.loadout[to.slot];
    let next = detach(ws, src.where, uid);
    next = { ...next, loadout: { ...next.loadout, [to.slot]: item } };
    if (!displaced) return next;
    // Swap: the displaced item goes back to where the moved one was.
    if ('slot' in src.where) {
      if (!slotAccepts(src.where.slot, displaced)) return null;
      return { ...next, loadout: { ...next.loadout, [src.where.slot]: displaced } };
    }
    const key = src.where.grid;
    if (key === 'backpack' && to.slot === 'backpack') return null;
    const g = getGrid(next, key);
    if (!g || !gridAccepts(key, displaced)) return null;
    const spot = findSpot(g, displaced);
    if (!spot) return null;
    return setGrid(next, key, place(g, displaced, spot.x, spot.y, spot.rot));
  }

  // Grid target
  if (to.grid === 'backpack' && 'slot' in src.where && src.where.slot === 'backpack') return null;
  if (!gridAccepts(to.grid, item)) return null;
  const sameGrid = 'grid' in src.where && src.where.grid === to.grid;
  const target = getGrid(ws, to.grid);
  if (!target) return null;

  // Merge into a stack under the cursor.
  const under = itemAt(target, to.x, to.y);
  const def = itemDef(item.id);
  if (under && under.item.uid !== uid && under.item.id === item.id && def.stack > 1 && under.item.qty < def.stack) {
    const take = Math.min(item.qty, def.stack - under.item.qty);
    let next = ws;
    next = setGrid(next, to.grid, replaceItem(getGrid(next, to.grid)!, { ...under.item, qty: under.item.qty + take }));
    const left = item.qty - take;
    if (left <= 0) return detach(next, src.where, uid);
    if ('slot' in src.where) return next; // slots never hold stacks
    return setGrid(next, src.where.grid, replaceItem(getGrid(next, src.where.grid)!, { ...item, qty: left }));
  }

  if (!canPlace(target, item, to.x, to.y, to.rot, sameGrid ? uid : undefined)) return null;
  let next = detach(ws, src.where, uid);
  next = setGrid(next, to.grid, place(getGrid(next, to.grid)!, item, to.x, to.y, to.rot));
  return next;
}

/**
 * Shift-click: move to the first grid in `order` with space (stacks merge automatically).
 * Equippable items go to an empty matching slot first when `equip` is set.
 */
export function quickMove(ws: Workspace, uid: string, order: GridKey[], equip = false): Workspace | null {
  const src = locate(ws, uid);
  if (!src) return null;
  const item = src.item;
  if (equip) {
    for (const s of EQUIP_SLOTS) {
      if (!ws.loadout[s] && slotAccepts(s, item)) return moveItem(ws, uid, { slot: s });
    }
  }
  for (const key of order) {
    if ('grid' in src.where && src.where.grid === key) continue;
    const g = getGrid(ws, key);
    if (!g || !gridAccepts(key, item)) continue;
    const detached = detach(ws, src.where, uid);
    const r = addToGrid(getGrid(detached, key)!, item);
    if (r.rest && r.rest.qty === item.qty) continue; // nothing fit
    let next = setGrid(detached, key, r.grid);
    if (r.rest) {
      // Partly merged: the remainder stays where it was.
      if ('slot' in src.where) return null;
      next = setGrid(next, src.where.grid, place(getGrid(next, src.where.grid)!, r.rest, ...spotOf(ws, src.where.grid, uid)));
    }
    return next;
  }
  return null;
}

function spotOf(ws: Workspace, key: GridKey, uid: string): [number, number, boolean] {
  const p = findInGrid(getGrid(ws, key)!, uid)!;
  return [p.x, p.y, p.rot];
}

/**
 * Split `qty` off a stack into a target cell. Atomic: either both stacks exist afterwards
 * (source reduced, new stack placed, quantities summing to the original) or nothing changes.
 */
export function splitStack(
  ws: Workspace, uid: string, qty: number, to: { grid: GridKey; x: number; y: number; rot?: boolean }, newUid: string,
): Workspace | null {
  const src = locate(ws, uid);
  if (!src || 'slot' in src.where || !Number.isInteger(qty) || qty <= 0 || qty >= src.item.qty) return null;
  const part: ItemInstance = { ...src.item, uid: newUid, qty };
  const target = getGrid(ws, to.grid);
  if (!target || !gridAccepts(to.grid, part)) return null;
  const rot = !!to.rot;
  // Placing into the same grid must not overlap the source stack.
  if (!canPlace(target, part, to.x, to.y, rot)) return null;
  let next = setGrid(ws, src.where.grid, replaceItem(getGrid(ws, src.where.grid)!, { ...src.item, qty: src.item.qty - qty }));
  next = setGrid(next, to.grid, place(getGrid(next, to.grid)!, part, to.x, to.y, rot));
  return next;
}

/** The quantities a stack of `qty` can be split into: taking 1 up to qty - 1 off it. */
export function splitRange(qty: number): { min: number; max: number } | null {
  return qty >= 2 ? { min: 1, max: qty - 1 } : null;
}

/**
 * Read a typed split amount. Anything that isn't a whole number from 1 to qty - 1 is
 * refused (null) rather than guessed at.
 */
export function parseSplitQty(text: string, qty: number): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  const r = splitRange(qty);
  return r && n >= r.min && n <= r.max ? n : null;
}

/**
 * Split with no target chosen (the SPLIT action): the new stack goes to the first free spot
 * in the same grid, then, for carried stacks, in the other carried grid (pockets ↔ backpack).
 * Returns null when there is no room anywhere: nothing is ever split onto the floor.
 */
export function splitStackAuto(ws: Workspace, uid: string, qty: number, newUid: string): Workspace | null {
  const src = locate(ws, uid);
  if (!src || 'slot' in src.where) return null;
  const from = src.where.grid;
  const order: GridKey[] = from === 'pockets' ? ['pockets', 'backpack'] : from === 'backpack' ? ['backpack', 'pockets'] : [from];
  const part: ItemInstance = { ...src.item, uid: newUid, qty };
  for (const key of order) {
    const g = getGrid(ws, key);
    if (!g) continue;
    const spot = findSpot(g, part);
    if (!spot) continue;
    const next = splitStack(ws, uid, qty, { grid: key, x: spot.x, y: spot.y, rot: spot.rot }, newUid);
    if (next) return next;
  }
  return null;
}

/** Remove an item from wherever it is. */
export function removeItem(ws: Workspace, uid: string): { ws: Workspace; item: ItemInstance } | null {
  const src = locate(ws, uid);
  if (!src) return null;
  return { ws: detach(ws, src.where, uid), item: src.item };
}

/** Replace an instance in place (durability, loaded rounds...). */
export function updateItem(ws: Workspace, item: ItemInstance): Workspace {
  const src = locate(ws, item.uid);
  if (!src) return ws;
  if ('slot' in src.where) return { ...ws, loadout: { ...ws.loadout, [src.where.slot]: item } };
  return setGrid(ws, src.where.grid, replaceItem(getGrid(ws, src.where.grid)!, item));
}

/**
 * Unload a weapon: its rounds go into the carried grids / stash. Returns null if they don't fit.
 */
export function unloadWeapon(ws: Workspace, uid: string, into: GridKey[], makeUid: () => string): Workspace | null {
  const src = locate(ws, uid);
  if (!src || !src.item.loaded || !src.item.ammoType) return null;
  let next = updateItem(ws, { ...src.item, loaded: 0 });
  let rest: ItemInstance | null = { uid: makeUid(), id: src.item.ammoType, qty: src.item.loaded };
  for (const key of into) {
    const g = getGrid(next, key);
    if (!g || !rest) continue;
    const r = addToGrid(g, rest);
    next = setGrid(next, key, r.grid);
    rest = r.rest;
  }
  return rest ? null : next;
}

/**
 * Load a stack of ammo into a weapon (drag ammo onto a gun). Rounds of a different type
 * already in the magazine are swapped out into the ammo's old spot.
 */
export function loadWeapon(ws: Workspace, weaponUid: string, ammoUid: string, makeUid: () => string): Workspace | null {
  const w = locate(ws, weaponUid);
  const a = locate(ws, ammoUid);
  if (!w || !a || 'slot' in a.where) return null;
  const wd = itemDef(w.item.id);
  const ad = itemDef(a.item.id);
  if (wd.kind !== 'weapon' || ad.kind !== 'ammo') return null;
  const gun = WEAPONS[wd.weapon];
  if (ad.caliber !== gun.caliber) return null;
  const sameType = w.item.ammoType === ad.id;
  const room = gun.magSize - (sameType ? w.item.loaded ?? 0 : 0);
  if (room <= 0) return null;
  const take = Math.min(room, a.item.qty);
  const old = !sameType && w.item.loaded ? { id: w.item.ammoType!, qty: w.item.loaded } : null;

  let next = updateItem(ws, { ...w.item, ammoType: ad.id, loaded: (sameType ? w.item.loaded ?? 0 : 0) + take });
  const key = a.where.grid;
  const left = a.item.qty - take;
  const g = getGrid(next, key)!;
  next = setGrid(next, key, left > 0 ? replaceItem(g, { ...a.item, qty: left }) : removeUid(g, ammoUid));
  if (old) {
    const r = addToGrid(getGrid(next, key)!, { uid: makeUid(), id: old.id, qty: old.qty });
    if (r.rest) return null;
    next = setGrid(next, key, r.grid);
  }
  return next;
}

export { footprint };
