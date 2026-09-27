import { describe, expect, it } from 'vitest';
import { padFamily, shapeStick } from './pad';

describe('stick shaping', () => {
  it('ignores drift inside the deadzone', () => {
    expect(shapeStick(0.1, -0.12, 0.2).mag).toBe(0);
    expect(shapeStick(0.19, 0, 0.2)).toEqual({ x: 0, y: 0, mag: 0 });
  });

  it('starts from zero at the edge of the deadzone and saturates before the rim', () => {
    const just = shapeStick(0.21, 0, 0.2);
    expect(just.mag).toBeGreaterThan(0);
    expect(just.mag).toBeLessThan(0.05);
    expect(shapeStick(0.95, 0, 0.2).mag).toBe(1);
    expect(shapeStick(0.7, 0.7, 0.2).mag).toBe(1);
  });

  it('keeps direction', () => {
    const s = shapeStick(0, -0.6, 0.2);
    expect(s.x).toBeCloseTo(0);
    expect(s.y).toBeLessThan(0);
    const d = shapeStick(0.5, 0.5, 0.2);
    expect(d.x).toBeCloseTo(d.y);
  });

  it('is safe on garbage input', () => {
    expect(shapeStick(Number.NaN, 0, 0.2).mag).toBe(0);
  });
});

describe('controller family', () => {
  it('reads common pads', () => {
    expect(padFamily('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('xbox');
    expect(padFamily('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)')).toBe('playstation');
    expect(padFamily('Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)')).toBe('playstation');
    expect(padFamily('Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)')).toBe('nintendo');
    expect(padFamily('Generic USB Joystick')).toBe('xbox');
  });
});
