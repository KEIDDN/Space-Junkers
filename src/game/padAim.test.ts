import { describe, expect, it } from 'vitest';
import { AIM_DIST, PadAim, type PadAimInput } from './padAim';

const base = (over: Partial<PadAimInput> = {}): PadAimInput => ({
  stick: { x: 0, y: 0, mag: 0 }, move: { x: 0, y: 0 }, steady: false, firing: false,
  sensitivity: 1, assist: true, targets: [], ox: 0, oy: 0, ...over,
});

function run(aim: PadAim, inp: PadAimInput, seconds: number) {
  let pt = { x: 0, y: 0 };
  for (let t = 0; t < seconds; t += 1 / 60) pt = aim.update(1 / 60, inp);
  return pt;
}

describe('stick aiming', () => {
  it('turns to the stick direction quickly but not instantly', () => {
    const aim = new PadAim();
    aim.reset(0);
    aim.update(1 / 60, base({ stick: { x: 0, y: 1, mag: 1 } }));
    expect(aim.angle).toBeGreaterThan(0);
    expect(aim.angle).toBeLessThan(Math.PI / 2);
    run(aim, base({ stick: { x: 0, y: 1, mag: 1 } }), 0.3);
    expect(aim.angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it('pushing further puts the reticle further out; steady goes furthest', () => {
    const aim = new PadAim();
    const near = run(aim, base({ stick: { x: 0.3, y: 0, mag: 0.3 } }), 1);
    const far = run(aim, base({ stick: { x: 1, y: 0, mag: 1 } }), 1);
    const steady = run(aim, base({ stick: { x: 1, y: 0, mag: 1 }, steady: true }), 1);
    expect(far.x).toBeGreaterThan(near.x);
    expect(steady.x).toBeGreaterThan(far.x);
    expect(steady.x).toBeCloseTo(AIM_DIST.steady, 0);
  });

  it('holds its direction when the stick is let go, and drifts to the walk after a moment', () => {
    const aim = new PadAim();
    run(aim, base({ stick: { x: 0, y: -1, mag: 1 } }), 0.4);
    const held = aim.angle;
    run(aim, base(), 0.3);
    expect(aim.angle).toBeCloseTo(held, 5);
    run(aim, base({ move: { x: 1, y: 0 } }), 2);
    expect(Math.abs(aim.angle)).toBeLessThan(0.1);
  });
});

describe('aim assist', () => {
  const target = { x: 200, y: 0, r: 10 };
  it('pulls toward a target just off the line', () => {
    const aim = new PadAim();
    const a = 0.08; // ~4.6 degrees off
    run(aim, base({ stick: { x: Math.cos(a), y: Math.sin(a), mag: 1 }, targets: [target] }), 1);
    // Ends up on the body (within its angular radius), which the raw stick was not.
    expect(Math.abs(aim.angle)).toBeLessThan(Math.atan(target.r / target.x));
    expect(aim.pull).toBeGreaterThan(0);
  });

  it('ignores targets well off the line, out of range, or when turned off', () => {
    const wide = new PadAim();
    run(wide, base({ stick: { x: Math.cos(0.5), y: Math.sin(0.5), mag: 1 }, targets: [target] }), 1);
    expect(wide.angle).toBeCloseTo(0.5, 2);
    const far = new PadAim();
    run(far, base({ stick: { x: Math.cos(0.05), y: Math.sin(0.05), mag: 1 }, targets: [{ x: 900, y: 0, r: 10 }] }), 1);
    expect(far.angle).toBeCloseTo(0.05, 2);
    const off = new PadAim();
    run(off, base({ stick: { x: Math.cos(0.08), y: Math.sin(0.08), mag: 1 }, targets: [target], assist: false }), 1);
    expect(off.angle).toBeCloseTo(0.08, 2);
  });

  it('never steers a stick at rest', () => {
    const aim = new PadAim();
    aim.reset(0.1);
    run(aim, base({ targets: [target] }), 1);
    expect(aim.angle).toBeCloseTo(0.1, 5);
  });
});
