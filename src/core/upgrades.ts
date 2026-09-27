import { CREW_IDS } from '../data/crew';
import { itemDef, type ArmorDef } from '../data/items';
import { UPGRADE, type UpgradeDef } from '../data/upgrades';
import { countInGrid, takeFromGrid, type ItemInstance } from './inventory';
import { stashRows, type Profile } from './profile';
import { locate, updateItem, type Workspace } from './transfer';

/** Ship upgrades and the services they unlock. Pure. */

export type UpgradeStatus = 'installed' | 'locked' | 'available';

export function upgradeStatus(p: Profile, id: string): UpgradeStatus {
  if (p.upgrades.includes(id)) return 'installed';
  const u = UPGRADE[id];
  if (u.requires?.some((r) => !p.upgrades.includes(r))) return 'locked';
  return 'available';
}

/** How many of an item the stash holds (hand-ins for ship work come from the stash). */
export function stashCount(p: Profile, id: string): number {
  return countInGrid(p.stash, id);
}

export function canAfford(p: Profile, u: UpgradeDef): boolean {
  return p.credits >= u.cost && u.items.every(([id, n]) => stashCount(p, id) >= n);
}

export type InstallResult = { ok: true; profile: Profile } | { ok: false; error: string };

export function install(p: Profile, id: string): InstallResult {
  const u = UPGRADE[id];
  if (!u) return { ok: false, error: 'Unknown work order.' };
  const st = upgradeStatus(p, id);
  if (st === 'installed') return { ok: false, error: 'Already done.' };
  if (st === 'locked') return { ok: false, error: 'Needs other work first.' };
  if (p.credits < u.cost) return { ok: false, error: 'Not enough kosmorubli.' };
  let stash = p.stash;
  for (const [itemId, n] of u.items) {
    if (countInGrid(stash, itemId) < n) return { ok: false, error: `Missing ${itemDef(itemId).name}.` };
    stash = takeFromGrid(stash, itemId, n).grid;
  }
  const upgrades = [...p.upgrades, id];
  // Bigger lockers: the stash grid grows, items stay where they are.
  stash = { ...stash, h: Math.max(stash.h, stashRows(upgrades)) };
  let crew = p.crew;
  if (id === 'lounge') {
    crew = { ...crew };
    for (const c of CREW_IDS) crew[c] = { trust: (crew[c]?.trust ?? 0) + 5, met: crew[c]?.met ?? false };
  }
  return { ok: true, profile: { ...p, credits: p.credits - u.cost, stash, upgrades, crew } };
}

/** Fuel price after the reactor overhaul. */
export function travelCost(p: Pick<Profile, 'upgrades'>, base: number): number {
  return p.upgrades.includes('reactor') ? Math.round(base * 0.7) : base;
}

/** The home moon every operator can always get back to. */
export const FALLBACK_DESTINATION = 'tikhaya';

/**
 * What a jump actually costs. Nobody is ever stranded: when you can't pay for the short
 * hop to the home moon, Fedya flies you there on his tab.
 */
export function jumpCost(p: Pick<Profile, 'upgrades' | 'credits'>, destination: string, base: number): { cost: number; onTab: boolean } {
  const cost = travelCost(p, base);
  if (destination === FALLBACK_DESTINATION && p.credits < cost) return { cost: 0, onTab: true };
  return { cost, onTab: false };
}

// ---------------------------------------------------------------------------
// Armor repair at Molot's bench

export function repairCost(item: ItemInstance): number | null {
  const d = itemDef(item.id);
  if (d.kind !== 'armor' && d.kind !== 'helmet') return null;
  const a = d as ArmorDef;
  const missing = 1 - (item.dur ?? a.durability) / a.durability;
  if (missing <= 0.001) return null;
  return Math.max(50, Math.ceil(a.value * missing * 0.45));
}

export function repair(p: Profile, uid: string): InstallResult {
  if (!p.upgrades.includes('workbench')) return { ok: false, error: 'No bench to work on.' };
  const ws: Workspace = { loadout: p.loadout, stash: p.stash, external: null };
  const loc = locate(ws, uid);
  if (!loc) return { ok: false, error: 'Item not found.' };
  const cost = repairCost(loc.item);
  if (cost === null) return { ok: false, error: 'Nothing to fix.' };
  if (p.credits < cost) return { ok: false, error: 'Not enough kosmorubli.' };
  const d = itemDef(loc.item.id) as ArmorDef;
  const next = updateItem(ws, { ...loc.item, dur: d.durability });
  return { ok: true, profile: { ...p, credits: p.credits - cost, stash: next.stash!, loadout: next.loadout } };
}

