import { describe, expect, it } from 'vitest';
import { ITEMS, type AmmoDef } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { effectiveClass, resolveHit } from './damage';

const ammo = (id: string) => ITEMS[id] as AmmoDef;

describe('resolveHit', () => {
  it('no armor: full damage', () => {
    expect(resolveHit(30, 3, null)).toEqual({ damage: 30, armorDamage: 0, blocked: false });
  });

  it('armor stops weak rounds and lets strong ones through', () => {
    const vest = { cls: 3, dur: 70, maxDur: 70 };
    const pistol = resolveHit(24, ammo('ammo_9x18').pen, vest);
    const ap = resolveHit(31, ammo('ammo_545_ap').pen, vest);
    expect(pistol.damage).toBeLessThan(24 * 0.3);
    expect(pistol.blocked).toBe(true);
    expect(ap.damage).toBeGreaterThan(31 * 0.8);
  });

  it('worn armor protects less and broken armor not at all', () => {
    const fresh = { cls: 4, dur: 95, maxDur: 95 };
    const worn = { ...fresh, dur: 20 };
    expect(effectiveClass(worn)).toBeLessThan(effectiveClass(fresh));
    expect(resolveHit(30, 3, worn).damage).toBeGreaterThan(resolveHit(30, 3, fresh).damage);
    expect(resolveHit(30, 3, { ...fresh, dur: 0 }).damage).toBe(30);
  });

  it('armor wears down and never below zero', () => {
    const a = { cls: 2, dur: 3, maxDur: 50 };
    const r = resolveHit(100, 6, a);
    expect(r.armorDamage).toBe(3);
  });

  it('time to kill stays lethal: an unarmored player dies to a rifle burst', () => {
    const shots = Math.ceil(100 / WEAPONS.akr74.damage);
    expect(shots).toBeLessThanOrEqual(4);
  });
});
