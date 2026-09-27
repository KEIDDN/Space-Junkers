import { addToGrid, createItem, emptyGrid, type Grid, type ItemInstance } from '../core/inventory';
import type { Rng } from '../engine/rng';
import { ITEMS, RARITY_ORDER, type ItemCategory, type ItemDef, type Rarity } from './items';
import { WEAPONS } from './weapons';

/**
 * What's inside things. Containers roll a rarity, then a category that has items of that
 * rarity, then an item. Room danger ("risk") and facility themes skew the odds.
 */

export interface ContainerDef {
  id: string;
  label: string;
  /** Atlas frame. */
  sprite: string;
  /** Seconds of holding E to search the first time. */
  searchTime: number;
  /** Inventory grid of the opened container. */
  grid: [number, number];
  /** Items rolled [min, max]. */
  rolls: [number, number];
  rarity: Record<Rarity, number>;
  categories: Partial<Record<ItemCategory, number>>;
}

export const CONTAINERS: Record<string, ContainerDef> = {
  box_dark: {
    id: 'box_dark', label: 'SUPPLY BOX', sprite: 'box_dark', searchTime: 1.3, grid: [4, 3], rolls: [1, 3],
    rarity: { common: 70, uncommon: 26, rare: 4, epic: 0.3, legendary: 0 },
    categories: { scrap: 5, electronics: 4, tools: 3, food: 4, fuel: 2, medical: 2, ammo: 2 },
  },
  box_olive: {
    id: 'box_olive', label: 'SUPPLY CRATE', sprite: 'box_olive', searchTime: 1.3, grid: [4, 3], rolls: [1, 3],
    rarity: { common: 66, uncommon: 29, rare: 5, epic: 0.4, legendary: 0 },
    categories: { scrap: 3, electronics: 3, tools: 2, food: 3, medical: 3, ammo: 3, minerals: 2 },
  },
  box_red: {
    id: 'box_red', label: 'MILITARY CRATE', sprite: 'box_red', searchTime: 1.8, grid: [5, 4], rolls: [2, 3],
    rarity: { common: 40, uncommon: 42, rare: 16, epic: 2, legendary: 0 },
    categories: { ammo: 7, medical: 4, gear: 3, weapons: 1.2, documents: 1, technology: 1 },
  },
  case_green: {
    id: 'case_green', label: 'WEAPON CASE', sprite: 'case_green', searchTime: 2.2, grid: [5, 3], rolls: [1, 2],
    rarity: { common: 30, uncommon: 45, rare: 20, epic: 5, legendary: 0 },
    categories: { weapons: 6, ammo: 4, gear: 2 },
  },
  case_red: {
    id: 'case_red', label: 'SECURE CASE', sprite: 'case_red', searchTime: 2.8, grid: [4, 4], rolls: [2, 3],
    rarity: { common: 6, uncommon: 32, rare: 44, epic: 16, legendary: 2 },
    categories: { valuables: 5, technology: 4, documents: 3, minerals: 2, alien: 1 },
  },
  locker: {
    id: 'locker', label: 'LOCKER', sprite: 'ship_tall_locker', searchTime: 1.6, grid: [3, 4], rolls: [1, 3],
    rarity: { common: 52, uncommon: 36, rare: 10, epic: 1.5, legendary: 0.1 },
    categories: { valuables: 2, food: 2, documents: 1.5, medical: 1.2, ammo: 1.2, gear: 1, tools: 1 },
  },
  medcab: {
    id: 'medcab', label: 'MEDICAL CABINET', sprite: 'med_cabinet', searchTime: 1.5, grid: [3, 3], rolls: [1, 3],
    rarity: { common: 50, uncommon: 38, rare: 10, epic: 2, legendary: 0 },
    categories: { medical: 9, alien: 1 },
  },
  server: {
    id: 'server', label: 'SERVER RACK', sprite: 'hack_rack', searchTime: 2, grid: [3, 4], rolls: [1, 2],
    rarity: { common: 30, uncommon: 44, rare: 22, epic: 4, legendary: 0 },
    categories: { technology: 5, electronics: 4, documents: 3 },
  },
  filing: {
    id: 'filing', label: 'FILING CABINET', sprite: 'ship_cabinet_s', searchTime: 1.4, grid: [3, 3], rolls: [1, 2],
    rarity: { common: 45, uncommon: 40, rare: 13, epic: 2, legendary: 0.2 },
    categories: { documents: 5, valuables: 1.5, electronics: 2, food: 1 },
  },
  toolbox: {
    id: 'toolbox', label: 'TOOLBOX', sprite: 'ship_toolbox', searchTime: 1.1, grid: [4, 2], rolls: [1, 3],
    rarity: { common: 62, uncommon: 32, rare: 6, epic: 0.5, legendary: 0 },
    categories: { tools: 5, scrap: 4, electronics: 2 },
  },
  ammocase: {
    id: 'ammocase', label: 'AMMO CASE', sprite: 'merc_case', searchTime: 1.6, grid: [4, 3], rolls: [1, 3],
    rarity: { common: 45, uncommon: 38, rare: 15, epic: 2, legendary: 0 },
    categories: { ammo: 8, gear: 2, weapons: 0.5 },
  },
  remains: {
    id: 'remains', label: 'REMAINS', sprite: 'scav_dead_0', searchTime: 1.3, grid: [4, 3], rolls: [1, 3],
    rarity: { common: 50, uncommon: 38, rare: 10, epic: 2, legendary: 0.1 },
    categories: { food: 2, medical: 2, ammo: 2, valuables: 1.5, documents: 1.5, weapons: 0.6 },
  },
};

/** Grids for corpses and dropped piles. */
export const BODY_GRID: [number, number] = [5, 4];
export const GROUND_GRID: [number, number] = [6, 5];

// ---------------------------------------------------------------------------
// Pools: category -> rarity -> item ids

type Pools = Record<string, Record<Rarity, string[]>>;

function poolCategory(d: ItemDef): ItemCategory {
  if (d.kind === 'med') return 'medical';
  if (d.kind === 'armor' || d.kind === 'helmet' || d.kind === 'backpack' || d.kind === 'grenade') return 'gear';
  return d.category;
}

const POOLS: Pools = (() => {
  const out: Pools = {};
  for (const d of Object.values(ITEMS)) {
    // Keycards are placed deliberately, never rolled.
    if (d.kind === 'key') continue;
    const cat = poolCategory(d);
    out[cat] ??= { common: [], uncommon: [], rare: [], epic: [], legendary: [] };
    out[cat][d.rarity].push(d.id);
  }
  return out;
})();

const RARITIES: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

/**
 * Pick one item id.
 * @param risk danger of the room (0..1) plus the world's loot bonus; pushes the roll toward rarer items.
 * @param themeMul optional category multipliers from the facility theme.
 */
export function rollItemId(
  rng: Rng, def: Pick<ContainerDef, 'rarity' | 'categories'>, risk: number,
  themeMul: Partial<Record<ItemCategory, number>> = {},
): string | null {
  // Deep rooms and rich worlds thin out the junk and bring up the good stuff.
  const rw = { ...def.rarity };
  rw.common /= 1 + Math.max(0, risk - 0.4) * 1.5;
  rw.uncommon *= 1 + risk * 0.4;
  rw.rare *= 1 + risk * 1.5;
  rw.epic *= 1 + risk * 3;
  rw.legendary *= 1 + risk * 4;
  let rarity = rng.weighted(rw);
  // Fall back to more common rarities if nothing in the container's categories has this one.
  for (let r = RARITY_ORDER[rarity]; r >= 0; r--) {
    const rar = RARITIES[r];
    const cats: Partial<Record<string, number>> = {};
    let any = false;
    for (const [cat, w] of Object.entries(def.categories)) {
      if (!w || !POOLS[cat]?.[rar].length) continue;
      cats[cat] = w * (themeMul[cat as ItemCategory] ?? 1);
      any = true;
    }
    if (!any) continue;
    rarity = rar;
    const cat = rng.weighted(cats as Record<string, number>);
    return rng.pick(POOLS[cat][rarity]);
  }
  return null;
}

/** An instance as it would be found lying around: partly used, partly loaded. */
export function foundInstance(rng: Rng, id: string): ItemInstance {
  const d = ITEMS[id];
  switch (d.kind) {
    case 'ammo':
      return createItem(id, { qty: rng.int(Math.max(4, Math.floor(d.stack * 0.15)), Math.floor(d.stack * 0.6)) });
    case 'weapon': {
      const mag = WEAPONS[d.weapon].magSize;
      return createItem(id, { loaded: rng.chance(0.6) ? rng.int(0, mag) : 0 });
    }
    case 'armor':
    case 'helmet':
      return createItem(id, { dur: Math.round(d.durability * (0.35 + rng.next() * 0.65)) });
    case 'med':
      return createItem(id, d.pooled ? { dur: Math.round(d.heal * (0.4 + rng.next() * 0.6)) } : {});
    default:
      return createItem(id);
  }
}

/**
 * Fill a container's grid. Items that don't fit are simply not there.
 * @param rich the world's loot bonus: richer worlds pack more into every container.
 */
export function rollContainer(
  rng: Rng, def: ContainerDef, risk: number, themeMul: Partial<Record<ItemCategory, number>> = {}, rich = 0,
): Grid {
  let grid = emptyGrid(def.grid[0], def.grid[1]);
  const n = rng.int(def.rolls[0], def.rolls[1]) + Math.floor(rich * 2 + rng.next());
  for (let i = 0; i < n; i++) {
    const id = rollItemId(rng, def, risk, themeMul);
    if (!id) continue;
    grid = addToGrid(grid, foundInstance(rng, id)).grid;
  }
  return grid;
}

/** Pocket contents of a dead enemy (besides its gun and armor). */
export const BODY_POCKETS: Pick<ContainerDef, 'rarity' | 'categories'> = {
  rarity: { common: 60, uncommon: 32, rare: 7, epic: 1, legendary: 0.05 },
  categories: { food: 4, medical: 4, valuables: 2, electronics: 2, scrap: 2, documents: 1, tools: 1 },
};
