import { trustLevel, type CrewId } from '../data/crew';
import { CATEGORY_NAME, itemDef, type ItemCategory } from '../data/items';
import { VENDORS, type StockEntry } from '../data/vendors';
import { Rng } from '../engine/rng';
import { addToGrid, createItem, itemValueDeep, type ItemInstance } from './inventory';
import type { Profile } from './profile';
import { removeItem, type Workspace } from './transfer';

/**
 * Buying and selling. Pure: every function takes a profile and returns a new one (or an
 * error the UI can show). Trading builds trust with the crew member you trade with.
 */

/** Credits of trade per trust point. */
const TRADE_PER_TRUST = 450;

const MARKET_CATEGORIES: ItemCategory[] = [
  'scrap', 'electronics', 'fuel', 'minerals', 'alien', 'food', 'medical', 'valuables', 'technology', 'documents', 'tools',
];

export interface Market {
  /** Fedya pays 35% more for this today. */
  hot: ItemCategory;
  /** ...and 25% less for this. */
  cold: ItemCategory;
}

/** Deterministic daily market swing. */
export function marketFor(day: number): Market {
  const rng = new Rng((day * 2654435761) >>> 0);
  const hot = rng.pick(MARKET_CATEGORIES);
  let cold = rng.pick(MARKET_CATEGORIES);
  if (cold === hot) cold = MARKET_CATEGORIES[(MARKET_CATEGORIES.indexOf(hot) + 3) % MARKET_CATEGORIES.length];
  return { hot, cold };
}

export function marketLine(day: number): string {
  const m = marketFor(day);
  return `${CATEGORY_NAME[m.hot]} is fetching a good price today. Nobody wants ${CATEGORY_NAME[m.cold].toLowerCase()}.`;
}

export function crewTrust(p: Profile, crew: CrewId): number {
  return p.crew[crew]?.trust ?? 0;
}

export function crewLevel(p: Profile, crew: CrewId): number {
  return trustLevel(crewTrust(p, crew));
}

function discount(level: number): number {
  return 1 - 0.03 * level;
}

export function stockKey(crew: CrewId, i: number): string {
  return `${crew}:${i}`;
}

export function buyPrice(crew: CrewId, entry: StockEntry, level: number): number {
  const d = itemDef(entry.item);
  return Math.max(1, Math.round(d.value * (entry.qty ?? 1) * VENDORS[crew].markup * discount(level)));
}

/** What a vendor pays for an item, or null if they won't take it. */
export function sellOffer(crew: CrewId, item: ItemInstance, day: number): number | null {
  if (item.crew) return null;
  const v = VENDORS[crew];
  const d = itemDef(item.id);
  // Contract goods are owed to someone aboard; nobody will take them off you for cash.
  if (d.quest) return null;
  const rate = v.buys[d.category] ?? v.buys.any;
  if (!rate) return null;
  let mul = rate;
  if (crew === 'trader') {
    const m = marketFor(day);
    if (d.category === m.hot) mul *= 1.35;
    if (d.category === m.cold) mul *= 0.75;
  }
  // Contents of a bag and rounds in a gun are priced at the same rate.
  const value = itemValueDeep(item);
  const price = Math.floor(value * mul);
  return price > 0 ? price : null;
}

function addTrust(p: Profile, crew: CrewId, points: number): Profile['crew'] {
  const cur = p.crew[crew] ?? { trust: 0, met: true };
  return { ...p.crew, [crew]: { ...cur, trust: cur.trust + points } };
}

export type TradeResult = { ok: true; profile: Profile } | { ok: false; error: string };

export function buy(p: Profile, crew: CrewId, index: number): TradeResult {
  const entry = VENDORS[crew].stock[index];
  if (!entry) return { ok: false, error: 'Not for sale.' };
  const level = crewLevel(p, crew);
  if (level < entry.trust) return { ok: false, error: 'They don\'t trust you with that yet.' };
  const key = stockKey(crew, index);
  const bought = p.purchases[key] ?? 0;
  if (entry.limit !== undefined && bought >= entry.limit) return { ok: false, error: 'Sold out until the next run.' };
  const price = buyPrice(crew, entry, level);
  if (p.credits < price) return { ok: false, error: 'Not enough kosmorubli.' };
  const d = itemDef(entry.item);
  const item = createItem(entry.item, {
    qty: entry.qty ?? 1,
    // Guns come with a full magazine of the cheapest rounds, as a courtesy.
    loaded: d.kind === 'weapon' ? 999 : undefined,
  });
  const r = addToGrid(p.stash, item);
  if (r.rest) return { ok: false, error: 'No room in the stash.' };
  return {
    ok: true,
    profile: {
      ...p,
      credits: p.credits - price,
      stash: r.grid,
      purchases: { ...p.purchases, [key]: bought + 1 },
      crew: addTrust(p, crew, price / TRADE_PER_TRUST),
    },
  };
}

/** Sell an item from anywhere aboard (stash or loadout). */
export function sell(p: Profile, crew: CrewId, uid: string): TradeResult {
  const ws: Workspace = { loadout: p.loadout, stash: p.stash, external: null };
  const r = removeItem(ws, uid);
  if (!r) return { ok: false, error: 'Item not found.' };
  const price = sellOffer(crew, r.item, p.day);
  if (price === null) return { ok: false, error: 'They won\'t buy that.' };
  return {
    ok: true,
    profile: {
      ...p,
      credits: p.credits + price,
      stash: r.ws.stash!,
      loadout: r.ws.loadout,
      crew: addTrust(p, crew, price / TRADE_PER_TRUST),
      stats: { ...p.stats, creditsEarned: p.stats.creditsEarned + price },
    },
  };
}
