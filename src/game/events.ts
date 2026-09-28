import { Rng } from '../engine/rng';

/**
 * Now and then something happens that the operator didn't cause: somebody else's fight on
 * another level, the reserve dipping, an alarm tripping somewhere deep, channel nine coming
 * through a speaker, a crew walking back through rooms already cleared, a sealed door whose
 * reserve cell finally dies (the vault, open, and everyone nearby heard it). Each world has
 * its own mix: Krasnaya's garrison walks its rounds, Kombinat's alarms are live, Merzlota's
 * power is failing, Sirin talks. Sparse on purpose (most raids get one, some none, a few two), never in
 * the first minute and a half, never in the last four: they make a raid less predictable,
 * they don't run it.
 *
 * Pure: a seed and a window in, a schedule out.
 */

export type RaidEventKind = 'gunfire' | 'blackout' | 'alarm' | 'nine' | 'patrol' | 'seal';

export interface RaidEvent {
  kind: RaidEventKind;
  /** Seconds into the raid. */
  at: number;
}

export const EVENT_WEIGHTS: Record<RaidEventKind, number> = { gunfire: 3, alarm: 1, blackout: 2, nine: 1, patrol: 2, seal: 2 };
/** Quiet at the start, room to leave at the end, and space between. */
const EARLIEST = 90;
const LATEST_BEFORE_END = 240;
const MIN_GAP = 150;

/**
 * @param window seconds the Lastochka holds orbit
 * @param learning an operator's first raids: nothing extra happens to them
 * @param world this destination's mix (missing kinds: the default weight)
 * @param sealed whether the facility has a sealed vault that could fail
 */
export function planEvents(
  seed: number, window: number, learning = false, world: Partial<Record<RaidEventKind, number>> = {}, sealed = true,
): RaidEvent[] {
  if (learning || !Number.isFinite(window)) return [];
  const rng = new Rng((seed * 48271 + 0x3e7e) >>> 0);
  const roll = rng.next();
  const count = roll < 0.3 ? 0 : roll < 0.8 ? 1 : 2;
  const latest = window - LATEST_BEFORE_END;
  const out: RaidEvent[] = [];
  for (let i = 0; i < count && latest > EARLIEST; i++) {
    const weights = { ...EVENT_WEIGHTS, ...world };
    if (!sealed) weights.seal = 0;
    // Never the same thing twice in a raid.
    for (const e of out) weights[e.kind] = 0;
    if (Object.values(weights).every((w) => w <= 0)) break;
    const kind = rng.weighted(weights);
    let at = EARLIEST + rng.next() * (latest - EARLIEST);
    if (out.some((e) => Math.abs(e.at - at) < MIN_GAP)) at = Math.min(latest, Math.max(...out.map((e) => e.at)) + MIN_GAP);
    if (out.some((e) => Math.abs(e.at - at) < MIN_GAP)) continue;
    out.push({ kind, at: Math.round(at) });
  }
  return out.sort((a, b) => a.at - b.at);
}
