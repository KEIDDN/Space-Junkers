import type { Rng } from '../engine/rng';
import { ITEMS, type Rarity } from './items';

export type ContainerTier = 'scrap' | 'military' | 'valuable';

export interface ContainerDef {
  tier: ContainerTier;
  /** Atlas frame. */
  sprite: string;
  /** Seconds to search. */
  searchTime: number;
  /** Items rolled [min, max]. */
  rolls: [number, number];
}

export const CONTAINERS: Record<string, ContainerDef> = {
  box_dark: { tier: 'scrap', sprite: 'box_dark', searchTime: 1.2, rolls: [1, 2] },
  box_olive: { tier: 'scrap', sprite: 'box_olive', searchTime: 1.2, rolls: [1, 2] },
  box_red: { tier: 'military', sprite: 'box_red', searchTime: 1.6, rolls: [1, 3] },
  case_green: { tier: 'military', sprite: 'case_green', searchTime: 2.2, rolls: [2, 3] },
  case_red: { tier: 'valuable', sprite: 'case_red', searchTime: 2.8, rolls: [2, 3] },
};

/** Chance weights per rarity for each container tier. */
const TIER_RARITY: Record<ContainerTier, Record<Rarity, number>> = {
  scrap: { common: 70, uncommon: 26, rare: 4, epic: 0, legendary: 0 },
  military: { common: 38, uncommon: 42, rare: 17, epic: 3, legendary: 0 },
  valuable: { common: 8, uncommon: 34, rare: 42, epic: 14, legendary: 2 },
};

const BY_RARITY: Record<Rarity, string[]> = { common: [], uncommon: [], rare: [], epic: [], legendary: [] };
for (const it of Object.values(ITEMS)) if (it.kind === 'loot') BY_RARITY[it.rarity].push(it.id);

/**
 * Roll the contents of a container.
 * @param risk 0..1 extra danger of the room; nudges rolls toward rarer items.
 */
export function rollLoot(rng: Rng, def: ContainerDef, risk: number): string[] {
  const weights = { ...TIER_RARITY[def.tier] };
  weights.rare *= 1 + risk;
  weights.epic *= 1 + risk * 2;
  weights.legendary *= 1 + risk * 3;
  const n = rng.int(def.rolls[0], def.rolls[1]);
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const rarity = rng.weighted(weights);
    const pool = BY_RARITY[rarity];
    if (pool.length) out.push(rng.pick(pool));
  }
  return out;
}
