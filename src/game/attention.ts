import { CARRIES } from '../data/weapons';

/**
 * Shooting solves the problem in front of you and makes the next one. Every loud thing the
 * operator does (a shot, a grenade, a breaker, a relay) adds to how much of the facility and
 * the channel has noticed them. That doesn't fade: it brings the next crew down sooner, and
 * sends them toward the last loud place instead of wherever they'd have wandered.
 *
 * Pure: the game adds noise and asks when the next landing is.
 */

/**
 * Only sounds that carry this far (px) count: footsteps, rummaging and pistol shots are
 * local business. A pistol is a conversation; a shotgun is an announcement.
 */
export const LOUD = CARRIES;
/** Most a landing can be brought forward, as a fraction of the gap before it. */
const MAX_PULL = 0.5;
/** Seconds brought forward per point of attention. */
const PULL_PER_POINT = 1;

export interface Attention {
  /** Points: a rifle shot is about 5.6, a grenade 9. */
  total: number;
  /** Where the last loud thing happened. */
  lastX: number;
  lastY: number;
}

export function freshAttention(): Attention {
  return { total: 0, lastX: 0, lastY: 0 };
}

/** The operator made a noise this far-reaching, here. */
export function noted(a: Attention, x: number, y: number, radius: number): Attention {
  if (radius < LOUD) return a;
  return { total: a.total + radius / 100, lastX: x, lastY: y };
}

/**
 * When the next crew lands: its scheduled time, brought forward by the attention the
 * operator has drawn, but never before the previous landing plus half the usual gap.
 * @param scheduled seconds into the raid it would land on a quiet run
 * @param previous seconds of the landing before it (0 for the first)
 */
export function landingAt(scheduled: number, previous: number, a: Attention): number {
  const gap = scheduled - previous;
  return scheduled - Math.min(gap * MAX_PULL, a.total * PULL_PER_POINT);
}

/** How it reads on the radio, once each: 0 quiet, 1 heard, 2 everyone knows. */
export function attentionLevel(a: Attention): 0 | 1 | 2 {
  return a.total >= 160 ? 2 : a.total >= 60 ? 1 : 0;
}
