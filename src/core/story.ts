/**
 * What happened down there, in the order it happened: the handful of things the operator
 * will tell someone about afterwards. Nothing here is scripted; each moment is recorded when
 * the systems that make it (noise, the AI, the facility, the clock) happen to line up. The
 * report reads them back in plain words, and whichever crew member cares says something.
 *
 * Pure.
 */

export type MomentKind =
  /** Forced a jammed shutter: the shortcut, bought with noise. */
  | 'forced'
  /** A sealed door failed on its own (a raid event): the vault, open. */
  | 'seal'
  /** A crew walked through rooms the operator had already cleared (a raid event). */
  | 'patrol'
  /** The reserve dipped and the lights went (a raid event). */
  | 'blackout'
  /** Somebody else's fight, somewhere else (a raid event). */
  | 'gunfire'
  /** An alarm deep in the station (a raid event). */
  | 'alarm'
  /** Channel nine through a speaker (a raid event). */
  | 'nine'
  /** Put something worth keeping on the floor to make room. `n`: its value. */
  | 'leftBehind'
  /** Extracted with hostiles hunting them close by. */
  | 'hunted'
  /** Extracted with little of the orbit window left. `n`: seconds. */
  | 'lastMinute'
  /** Extracted badly hurt. */
  | 'lowHp';

export interface Moment {
  kind: MomentKind;
  n?: number;
}

/** Below this much of the window left, getting out counts as cutting it fine (s). */
export const LAST_MINUTE = 90;
/** Below this fraction of health, getting out counts as barely making it. */
export const LOW_HP = 0.25;
/** A dropped item worth at least this much (KR) counts as leaving something behind. */
export const WORTH_KEEPING = 400;

function clock(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const TELL: Record<MomentKind, (n?: number) => string> = {
  forced: () => 'You forced a shutter, and it was heard.',
  seal: () => 'A seal failed on its own while you were inside.',
  patrol: () => 'A crew walked through rooms you had already cleared.',
  blackout: () => 'The reserve dipped and the lights went out.',
  gunfire: () => 'Somebody else had a fight, somewhere else in the station.',
  alarm: () => 'An alarm went off somewhere deep, then stopped.',
  nine: () => 'Channel nine came through a speaker.',
  leftBehind: (n) => `You left ${n ? `${n.toLocaleString()} KR of ` : ''}something on the floor to make room.`,
  hunted: () => 'They were still coming when you lifted off.',
  lastMinute: (n) => `You made it out with ${clock(n ?? 0)} left on the window.`,
  lowHp: () => 'You got out with almost nothing left in you.',
};

/**
 * The raid in a few lines, oldest first, one per kind (the first time counts), at most
 * `max`. How it ended always makes the cut: it's the end of the story.
 */
export function raidStory(moments: readonly Moment[], max = 5): string[] {
  const seen = new Set<MomentKind>();
  const once = moments.filter((m) => !seen.has(m.kind) && seen.add(m.kind));
  const ending = new Set<MomentKind>(['hunted', 'lastMinute', 'lowHp']);
  const ends = once.filter((m) => ending.has(m.kind));
  const rest = once.filter((m) => !ending.has(m.kind)).slice(0, Math.max(0, max - ends.length));
  return [...rest, ...ends].slice(0, max).map((m) => TELL[m.kind](m.n));
}

/** How the extraction itself went, from what the game knows at the moment of leaving. */
export function exitMoments(f: { timeLeft: number; hpFrac: number; hunted: boolean }): Moment[] {
  const out: Moment[] = [];
  if (f.hunted) out.push({ kind: 'hunted' });
  if (Number.isFinite(f.timeLeft) && f.timeLeft < LAST_MINUTE) out.push({ kind: 'lastMinute', n: Math.max(0, Math.round(f.timeLeft)) });
  if (f.hpFrac < LOW_HP) out.push({ kind: 'lowHp' });
  return out;
}
