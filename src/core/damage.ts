/**
 * Ballistics vs armor. Pure, so balance can be tested.
 *
 * Armor has a class (1..5) and durability. A round has penetration. The better the armor
 * is relative to the round, the more it stops, and worn armor behaves like a lower class.
 * Broken armor stops nothing. Every hit that lands on armor wears it down.
 */

export interface ArmorState {
  cls: number;
  dur: number;
  maxDur: number;
}

export interface HitOutcome {
  /** Damage that reaches the body. */
  damage: number;
  /** Durability the armor loses. */
  armorDamage: number;
  /** The armor stopped most of it (a "blocked" feedback cue). */
  blocked: boolean;
}

/** Damage multiplier for headshots before helmet protection. */
export const HEADSHOT_MUL = 2.1;

export function effectiveClass(a: ArmorState): number {
  if (a.dur <= 0) return 0;
  return a.cls * (0.5 + 0.5 * Math.min(1, a.dur / a.maxDur));
}

export function resolveHit(raw: number, pen: number, armor: ArmorState | null): HitOutcome {
  if (!armor || armor.dur <= 0) return { damage: raw, armorDamage: 0, blocked: false };
  const delta = effectiveClass(armor) - pen;
  const mul = Math.max(0.12, Math.min(0.95, 0.62 - 0.22 * delta));
  const armorDamage = raw * (0.3 + 0.08 * pen);
  return { damage: raw * mul, armorDamage: Math.min(armor.dur, armorDamage), blocked: mul < 0.45 };
}

/** Chance that a hit starts bleeding (player only). */
export function bleedChance(damage: number): number {
  if (damage < 7) return 0;
  return Math.min(0.55, damage / 70);
}
