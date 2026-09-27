import { emptyLoadout, itemValueDeep, loadoutItems, type ItemInstance, type Loadout } from './inventory';
import type { Profile } from './profile';

/**
 * How a raid changes the save. Deploying marks the raid as running (so quitting mid-raid
 * can't dodge death); extracting brings the loadout home; dying loses it.
 */

export function deploy(p: Profile, destination: string, seed: number, now = Date.now()): Profile {
  return {
    ...p,
    raid: { destination, seed, startedAt: now },
    stats: { ...p.stats, raids: p.stats.raids + 1 },
  };
}

/** Items carried out that the player didn't bring in. */
export function foundItems(loadout: Loadout, brought: readonly string[]): ItemInstance[] {
  const set = new Set(brought);
  return loadoutItems(loadout).filter((i) => !set.has(i.uid));
}

export function haulValue(loadout: Loadout, brought: readonly string[]): number {
  // Backpacks picked up in the raid count their contents; items inside them are skipped to avoid double counting.
  const found = foundItems(loadout, brought);
  const inFoundBag = new Set<string>();
  for (const it of found) it.contents?.items.forEach((p) => inFoundBag.add(p.item.uid));
  return found.filter((i) => !inFoundBag.has(i.uid)).reduce((n, i) => n + itemValueDeep(i), 0);
}

export function extract(p: Profile, loadout: Loadout, brought: readonly string[], kills: number): Profile {
  const haul = haulValue(loadout, brought);
  return {
    ...p,
    loadout,
    raid: null,
    day: p.day + 1,
    purchases: {},
    stats: {
      ...p.stats,
      extractions: p.stats.extractions + 1,
      kills: p.stats.kills + kills,
      bestHaul: Math.max(p.stats.bestHaul, haul),
    },
  };
}

export function die(p: Profile, kills: number): Profile {
  return {
    ...p,
    loadout: { ...emptyLoadout(), quick: p.loadout.quick },
    raid: null,
    day: p.day + 1,
    purchases: {},
    stats: { ...p.stats, deaths: p.stats.deaths + 1, kills: p.stats.kills + kills },
  };
}
