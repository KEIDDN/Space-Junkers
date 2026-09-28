import { describe, expect, it } from 'vitest';
import { WEAPONS } from '../data/weapons';
import { attentionLevel, freshAttention, landingAt, noted } from './attention';

describe('attention: noise has consequences later', () => {
  it('footsteps and rummaging are local; gunfire is noticed', () => {
    let a = freshAttention();
    a = noted(a, 10, 10, 70);
    a = noted(a, 10, 10, 150);
    expect(a.total).toBe(0);
    a = noted(a, 100, 200, WEAPONS.akr74.noiseRadius);
    expect(a.total).toBeGreaterThan(5);
    expect([a.lastX, a.lastY]).toEqual([100, 200]);
  });

  it('a quiet run gets the landings on schedule; a loud one brings them forward, within reason', () => {
    const quiet = freshAttention();
    expect(landingAt(330, 0, quiet)).toBe(330);
    let loud = freshAttention();
    for (let i = 0; i < 30; i++) loud = noted(loud, 0, 0, WEAPONS.akr74.noiseRadius);
    const t = landingAt(330, 0, loud);
    expect(t).toBeLessThan(330 - 120);
    expect(t).toBeGreaterThanOrEqual(165);
    let deafening = loud;
    for (let i = 0; i < 300; i++) deafening = noted(deafening, 0, 0, 900);
    expect(landingAt(640, 330, deafening)).toBe(640 - 155);
  });

  it('a pistol is quieter news than a shotgun', () => {
    const pistol = noted(freshAttention(), 0, 0, WEAPONS.pm9.noiseRadius).total;
    const shotgun = noted(freshAttention(), 0, 0, WEAPONS.toz12.noiseRadius).total;
    expect(pistol).toBeLessThan(shotgun);
  });

  it('reads as quiet, heard, then known', () => {
    let a = freshAttention();
    expect(attentionLevel(a)).toBe(0);
    for (let i = 0; i < 12; i++) a = noted(a, 0, 0, 560);
    expect(attentionLevel(a)).toBe(1);
    for (let i = 0; i < 20; i++) a = noted(a, 0, 0, 560);
    expect(attentionLevel(a)).toBe(2);
  });
});
