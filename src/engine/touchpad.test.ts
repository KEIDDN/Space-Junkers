import { afterEach, describe, expect, it, vi } from 'vitest';
import { BTN, readPad } from './pad';
import { glyphText } from '../ui/Glyph';

function fakePad(id: string, buttons: number, pressed: number[] = []): Gamepad {
  return {
    id, index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0],
    buttons: Array.from({ length: buttons }, (_, i) => ({ pressed: pressed.includes(i), touched: false, value: pressed.includes(i) ? 1 : 0 })),
  } as unknown as Gamepad;
}

afterEach(() => vi.unstubAllGlobals());

describe('PlayStation touchpad', () => {
  it('is read when the browser reports it', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad('DualSense Wireless Controller (Vendor: 054c Product: 0ce6)', 18, [BTN.TOUCHPAD])] });
    const f = readPad()!;
    expect(f.family).toBe('playstation');
    expect(f.touchpad).toBe(true);
    expect(f.buttons[BTN.TOUCHPAD]).toBe(1);
  });

  it('is not assumed on pads without one', () => {
    vi.stubGlobal('navigator', { getGamepads: () => [fakePad('Xbox Wireless Controller (Vendor: 045e)', 17)] });
    expect(readPad()!.touchpad).toBe(false);
  });
});

describe('map prompt', () => {
  it('is the touchpad on PlayStation, a held view button elsewhere, M on keys', () => {
    expect(glyphText('map', 'pad', 'playstation')).toBe('TOUCHPAD');
    expect(glyphText('map', 'pad', 'xbox')).toBe('HOLD VIEW');
    expect(glyphText('map', 'kbm', 'xbox')).toBe('M');
    expect(glyphText('pause', 'pad', 'playstation')).toBe('OPTIONS');
    expect(glyphText('inventory', 'pad', 'playstation')).toBe('CREATE');
  });
});
