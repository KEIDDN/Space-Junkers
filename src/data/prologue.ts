import type { CrewId } from './crew';

/**
 * The first time aboard. Not a tutorial: a morning on the Lastochka. The operator wakes at
 * their bunk, collects their kit from Molot's locker, takes the first job from Fedya at the
 * cockpit radio, and goes down through the airlock. They walk freely the whole time; the
 * crew talk only when the operator comes to them, and the ship log says where to go next.
 *
 * Progress lives in the save's flags: `prologue` (started with a new game), then `pro_kit`,
 * `pro_job`, and `pro_done` once they deploy.
 */

export type PrologueStep = 'kit' | 'job' | 'airlock';

/** Where each step happens (a ship interactable kind). */
export const STEP_AT: Record<PrologueStep, 'stash' | 'nav' | 'airlock'> = {
  kit: 'stash',
  job: 'nav',
  airlock: 'airlock',
};

export function prologueStep(flags: Record<string, boolean>): PrologueStep | null {
  if (!flags.prologue || flags.pro_done) return null;
  if (!flags.pro_kit) return 'kit';
  if (!flags.pro_job) return 'job';
  return 'airlock';
}

/** The ship log: one quiet line under the ship's name. */
export const STEP_LOG: Record<PrologueStep, string> = {
  kit: 'Your locker, by the bunks. Molot left your kit in it.',
  job: 'The cockpit. Fedya is on the radio with work.',
  airlock: 'The airlock. Tikhaya is under you.',
};

export interface SceneLine {
  who: CrewId;
  /** Heard over the ship's intercom rather than in person. */
  intercom?: boolean;
  text: string;
}

/** What is said at each step, in order. */
export const STEP_LINES: Record<PrologueStep, SceneLine[]> = {
  kit: [
    { who: 'merc', text: 'Your locker. I filled it, you sign for it. Nobody signs for anything any more, so just nod.' },
    { who: 'merc', text: 'PM-9. Old Makarov pattern, honest. Nine in the magazine, forty-five in your pockets. Count them. Down there nobody sells you more.' },
    { who: 'merc', text: 'The sack is for bringing things home. Whatever is in it is worth nothing until it is aboard.' },
    { who: 'merc', text: 'Two bandages. Stop the bleeding first, feel sorry for yourself later.' },
    { who: 'merc', text: 'What you carry down, you can lose. What you leave in this locker, you keep. Remember that when you pack.' },
  ],
  job: [
    { who: 'trader', intercom: true, text: 'Awake? Good. Sit, don\'t touch anything. I\'m on the relay from the hold.' },
    { who: 'trader', intercom: true, text: 'You know the story. Forty years ago the Commonwealth stopped answering. No war, no speech. The orders stopped, then the pay.' },
    { who: 'trader', intercom: true, text: 'The plants didn\'t stop. Nobody told them to. Depots, mills, stations: still running on reserve power, with nobody at the controls.' },
    { who: 'trader', intercom: true, text: 'Everything they built is still down there. Batteries, tools, parts, food. And people who think it belongs to them now.' },
    { who: 'trader', intercom: true, text: 'Service station Zarya-7 on Tikhaya stopped answering the relay three days ago. Maintenance, nothing military. Somebody has been living in it.' },
    { who: 'trader', intercom: true, text: 'The reactor pump is dying. We need batteries and parts or this ship drifts. Go down, take what you can carry, come back.' },
    { who: 'trader', intercom: true, text: 'The coming back is the job. I hold orbit twenty minutes, then I leave, with you or without you. I\'d prefer with. You owe me for the fuel.' },
  ],
  airlock: [
    { who: 'hacker', intercom: true, text: 'I\'m on your radio the whole way. If I hear something, you hear it.' },
    { who: 'merc', text: 'Listen before you look. If they see you first, don\'t be brave, be gone. Come back with less rather than not at all.' },
    { who: 'merc', text: 'Shuttle pad or the maintenance lift. Then home. Go on.' },
  ],
};

/** On first waking: Fedya on the intercom, once. */
export const WAKE_LINE = 'INTERCOM · FEDYA: Operator, awake? Locker first, Molot left your kit. Then come up to the cockpit. Say hello to the others on the way, they don\'t bite. Mostly.';

/** Typed over black before the first look at the ship. */
export const INTRO: string[] = [
  'Forty years ago the Commonwealth stopped answering.',
  'No war. No announcement. The orders stopped, and then the pay.',
  'Its plants, depots and stations kept running, with nobody at the controls.',
  'Five people live aboard the Lastochka, an ore tender nobody else wanted.',
  'Somebody has to go down into those places and bring back what keeps her flying.',
  'You are the one who goes down.',
];

/** The first job's facility: Zarya-7 on Tikhaya (see facilityName). */
export const PROLOGUE_DESTINATION = 'tikhaya';
export const PROLOGUE_SEED = 29;
