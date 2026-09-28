import { ITEMS, itemDef } from '../data/items';
import { WEAPONS } from '../data/weapons';
import {
  EQUIP_SLOTS, QUICK_SLOTS, POCKETS, addToGrid, canPlace, createItem, emptyGrid, emptyLoadout, footprint,
  pruneQuick, slotAccepts, type Grid, type ItemInstance, type Loadout,
} from './inventory';

/**
 * The persistent save. Everything that survives death lives here.
 * Versioned: `migrate` upgrades any older save, `repair` makes any save safe to load.
 */

export const PROFILE_VERSION = 1;

export const STASH_WIDTH = 10;
export const STASH_BASE_ROWS = 12;

export type Operator = 'm' | 'f';

export interface CrewState {
  /** Trust points earned with this crew member. Levels unlock stock and quests. */
  trust: number;
  /** Has the player talked to them yet. */
  met: boolean;
}

export interface QuestState {
  status: 'active' | 'complete' | 'turnedIn';
  /** Progress per objective. */
  progress: number[];
}

export interface RaidMarker {
  destination: string;
  seed: number;
  startedAt: number;
}

/** A paid jump: where the ship is now, and which facility the operator will deploy into. */
export interface Course {
  destination: string;
  seed: number;
}

export interface Stats {
  raids: number;
  extractions: number;
  deaths: number;
  kills: number;
  creditsEarned: number;
  bestHaul: number;
}

export interface Profile {
  version: number;
  operator: Operator;
  credits: number;
  stash: Grid;
  loadout: Loadout;
  crew: Record<string, CrewState>;
  quests: Record<string, QuestState>;
  /** Destination ids the player can travel to. */
  destinations: string[];
  /** Installed ship upgrade ids. */
  upgrades: string[];
  /** One-off story/tutorial flags. */
  flags: Record<string, boolean>;
  /** Advances once per raid. Drives market rotation and vendor restocks. */
  day: number;
  /** Purchases per vendor stock entry this day (limited stock). */
  purchases: Record<string, number>;
  /** Set while a raid is running. If it is still set on load, the raid was abandoned. */
  raid: RaidMarker | null;
  /** Course laid in at the nav console (fuel already paid). Cleared on deploy. */
  course: Course | null;
  stats: Stats;
  /** Lore entries the operator has read (ids): threads unfold in order across raids. */
  lore: string[];
}

export const STARTING_CREDITS = 3500;

export function newProfile(operator: Operator = 'm'): Profile {
  const loadout = emptyLoadout();
  loadout.secondary = createItem('pm9', { loaded: 9 });
  loadout.backpack = createItem('sack');
  loadout.pockets = addAll(loadout.pockets, [
    createItem('ammo_9x18', { qty: 45 }),
    createItem('bandage'),
    createItem('bandage'),
  ]);
  loadout.quick = ['bandage', null, null, null];

  let stash = emptyGrid(STASH_WIDTH, STASH_BASE_ROWS);
  stash = addAll(stash, [
    createItem('obrez', { loaded: 2 }),
    createItem('ammo_12buck', { qty: 20 }),
    createItem('ammo_9x18', { qty: 60 }),
    createItem('carkit'),
    createItem('pills'),
    createItem('respcap'),
    createItem('rations'),
    createItem('vodka'),
    createItem('scrap'),
    createItem('scrap'),
  ]);

  return {
    version: PROFILE_VERSION,
    operator,
    credits: STARTING_CREDITS,
    stash,
    loadout,
    crew: {},
    quests: {},
    destinations: ['tikhaya'],
    upgrades: [],
    flags: {},
    day: 1,
    purchases: {},
    raid: null,
    course: null,
    stats: { raids: 0, extractions: 0, deaths: 0, kills: 0, creditsEarned: 0, bestHaul: 0 },
    lore: [],
  };
}

function addAll(grid: Grid, items: ItemInstance[]): Grid {
  let g = grid;
  for (const it of items) g = addToGrid(g, it).grid;
  return g;
}

// ---------------------------------------------------------------------------
// Migration

/** Build 0.2 stored `{ stash: { itemId: qty }, extractions, deaths }` with no version. */
interface LegacyV0 {
  stash?: Record<string, number>;
  extractions?: number;
  deaths?: number;
}

/**
 * Upgrade any stored shape to the current version. Unknown shapes start a new profile.
 * @returns the migrated profile and human-readable notes about what changed.
 */
export function migrate(raw: unknown, fromVersion: number): { profile: Profile; notes: string[] } {
  const notes: string[] = [];
  if (!raw || typeof raw !== 'object') return { profile: newProfile(), notes };

  if (fromVersion < 1) {
    const old = raw as LegacyV0;
    const p = newProfile();
    p.stats.extractions = num(old.extractions);
    p.stats.deaths = num(old.deaths);
    p.stats.raids = p.stats.extractions + p.stats.deaths;
    let credited = 0;
    for (const [id, qty] of Object.entries(old.stash ?? {})) {
      if (!ITEMS[id]) continue;
      for (let i = 0; i < Math.min(num(qty), 200); i++) {
        const r = addToGrid(p.stash, createItem(id));
        p.stash = r.grid;
        // Anything that doesn't fit is paid out at base value rather than lost.
        if (r.rest) credited += itemDef(id).value;
      }
    }
    if (credited) {
      p.credits += credited;
      notes.push(`Stash overflow sold for ${credited} KR.`);
    }
    p.flags.started = true;
    notes.push('Save upgraded from build 0.2. Your stash was moved to the ship.');
    return { profile: repair(p).profile, notes };
  }

  return { profile: repair(raw as Profile).profile, notes };
}

// ---------------------------------------------------------------------------
// Repair: never trust stored data.

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function repairItem(raw: unknown, seen: Set<string>): ItemInstance | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ItemInstance>;
  if (typeof r.id !== 'string' || !ITEMS[r.id]) return null;
  const def = itemDef(r.id);
  let uid = typeof r.uid === 'string' && r.uid ? r.uid : '';
  if (!uid || seen.has(uid)) uid = createItem(r.id).uid; // duplicate uids would alias items
  seen.add(uid);
  const it: ItemInstance = { uid, id: r.id, qty: Math.max(1, Math.min(def.stack, Math.floor(num(r.qty, 1)))) };
  if (r.crew) it.crew = true;
  switch (def.kind) {
    case 'weapon': {
      const w = WEAPONS[def.weapon];
      const ammo = typeof r.ammoType === 'string' ? ITEMS[r.ammoType] : undefined;
      it.ammoType = ammo && ammo.kind === 'ammo' && ammo.caliber === w.caliber ? ammo.id : createItem(r.id).ammoType;
      it.loaded = Math.max(0, Math.min(w.magSize, Math.floor(num(r.loaded))));
      break;
    }
    case 'armor':
    case 'helmet':
      it.dur = Math.max(0, Math.min(def.durability, num(r.dur, def.durability)));
      break;
    case 'med':
      // Older saves kept a medkit's remaining health pool in `dur`. A kit is a unit now;
      // whatever was left of it is one kit, and the pool is dropped (not read as a count).
      break;
    case 'key':
      it.dur = Math.max(1, Math.min(def.uses, Math.floor(num(r.dur, def.uses))));
      break;
    case 'backpack':
      it.contents = repairGrid(r.contents, def.grid.w, def.grid.h, seen, true);
      break;
  }
  return it;
}

/**
 * Rebuild a grid keeping every valid item that still fits where it was, then re-adding
 * displaced items anywhere. Items that can't fit at all are dropped (reported by caller via value).
 */
function repairGrid(raw: unknown, w: number, h: number, seen: Set<string>, inBag = false): Grid {
  let g = emptyGrid(w, h);
  const items = raw && typeof raw === 'object' && Array.isArray((raw as Grid).items) ? (raw as Grid).items : [];
  const homeless: ItemInstance[] = [];
  for (const p of items) {
    const it = repairItem(p?.item, seen);
    if (!it) continue;
    // Full backpacks can't nest inside other backpacks.
    if (inBag && it.contents && it.contents.items.length) continue;
    const x = Math.floor(num(p.x, -1));
    const y = Math.floor(num(p.y, -1));
    const rot = !!p.rot;
    if (canPlace(g, it, x, y, rot)) g = { ...g, items: [...g.items, { item: it, x, y, rot }] };
    else homeless.push(it);
  }
  for (const it of homeless) g = addToGrid(g, it).grid;
  return g;
}

export function stashRows(upgrades: string[]): number {
  return STASH_BASE_ROWS + upgrades.filter((u) => u.startsWith('stash')).length * 6;
}

export function repair(raw: Profile): { profile: Profile; notes: string[] } {
  const notes: string[] = [];
  const seen = new Set<string>();
  const base = newProfile();
  const p: Profile = {
    ...base,
    version: PROFILE_VERSION,
    operator: raw.operator === 'f' ? 'f' : 'm',
    credits: Math.max(0, Math.floor(num(raw.credits, base.credits))),
    upgrades: Array.isArray(raw.upgrades) ? raw.upgrades.filter((u) => typeof u === 'string') : [],
    destinations: Array.isArray(raw.destinations) && raw.destinations.length
      ? raw.destinations.filter((d) => typeof d === 'string') : base.destinations,
    flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
    day: Math.max(1, Math.floor(num(raw.day, 1))),
    purchases: raw.purchases && typeof raw.purchases === 'object' ? { ...raw.purchases } : {},
    crew: raw.crew && typeof raw.crew === 'object' ? { ...raw.crew } : {},
    quests: raw.quests && typeof raw.quests === 'object' ? { ...raw.quests } : {},
    raid: raw.raid && typeof raw.raid === 'object' ? raw.raid : null,
    course: raw.course && typeof raw.course === 'object' && typeof raw.course.destination === 'string'
      && Number.isFinite(raw.course.seed) ? { destination: raw.course.destination, seed: raw.course.seed } : null,
    stats: { ...base.stats, ...(raw.stats ?? {}) },
    lore: Array.isArray(raw.lore) ? raw.lore.filter((x: unknown): x is string => typeof x === 'string') : [],
  };
  if (!p.destinations.includes('tikhaya')) p.destinations.unshift('tikhaya');

  p.stash = repairGrid(raw.stash, STASH_WIDTH, stashRows(p.upgrades), seen);

  const lo = emptyLoadout();
  const rl = (raw.loadout ?? {}) as Partial<Loadout>;
  for (const s of EQUIP_SLOTS) {
    const it = repairItem(rl[s], seen);
    if (it && slotAccepts(s, it)) lo[s] = it;
    else if (it) p.stash = addToGrid(p.stash, it).grid;
  }
  lo.pockets = repairGrid(rl.pockets, POCKETS.w, POCKETS.h, seen, true);
  const quick = Array.isArray(rl.quick) ? rl.quick : [];
  lo.quick = Array.from({ length: QUICK_SLOTS }, (_, i) => (typeof quick[i] === 'string' && ITEMS[quick[i] as string] ? quick[i] : null));
  p.loadout = pruneQuick(lo);
  return { profile: p, notes };
}

export { footprint };
