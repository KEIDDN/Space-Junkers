import type { CrewId } from './crew';
import type { ItemCategory } from './items';

/**
 * What each crew member sells and buys. Stock unlocks with trust; rare stock is limited
 * per day (a day passes with every raid). Specialists pay better for their specialty.
 */

export interface StockEntry {
  item: string;
  /** Trust level needed (0..4). */
  trust: number;
  /** Units per purchase (ammo comes in boxes). */
  qty?: number;
  /** Purchases allowed per day. */
  limit?: number;
}

export interface VendorDef {
  crew: CrewId;
  /** Multiplier on base value when selling to the player. */
  markup: number;
  /** What fraction of base value they pay, by category. `any` = everything else. */
  buys: Partial<Record<ItemCategory | 'any', number>>;
  stock: StockEntry[];
}

export const VENDORS: Record<CrewId, VendorDef> = {
  trader: {
    crew: 'trader', markup: 1.3,
    buys: { any: 0.55 },
    stock: [
      { item: 'ammo_9x18', trust: 0, qty: 30 },
      { item: 'ammo_12buck', trust: 0, qty: 10 },
      { item: 'bandage', trust: 0 },
      { item: 'pills', trust: 0 },
      { item: 'sack', trust: 0 },
      { item: 'respcap', trust: 0 },
      { item: 'smoke', trust: 0 },
      { item: 'daypack', trust: 1 },
      { item: 'carkit', trust: 1 },
      { item: 'vest_ps2', trust: 1 },
      { item: 'scrap', trust: 0 },
      { item: 'pipe', trust: 0 },
      { item: 'tape', trust: 0 },
      { item: 'wires', trust: 0 },
      { item: 'gear', trust: 1 },
      { item: 'circuit', trust: 2, limit: 3 },
      { item: 'turist', trust: 2, limit: 1 },
    ],
  },
  merc: {
    crew: 'merc', markup: 1.35,
    buys: { weapons: 0.7, ammo: 0.7, gear: 0.65 },
    stock: [
      { item: 'pm9', trust: 0 },
      { item: 'obrez', trust: 0 },
      { item: 'ammo_9x18', trust: 0, qty: 30 },
      { item: 'ammo_12buck', trust: 0, qty: 10 },
      { item: 'vest_ps2', trust: 0 },
      { item: 'toz12', trust: 1 },
      { item: 'kedr', trust: 1 },
      { item: 'skv', trust: 1 },
      { item: 'ammo_12slug', trust: 1, qty: 10 },
      { item: 'ammo_545', trust: 1, qty: 30 },
      { item: 'k6helmet', trust: 1 },
      { item: 'frag', trust: 1, limit: 3 },
      { item: 'ppd41', trust: 2 },
      { item: 'akr74', trust: 2, limit: 2 },
      { item: 'mosin', trust: 2 },
      { item: 'ammo_762', trust: 2, qty: 20 },
      { item: 'ammo_9x18_ap', trust: 2, qty: 30 },
      { item: 'vest_zhuk', trust: 2, limit: 2 },
      { item: 'ammo_545_ap', trust: 3, qty: 30, limit: 4 },
      { item: 'ammo_762_ap', trust: 3, qty: 20, limit: 3 },
      { item: 'zaslon', trust: 3, limit: 1 },
      { item: 'svk', trust: 4, limit: 1 },
      { item: 'vest_granit', trust: 4, limit: 1 },
    ],
  },
  medic: {
    crew: 'medic', markup: 1.25,
    buys: { medical: 0.78, alien: 0.75, food: 0.5 },
    stock: [
      { item: 'bandage', trust: 0 },
      { item: 'pills', trust: 0 },
      { item: 'carkit', trust: 0 },
      { item: 'medkit', trust: 1 },
      { item: 'stim', trust: 2, limit: 3 },
      { item: 'surgkit', trust: 3, limit: 2 },
    ],
  },
  hacker: {
    crew: 'hacker', markup: 1.35,
    buys: { technology: 0.72, electronics: 0.72, documents: 0.82 },
    stock: [
      { item: 'battery', trust: 0 },
      { item: 'wires', trust: 0 },
      { item: 'keycard', trust: 1, limit: 1 },
      { item: 'circuit', trust: 1, limit: 4 },
      { item: 'capacitor', trust: 2, limit: 2 },
      { item: 'cell', trust: 2, limit: 2 },
      { item: 'radio', trust: 3, limit: 1 },
    ],
  },
  smuggler: {
    crew: 'smuggler', markup: 1.6,
    buys: { valuables: 0.74, minerals: 0.7, alien: 0.6, any: 0.45 },
    stock: [
      { item: 'frag', trust: 0, limit: 2 },
      { item: 'ammo_545_ap', trust: 1, qty: 30, limit: 2 },
      { item: 'stim', trust: 1, limit: 2 },
      { item: 'keycard', trust: 1, limit: 1 },
      { item: 'vektor', trust: 2, limit: 1 },
      { item: 'zaslon', trust: 2, limit: 1 },
      { item: 'raidpack', trust: 2, limit: 1 },
      { item: 'ammo_762_ap', trust: 2, qty: 20, limit: 2 },
      { item: 'surgkit', trust: 2, limit: 1 },
      { item: 'vest_granit', trust: 3, limit: 1 },
    ],
  },
};
