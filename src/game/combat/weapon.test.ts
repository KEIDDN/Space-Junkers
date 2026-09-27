import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../../data/weapons';
import { CountedAmmo, WeaponState } from './weapon';

const pistol = WEAPONS.pm9;
const smg = WEAPONS.ppd41;

function ready(w: WeaponState) {
  w.update(10); // finish any draw time
  return w;
}

describe('WeaponState', () => {
  it('fires once per click for semi-auto and respects fire rate', () => {
    const w = ready(new WeaponState(pistol, 18));
    expect(w.tryFire(true, true)).toBe('fired');
    // Held without a new click: semi-auto does not fire again.
    w.update(1);
    expect(w.tryFire(true, false)).toBe('none');
    expect(w.ammo).toBe(pistol.magSize - 1);
  });

  it('buffers a click made during cooldown', () => {
    const w = ready(new WeaponState(pistol, 18));
    w.tryFire(true, true);
    w.update(0.05);
    expect(w.tryFire(true, true)).toBe('none'); // still cycling, click buffered
    w.update(1 / pistol.fireRate - 0.05 + 0.001);
    expect(w.tryFire(true, false)).toBe('fired');
  });

  it('automatic weapons keep firing while held', () => {
    const w = ready(new WeaponState(smg, 0));
    let shots = 0;
    for (let i = 0; i < 60; i++) {
      if (w.tryFire(true, i === 0) === 'fired') shots++;
      w.update(1 / 60);
    }
    expect(shots).toBeGreaterThanOrEqual(Math.floor(smg.fireRate) - 1);
    expect(shots).toBeLessThanOrEqual(Math.ceil(smg.fireRate) + 1);
  });

  it('reports empty and reloads from reserve', () => {
    const w = ready(new WeaponState(pistol, 5));
    w.ammo = 0;
    expect(w.tryFire(true, true)).toBe('empty');
    expect(w.startReload()).toBe(true);
    expect(w.tryFire(true, true)).toBe('none'); // can't shoot while reloading
    w.update(pistol.reloadTime + 0.01);
    expect(w.ammo).toBe(5);
    expect(w.reserve).toBe(0);
    expect(w.startReload()).toBe(false); // nothing left
  });

  it('switching weapons cancels a reload', () => {
    const w = ready(new WeaponState(pistol, 18));
    w.ammo = 2;
    w.startReload();
    w.draw();
    expect(w.reloading).toBe(false);
    expect(w.ammo).toBe(2);
  });

  it('bloom grows with sustained fire and recovers', () => {
    const w = ready(new WeaponState(smg, 100));
    const base = w.spread(0);
    for (let i = 0; i < 10; i++) {
      w.tryFire(true, true);
      w.update(1 / smg.fireRate);
    }
    expect(w.spread(0)).toBeGreaterThan(base);
    expect(w.spread(0)).toBeLessThanOrEqual(smg.spread + smg.bloomMax);
    w.update(5);
    expect(w.spread(0)).toBeCloseTo(base);
  });
});

describe('WeaponState ammo and handling', () => {
  it('takes reload rounds from the ammo source', () => {
    const src = new CountedAmmo(4);
    const w = ready(new WeaponState(pistol, src, 0));
    expect(w.startReload()).toBe(true);
    w.update(pistol.reloadTime + 0.01);
    expect(w.ammo).toBe(4);
    expect(src.n).toBe(0);
    expect(w.reloaded).toBe(true);
  });

  it('shotgun loads shell by shell and firing interrupts it', () => {
    const toz = WEAPONS.toz12;
    const src = new CountedAmmo(20);
    const w = ready(new WeaponState(toz, src, 0));
    w.startReload();
    let t = 0;
    while (w.ammo < 2) {
      w.update(0.05);
      t += 0.05;
    }
    expect(t).toBeGreaterThan(toz.reloadPerRound!);
    expect(w.reloading).toBe(true);
    // Trigger pulled with shells in the tube: reload stops, gun fires.
    expect(w.tryFire(true, true)).toBe('fired');
    expect(w.reloading).toBe(false);
    expect(src.n).toBe(18);
  });

  it('a worn pistol can jam and R clears it', () => {
    const sp5 = WEAPONS.sp5;
    const w = ready(new WeaponState(sp5, 10));
    expect(w.tryFire(true, true, 0)).toBe('fired'); // roll 0 < jamChance: jams after this shot
    expect(w.jammed).toBe(true);
    w.update(1);
    expect(w.tryFire(true, true)).toBe('jammed');
    expect(w.startReload()).toBe(true); // clears the jam instead of reloading
    w.update(1);
    expect(w.jammed).toBe(false);
    expect(w.tryFire(true, true, 1)).toBe('fired');
  });
});
