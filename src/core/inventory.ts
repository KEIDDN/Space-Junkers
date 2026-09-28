import { ITEMS, itemDef, type ItemDef } from '../data/items';
import { WEAPONS } from '../data/weapons';

/**
 * Inventory core: item instances, grids and the player's equipment.
 *
 * Everything here is pure and immutable (functions return new objects), so the same code
 * backs the ship stash, the raid inventory, loot containers, shops and quest hand-ins,
 * and plays well with React/Zustand. No rendering, no DOM.
 */

export interface ItemInstance {
  uid: string;
  id: string;
  /**
   * Units in this stack: rounds, bandages, kits. Always a count of physical things you own
   * (1 for anything that doesn't stack), never a strength or a charge.
   */
  qty: number;
  /** Condition, not quantity: armor durability or keycard uses left. */
  dur?: number;
  /** Weapons: rounds in the magazine and which ammo they are. */
  loaded?: number;
  ammoType?: string;
  /** Backpacks: what's inside. */
  contents?: Grid;
  /** Crew-issue gear: free, and worthless to traders. */
  crew?: boolean;
}

export interface Placed {
  item: ItemInstance;
  x: number;
  y: number;
  /** Rotated 90° (footprint w/h swapped). */
  rot: boolean;
}

export interface Grid {
  w: number;
  h: number;
  items: Placed[];
}

export type EquipSlot = 'primary' | 'secondary' | 'helmet' | 'armor' | 'backpack';
export const EQUIP_SLOTS: EquipSlot[] = ['primary', 'secondary', 'helmet', 'armor', 'backpack'];

export const QUICK_SLOTS = 4;
export const POCKETS = { w: 5, h: 2 };

export interface Loadout {
  primary: ItemInstance | null;
  secondary: ItemInstance | null;
  helmet: ItemInstance | null;
  armor: ItemInstance | null;
  backpack: ItemInstance | null;
  pockets: Grid;
  /**
   * Quick-use keys, bound to an item type (id), not to a hidden copy of it: a key uses a
   * real unit from the pockets or backpack. Bindings with nothing left to use are cleared
   * (see `pruneQuick`), so a key never points at an item the operator doesn't have.
   */
  quick: (string | null)[];
}

// ---------------------------------------------------------------------------
// Instances

let uidCounter = 0;
const uidSalt = Math.floor(Math.random() * 36 ** 4).toString(36);

export function newUid(): string {
  uidCounter = (uidCounter + 1) % 1_000_000;
  return `${Date.now().toString(36)}${uidSalt}${uidCounter.toString(36)}`;
}

export interface CreateOptions {
  qty?: number;
  /** Weapons: rounds loaded. Default: empty magazine. */
  loaded?: number;
  ammoType?: string;
  dur?: number;
  crew?: boolean;
}

/** A fresh item with sensible defaults for its kind. */
export function createItem(id: string, opts: CreateOptions = {}): ItemInstance {
  const def = itemDef(id);
  const item: ItemInstance = { uid: newUid(), id, qty: Math.max(1, Math.min(def.stack, opts.qty ?? 1)) };
  switch (def.kind) {
    case 'weapon': {
      const w = WEAPONS[def.weapon];
      item.loaded = Math.max(0, Math.min(w.magSize, opts.loaded ?? 0));
      item.ammoType = opts.ammoType ?? defaultAmmoId(w.caliber);
      break;
    }
    case 'armor':
    case 'helmet':
      item.dur = opts.dur ?? def.durability;
      break;
    case 'key':
      item.dur = opts.dur ?? def.uses;
      break;
    case 'backpack':
      item.contents = emptyGrid(def.grid.w, def.grid.h);
      break;
  }
  if (opts.crew) item.crew = true;
  return item;
}

function defaultAmmoId(caliber: string): string {
  let best: ItemDef | null = null;
  for (const d of Object.values(ITEMS)) {
    if (d.kind === 'ammo' && d.caliber === caliber && (!best || d.value < best.value)) best = d;
  }
  return best!.id;
}

// ---------------------------------------------------------------------------
// Grids

export function emptyGrid(w: number, h: number): Grid {
  return { w, h, items: [] };
}

export function footprint(item: ItemInstance, rot: boolean): { w: number; h: number } {
  const d = itemDef(item.id);
  return rot ? { w: d.h, h: d.w } : { w: d.w, h: d.h };
}

function overlaps(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number) {
  return ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah;
}

/** Is the rectangle free? `ignore` = uid of the item being moved within the same grid. */
export function canPlace(grid: Grid, item: ItemInstance, x: number, y: number, rot: boolean, ignore?: string): boolean {
  const { w, h } = footprint(item, rot);
  if (x < 0 || y < 0 || x + w > grid.w || y + h > grid.h) return false;
  for (const p of grid.items) {
    if (p.item.uid === ignore) continue;
    const f = footprint(p.item, p.rot);
    if (overlaps(x, y, w, h, p.x, p.y, f.w, f.h)) return false;
  }
  return true;
}

/** First free spot, scanning rows top to bottom. Tries unrotated first. */
export function findSpot(grid: Grid, item: ItemInstance): { x: number; y: number; rot: boolean } | null {
  const d = itemDef(item.id);
  const rots = d.w === d.h ? [false] : [false, true];
  for (let y = 0; y < grid.h; y++) {
    for (let x = 0; x < grid.w; x++) {
      for (const rot of rots) if (canPlace(grid, item, x, y, rot)) return { x, y, rot };
    }
  }
  return null;
}

export function place(grid: Grid, item: ItemInstance, x: number, y: number, rot: boolean): Grid {
  return { ...grid, items: [...grid.items, { item, x, y, rot }] };
}

export function removeUid(grid: Grid, uid: string): Grid {
  return { ...grid, items: grid.items.filter((p) => p.item.uid !== uid) };
}

export function findInGrid(grid: Grid, uid: string): Placed | undefined {
  return grid.items.find((p) => p.item.uid === uid);
}

export function itemAt(grid: Grid, x: number, y: number): Placed | undefined {
  return grid.items.find((p) => {
    const f = footprint(p.item, p.rot);
    return x >= p.x && x < p.x + f.w && y >= p.y && y < p.y + f.h;
  });
}

export function replaceItem(grid: Grid, item: ItemInstance): Grid {
  return { ...grid, items: grid.items.map((p) => (p.item.uid === item.uid ? { ...p, item } : p)) };
}

/**
 * Add an item anywhere it fits: tops up existing stacks first, then takes a free spot.
 * Returns the new grid and whatever didn't fit (null if everything went in).
 */
export function addToGrid(grid: Grid, item: ItemInstance): { grid: Grid; rest: ItemInstance | null } {
  const def = itemDef(item.id);
  let g = grid;
  let qty = item.qty;
  if (def.stack > 1) {
    const items = g.items.map((p) => {
      if (qty <= 0 || p.item.id !== item.id || p.item.qty >= def.stack) return p;
      const take = Math.min(qty, def.stack - p.item.qty);
      qty -= take;
      return { ...p, item: { ...p.item, qty: p.item.qty + take } };
    });
    g = { ...g, items };
    if (qty <= 0) return { grid: g, rest: null };
  }
  const rest = qty === item.qty ? item : { ...item, qty };
  const spot = findSpot(g, rest);
  if (!spot) return { grid: g, rest };
  return { grid: place(g, rest, spot.x, spot.y, spot.rot), rest: null };
}

/** Count of an item id (stacks summed). */
export function countInGrid(grid: Grid, id: string): number {
  let n = 0;
  for (const p of grid.items) if (p.item.id === id) n += p.item.qty;
  return n;
}

/**
 * Remove up to `qty` of an item id, smallest stacks first (keeps full stacks tidy).
 * Returns the new grid and how many were actually taken.
 */
export function takeFromGrid(grid: Grid, id: string, qty: number): { grid: Grid; taken: number } {
  let left = qty;
  const order = grid.items.filter((p) => p.item.id === id).sort((a, b) => a.item.qty - b.item.qty);
  const drop = new Set<string>();
  const change = new Map<string, number>();
  for (const p of order) {
    if (left <= 0) break;
    const take = Math.min(left, p.item.qty);
    left -= take;
    if (take === p.item.qty) drop.add(p.item.uid);
    else change.set(p.item.uid, p.item.qty - take);
  }
  const items = grid.items
    .filter((p) => !drop.has(p.item.uid))
    .map((p) => (change.has(p.item.uid) ? { ...p, item: { ...p.item, qty: change.get(p.item.uid)! } } : p));
  return { grid: { ...grid, items }, taken: qty - left };
}

/**
 * Repack everything: big items first, then by category and value. Merges partial stacks.
 * Returns null if the items can't all be repacked (the caller keeps the old layout).
 */
export function sortGrid(grid: Grid): Grid | null {
  const merged: ItemInstance[] = [];
  const stacks = new Map<string, ItemInstance>();
  for (const p of grid.items) {
    const d = itemDef(p.item.id);
    if (d.stack > 1) {
      const cur = stacks.get(d.id);
      if (cur && cur.qty < d.stack) {
        const take = Math.min(p.item.qty, d.stack - cur.qty);
        cur.qty += take;
        if (p.item.qty - take > 0) {
          const rest = { ...p.item, qty: p.item.qty - take };
          merged.push(rest);
          stacks.set(d.id, rest);
        }
        continue;
      }
      const copy = { ...p.item };
      merged.push(copy);
      stacks.set(d.id, copy);
    } else merged.push(p.item);
  }
  const catOrder = ['weapons', 'gear', 'ammo', 'medical'];
  merged.sort((a, b) => {
    const da = itemDef(a.id);
    const db = itemDef(b.id);
    const area = db.w * db.h - da.w * da.h;
    if (area) return area;
    const ca = catOrder.indexOf(da.category);
    const cb = catOrder.indexOf(db.category);
    if (ca !== cb) return (ca < 0 ? 99 : ca) - (cb < 0 ? 99 : cb);
    if (da.category !== db.category) return da.category < db.category ? -1 : 1;
    return db.value - da.value || (da.id < db.id ? -1 : 1);
  });
  let g = emptyGrid(grid.w, grid.h);
  for (const it of merged) {
    const spot = findSpot(g, it);
    if (!spot) return null;
    g = place(g, it, spot.x, spot.y, spot.rot);
  }
  return g;
}

export function gridItems(grid: Grid): ItemInstance[] {
  return grid.items.map((p) => p.item);
}

// ---------------------------------------------------------------------------
// Weight & value

export function itemWeight(item: ItemInstance): number {
  const d = itemDef(item.id);
  let w = d.weight * item.qty;
  if (item.contents) w += gridWeight(item.contents);
  if (d.kind === 'weapon' && item.loaded && item.ammoType) w += itemDef(item.ammoType).weight * item.loaded;
  return w;
}

export function gridWeight(grid: Grid): number {
  let w = 0;
  for (const p of grid.items) w += itemWeight(p.item);
  return w;
}

/**
 * Base value of an instance (what it's "worth", before vendor margins).
 * Worn armor and drained kits are worth proportionally less. Crew issue is worthless.
 */
export function itemValue(item: ItemInstance): number {
  if (item.crew) return 0;
  const d = itemDef(item.id);
  let v = d.value * item.qty;
  if ((d.kind === 'armor' || d.kind === 'helmet') && item.dur !== undefined) v *= 0.35 + 0.65 * (item.dur / d.durability);
  if (d.kind === 'key' && item.dur !== undefined) v *= item.dur / d.uses;
  return Math.round(v);
}

/** Value including anything inside (backpack contents, loaded rounds). */
export function itemValueDeep(item: ItemInstance): number {
  let v = itemValue(item);
  if (item.contents) v += gridValue(item.contents);
  if (item.loaded && item.ammoType && !item.crew) v += itemDef(item.ammoType).value * item.loaded;
  return v;
}

export function gridValue(grid: Grid): number {
  let v = 0;
  for (const p of grid.items) v += itemValueDeep(p.item);
  return v;
}

// ---------------------------------------------------------------------------
// Loadout

export function emptyLoadout(): Loadout {
  return {
    primary: null, secondary: null, helmet: null, armor: null, backpack: null,
    pockets: emptyGrid(POCKETS.w, POCKETS.h),
    quick: Array.from({ length: QUICK_SLOTS }, () => null),
  };
}

/** Can this item go in this equipment slot? */
export function slotAccepts(slot: EquipSlot, item: ItemInstance): boolean {
  const d = itemDef(item.id);
  switch (slot) {
    case 'primary': return d.kind === 'weapon';
    case 'secondary': return d.kind === 'weapon' && d.holster;
    case 'helmet': return d.kind === 'helmet';
    case 'armor': return d.kind === 'armor';
    case 'backpack': return d.kind === 'backpack';
  }
}

/** Grids the player can carry things in, in fill order for loot. */
export function carryGrids(l: Loadout): Grid[] {
  const out: Grid[] = [];
  if (l.backpack?.contents) out.push(l.backpack.contents);
  out.push(l.pockets);
  return out;
}

export function loadoutItems(l: Loadout): ItemInstance[] {
  const out: ItemInstance[] = [];
  for (const s of EQUIP_SLOTS) {
    const it = l[s];
    if (it) out.push(it);
  }
  out.push(...gridItems(l.pockets));
  if (l.backpack?.contents) out.push(...gridItems(l.backpack.contents));
  return out;
}

export function loadoutWeight(l: Loadout): number {
  let w = gridWeight(l.pockets);
  for (const s of EQUIP_SLOTS) {
    const it = l[s];
    if (it) w += itemWeight(it);
  }
  return w;
}

export function loadoutValue(l: Loadout): number {
  let v = gridValue(l.pockets);
  for (const s of EQUIP_SLOTS) {
    const it = l[s];
    if (it) v += itemValueDeep(it);
  }
  return v;
}

export function loadoutCount(l: Loadout, id: string): number {
  return countInGrid(l.pockets, id) + (l.backpack?.contents ? countInGrid(l.backpack.contents, id) : 0);
}

/** Can this item be bound to a quick-use key at all? */
export function quickUsable(id: string): boolean {
  const k = itemDef(id).kind;
  return k === 'med' || k === 'grenade';
}

/**
 * Drop quick-use bindings that point at nothing: an item type the operator no longer
 * carries in pockets or backpack (used up, dropped, stashed, lost). Returns the same object
 * when nothing changed, so it is cheap to run after every inventory write.
 */
export function pruneQuick(l: Loadout): Loadout {
  let changed = l.quick.length !== QUICK_SLOTS;
  const quick = Array.from({ length: QUICK_SLOTS }, (_, i) => {
    const id = l.quick[i] ?? null;
    if (id && (!ITEMS[id] || !quickUsable(id) || loadoutCount(l, id) === 0)) {
      changed = true;
      return null;
    }
    return id;
  });
  return changed ? { ...l, quick } : l;
}

/** Bind an item type to a key (unbinding it from any other key). Only carried items bind. */
export function bindQuickSlot(l: Loadout, slot: number, id: string | null): Loadout {
  if (slot < 0 || slot >= QUICK_SLOTS) return l;
  if (id && (!quickUsable(id) || loadoutCount(l, id) === 0)) return l;
  const quick = l.quick.map((q) => (q === id ? null : q));
  quick[slot] = id;
  return { ...l, quick };
}

function withBackpackGrid(l: Loadout, grid: Grid): Loadout {
  return { ...l, backpack: { ...l.backpack!, contents: grid } };
}

/**
 * Put an item into the carried grids. Consumables and ammo prefer pockets (quick to reach),
 * everything else prefers the backpack. Returns what didn't fit.
 */
export function loadoutAdd(l: Loadout, item: ItemInstance): { loadout: Loadout; rest: ItemInstance | null } {
  const d = itemDef(item.id);
  const pocketsFirst = d.kind === 'ammo' || d.kind === 'med' || d.kind === 'grenade' || d.kind === 'key';
  const order: ('pockets' | 'backpack')[] = pocketsFirst ? ['pockets', 'backpack'] : ['backpack', 'pockets'];
  let lo = l;
  let rest: ItemInstance | null = item;
  for (const where of order) {
    if (!rest) break;
    if (where === 'pockets') {
      const r = addToGrid(lo.pockets, rest);
      lo = { ...lo, pockets: r.grid };
      rest = r.rest;
    } else if (lo.backpack?.contents) {
      const r = addToGrid(lo.backpack.contents, rest);
      lo = withBackpackGrid(lo, r.grid);
      rest = r.rest;
    }
  }
  return { loadout: lo, rest };
}

/** Remove up to qty of an item id from carried grids (pockets first). */
export function loadoutTake(l: Loadout, id: string, qty: number): { loadout: Loadout; taken: number } {
  const a = takeFromGrid(l.pockets, id, qty);
  let lo: Loadout = { ...l, pockets: a.grid };
  let taken = a.taken;
  if (taken < qty && lo.backpack?.contents) {
    const b = takeFromGrid(lo.backpack.contents, id, qty - taken);
    lo = withBackpackGrid(lo, b.grid);
    taken += b.taken;
  }
  return { loadout: lo, taken };
}

/** Update an instance wherever it is in the loadout (slots, pockets, backpack). */
export function loadoutUpdate(l: Loadout, item: ItemInstance): Loadout {
  for (const s of EQUIP_SLOTS) {
    if (l[s]?.uid === item.uid) return { ...l, [s]: item };
  }
  if (findInGrid(l.pockets, item.uid)) return { ...l, pockets: replaceItem(l.pockets, item) };
  if (l.backpack?.contents && findInGrid(l.backpack.contents, item.uid)) {
    return withBackpackGrid(l, replaceItem(l.backpack.contents, item));
  }
  return l;
}

/** Remove an instance from wherever it is in the loadout. */
export function loadoutRemove(l: Loadout, uid: string): Loadout {
  for (const s of EQUIP_SLOTS) {
    if (l[s]?.uid === uid) return { ...l, [s]: null };
  }
  if (findInGrid(l.pockets, uid)) return { ...l, pockets: removeUid(l.pockets, uid) };
  if (l.backpack?.contents && findInGrid(l.backpack.contents, uid)) {
    return withBackpackGrid(l, removeUid(l.backpack.contents, uid));
  }
  return l;
}

export function loadoutFind(l: Loadout, uid: string): ItemInstance | undefined {
  return loadoutItems(l).find((i) => i.uid === uid);
}

/**
 * Movement multiplier from carried weight and armor. Light loads are free; heavy loads slow
 * you down (and a slower player is a louder, easier target to flank).
 */
export function speedMultiplier(l: Loadout): number {
  const kg = loadoutWeight(l);
  let m = 1;
  if (kg > 22) m -= Math.min(0.3, (kg - 22) * 0.012);
  for (const s of ['helmet', 'armor'] as const) {
    const it = l[s];
    if (it) {
      const d = itemDef(it.id);
      if (d.kind === 'armor' || d.kind === 'helmet') m *= d.speedMul;
    }
  }
  return m;
}
