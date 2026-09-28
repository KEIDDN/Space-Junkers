import { describe, expect, it } from 'vitest';
import { CARRIES, WEAPONS, loudness, type WeaponArchetype } from './weapons';
import { LOUD } from '../game/attention';

const by = (a: WeaponArchetype) => Object.values(WEAPONS).filter((w) => w.archetype === a);

describe('weapons are tools, not bigger numbers', () => {
  it('loudness is part of what a gun is: pistols stay local, shotguns and marksman rifles announce you', () => {
    for (const w of by('pistol')) expect(w.noiseRadius, w.id).toBeLessThan(CARRIES);
    for (const w of by('shotgun')) expect(w.noiseRadius, w.id).toBeGreaterThanOrEqual(650);
    for (const w of by('marksman')) expect(w.noiseRadius, w.id).toBeGreaterThanOrEqual(650);
    const loudest = (a: WeaponArchetype) => Math.max(...by(a).map((w) => w.noiseRadius));
    const quietest = (a: WeaponArchetype) => Math.min(...by(a).map((w) => w.noiseRadius));
    expect(loudest('pistol')).toBeLessThan(quietest('smg'));
    expect(loudest('smg')).toBeLessThan(quietest('rifle'));
    expect(loudest('rifle')).toBeLessThan(quietest('shotgun'));
  });

  it('a pistol shot is below the channel\'s notice; anything louder is remembered', () => {
    expect(LOUD).toBe(CARRIES);
  });

  it('every gun says what it is for, and how far it is heard, in words', () => {
    for (const w of Object.values(WEAPONS)) {
      expect(w.role.length, w.id).toBeGreaterThan(10);
      expect(w.role, w.id).toBe(w.role.toUpperCase());
    }
    expect(loudness(WEAPONS.pm9.noiseRadius)).toMatch(/^QUIET/);
    expect(loudness(WEAPONS.ppd41.noiseRadius)).toMatch(/^MODERATE/);
    expect(loudness(WEAPONS.akr74.noiseRadius)).toMatch(/^LOUD/);
    expect(loudness(WEAPONS.toz12.noiseRadius)).toMatch(/^DEAFENING/);
  });

  it('each archetype trades something: SMGs shoot on the move, marksman rifles don\'t, shotguns don\'t reach', () => {
    const avg = (a: WeaponArchetype, f: (w: (typeof WEAPONS)[string]) => number) => by(a).reduce((n, w) => n + f(w), 0) / by(a).length;
    expect(avg('smg', (w) => w.moveSpread)).toBeLessThan(avg('rifle', (w) => w.moveSpread));
    expect(avg('marksman', (w) => w.moveSpread)).toBeGreaterThan(avg('rifle', (w) => w.moveSpread));
    expect(avg('shotgun', (w) => w.range)).toBeLessThan(avg('pistol', (w) => w.range));
    expect(avg('pistol', (w) => w.drawTime)).toBeLessThan(avg('rifle', (w) => w.drawTime));
    expect(avg('marksman', (w) => w.damage)).toBeGreaterThan(avg('rifle', (w) => w.damage) * 2.5);
  });
});
