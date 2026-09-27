import { describe, expect, it } from 'vitest';
import { ITEMS } from '../data/items';
import { VENDORS } from '../data/vendors';
import { addToGrid, countInGrid, createItem, findInGrid, itemValueDeep } from './inventory';
import { buy, buyPrice, marketFor, sell, sellOffer } from './economy';
import { newProfile } from './profile';

describe('economy', () => {
  it('every stock entry is a real item', () => {
    for (const v of Object.values(VENDORS)) for (const e of v.stock) expect(ITEMS[e.item], e.item).toBeDefined();
  });

  it('no item can be bought and sold back for a profit (no arbitrage)', () => {
    for (const v of Object.values(VENDORS)) {
      v.stock.forEach((e) => {
        const cost = buyPrice(v.crew, e, 4);
        const it = createItem(e.item, { qty: e.qty ?? 1, loaded: 999 });
        for (const seller of Object.keys(VENDORS) as (keyof typeof VENDORS)[]) {
          for (let day = 1; day < 40; day++) {
            const offer = sellOffer(seller, it, day) ?? 0;
            expect(offer, `${e.item} bought from ${v.crew}, sold to ${seller} on day ${day}`).toBeLessThan(cost);
          }
        }
      });
    }
  });

  it('buying takes credits, adds to the stash, builds trust, and respects limits', () => {
    let p = newProfile();
    p = { ...p, credits: 100000, crew: { merc: { trust: 999, met: true } } };
    const i = VENDORS.merc.stock.findIndex((e) => e.item === 'svk');
    const before = p.credits;
    const r = buy(p, 'merc', i);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.credits).toBeLessThan(before);
    expect(countInGrid(r.profile.stash, 'svk')).toBe(1);
    const second = buy(r.profile, 'merc', i);
    expect(second.ok).toBe(false); // limit 1 per day
  });

  it('trust gates stock', () => {
    const p = { ...newProfile(), credits: 100000 };
    const i = VENDORS.merc.stock.findIndex((e) => e.item === 'akr74');
    expect(buy(p, 'merc', i).ok).toBe(false);
  });

  it('selling removes the item and pays the offer', () => {
    let p = newProfile();
    const ring = createItem('ring');
    p = { ...p, stash: addToGrid(p.stash, ring).grid };
    const offer = sellOffer('smuggler', ring, p.day)!;
    const r = sell(p, 'smuggler', ring.uid);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.profile.credits).toBe(p.credits + offer);
    expect(findInGrid(r.profile.stash, ring.uid)).toBeUndefined();
    expect(r.profile.crew.smuggler!.trust).toBeGreaterThan(0);
  });

  it('specialists pay better for their specialty, and crew issue sells for nothing', () => {
    const it = createItem('ai_core');
    expect(sellOffer('hacker', it, 1)!).toBeGreaterThan(itemValueDeep(it) * 0.7);
    expect(sellOffer('merc', it, 1)).toBeNull();
    expect(sellOffer('trader', createItem('pm9', { crew: true }), 1)).toBeNull();
  });

  it('the market rotates but is deterministic', () => {
    expect(marketFor(5)).toEqual(marketFor(5));
    const days = new Set(Array.from({ length: 20 }, (_, d) => marketFor(d).hot));
    expect(days.size).toBeGreaterThan(3);
  });
});
