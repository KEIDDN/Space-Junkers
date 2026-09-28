import type { Zone } from '../data/objectives';

/**
 * What a raid meant, in a sentence or two, for the after-action report. Getting out should
 * read as something that changed the operator's situation; dying should read as something
 * that can be learned from ("I pushed too deep", "I fired too much", "I ignored the
 * bleeding"), not as a bigger number on the other side. Pure.
 */

export interface DeathFacts {
  /** Who fired the round that did it ("a raider's TOZ-12"), if anyone. */
  by: string | null;
  /** Bled out rather than dropped outright. */
  bled: boolean;
  /** Left behind when the orbit window closed. */
  mia: boolean;
  /** Where it happened. */
  room: string | null;
  zone: Zone | null;
  /** Seconds into the raid. */
  elapsed: number;
  /** Rounds the operator fired. */
  shots: number;
  /** Value found and on the body (KR). */
  carried: number;
}

export function deathCause(f: DeathFacts): string {
  if (f.mia) return 'LEFT BEHIND WHEN THE ORBIT WINDOW CLOSED';
  const where = f.room ? ` · ${f.room}${f.zone === 'restricted' || f.zone === 'deep' ? ` (${f.zone.toUpperCase()} SECTOR)` : ''}` : '';
  const who = f.by ? f.by.toUpperCase() : null;
  if (f.bled) return `BLED OUT${who ? ` AFTER ${who} FOUND YOU` : ''}${where}`;
  return `${who ? `KILLED BY ${who}` : 'KILLED'}${where}`;
}

/** The one thing to do differently, in Molot's plain terms. */
export function deathLesson(f: DeathFacts): string {
  if (f.mia) return 'You were still inside when the window closed. Start for the pad with five minutes left, not one.';
  if (f.bled) return 'You were bleeding. A bandage first, every time. Bleeding kills slower than bullets, but it kills.';
  if ((f.zone === 'deep' || f.zone === 'restricted') && f.carried >= 1500) {
    return `You had ${f.carried.toLocaleString()} KR on you and kept going deeper. That was the moment to turn round.`;
  }
  if (f.shots >= 60) return `You fired ${f.shots} rounds. Every one of them told the whole level where you were.`;
  if (f.zone === 'deep') return 'Deep rooms pay better because fewer people come back from them. That isn\'t a coincidence. That\'s the price.';
  if (f.elapsed < 90) return 'Ninety seconds in. Slow down at the doors. Listen first, then look.';
  return 'Where did the shot come from? Next time, check that corner before you stand in it.';
}

/**
 * What a haul is worth in the ship's terms: fuel, at what a trader actually pays (about
 * half of what things are worth). A jump to the home moon is the unit everyone aboard
 * thinks in.
 */
export const SELL_RATE = 0.55;

export function haulMeaning(haul: number, jumpCost: number, rate = SELL_RATE): string {
  if (haul <= 0) return 'Nothing found. You came back, which the last three didn\'t.';
  const jumps = Math.floor((haul * rate) / Math.max(1, jumpCost));
  if (jumps < 1) return 'Not a jump\'s worth of fuel. But you\'re alive, and that\'s the expensive part.';
  if (jumps === 1) return 'That\'s a jump of fuel. The Lastochka flies another day.';
  if (jumps < 8) return `That's ${jumps} jumps of fuel. Fedya will pretend not to smile.`;
  return `That's ${jumps} jumps of fuel. Fedya is going to call his creditor just to be rude to him.`;
}
