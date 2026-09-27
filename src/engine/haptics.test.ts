import { describe, expect, it } from 'vitest';
import { mixEnvelopes, type Envelope } from './haptics';

const env = (over: Partial<Envelope>): Envelope => ({ t: 0, dur: 0.2, strong: 0.5, weak: 0.5, decay: true, delay: 0, ...over });

describe('rumble mix', () => {
  it('decays over an envelope and ends', () => {
    expect(mixEnvelopes([env({ t: 0 })]).strong).toBeCloseTo(0.5);
    expect(mixEnvelopes([env({ t: 0.1 })]).strong).toBeCloseTo(0.125);
    expect(mixEnvelopes([env({ t: 0.2 })]).strong).toBe(0);
  });

  it('holds flat envelopes and waits out delays', () => {
    expect(mixEnvelopes([env({ t: 0.15, decay: false })]).strong).toBeCloseTo(0.5);
    expect(mixEnvelopes([env({ delay: 0.1 })]).strong).toBe(0);
  });

  it('a loud event masks a quiet one instead of doubling it', () => {
    const one = mixEnvelopes([env({ strong: 0.8 })]).strong;
    const both = mixEnvelopes([env({ strong: 0.8 }), env({ strong: 0.2 })]).strong;
    expect(both).toBeGreaterThan(one);
    expect(both).toBeLessThan(0.8 + 0.2);
    expect(mixEnvelopes([env({ strong: 1 }), env({ strong: 1 })]).strong).toBe(1);
  });
});
