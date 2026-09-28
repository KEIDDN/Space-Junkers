import type { CrewId, LineClass } from './crew';

/**
 * The crew talking to each other, overheard when the operator walks past. Nobody stops for
 * you and nobody explains anything: it's their ship too. Some of it is jokes. Some of it is
 * the jokes running out. The ship changes as things happen, and so does what they talk about.
 */
export interface Exchange {
  id: string;
  lines: { who: CrewId; text: string }[];
  /** What it's for (never FUNCTIONAL: nothing overheard is needed to play). */
  kind?: Exclude<LineClass, 'functional'>;
  /** Only after the operator has come home at least once. */
  afterExtraction?: boolean;
  /** Only once the operator has read this record. */
  lore?: string;
  /** Only once this contract has been handed in. */
  after?: string;
  /** Only while this contract has not been handed in. */
  before?: string;
  /** Only after the operator has died at least once. */
  afterDeath?: boolean;
}

export const CHATTER: Exchange[] = [
  {
    // The whole game in four lines: why somebody goes down.
    id: 'buy', kind: 'character', before: 'fedya_first', lines: [
      { who: 'hacker', text: 'why don\'t we just buy a regulator?' },
      { who: 'trader', text: 'From who? With what?' },
      { who: 'hacker', text: '...right.' },
      { who: 'merc', text: 'That\'s what the operator is for.' },
    ],
  },
  {
    id: 'pump', kind: 'character', before: 'fedya_first', lines: [
      { who: 'trader', text: 'The pump is making the noise again.' },
      { who: 'merc', text: 'Which noise.' },
      { who: 'trader', text: 'The expensive one.' },
    ],
  },
  {
    id: 'pump_fixed', kind: 'character', after: 'fedya_first', lines: [
      { who: 'trader', text: 'Good news. The pump works.' },
      { who: 'medic', text: 'What\'s the bad news?' },
      { who: 'trader', text: 'Now I can hear the reactor.' },
    ],
  },
  {
    id: 'tea', kind: 'atmosphere', lines: [
      { who: 'medic', text: 'Who drank the last of the real tea?' },
      { who: 'smuggler', text: 'There was real tea?' },
      { who: 'medic', text: 'There was.' },
    ],
  },
  {
    id: 'nine', kind: 'lore', lore: 'tk_radio9', lines: [
      { who: 'hacker', text: 'It repeated again. Eleven minutes, same as always.' },
      { who: 'merc', text: 'Then turn it off.' },
      { who: 'hacker', text: 'It isn\'t on. That\'s the point.' },
    ],
  },
  {
    id: 'cards', kind: 'character', lines: [
      { who: 'smuggler', text: 'Double or nothing.' },
      { who: 'merc', text: 'You said that yesterday.' },
      { who: 'smuggler', text: 'And I\'m still here. So is my luck.' },
    ],
  },
  {
    id: 'newone', kind: 'character', afterExtraction: true, lines: [
      { who: 'trader', text: 'The new one came back again.' },
      { who: 'medic', text: 'Don\'t say that out loud. You\'ll curse it.' },
    ],
  },
  {
    id: 'garden', kind: 'character', lines: [
      { who: 'trader', text: 'Tomatoes need warmth, water, and nobody shooting at them.' },
      { who: 'hacker', text: 'two out of three is a lot out here, Fedya.' },
    ],
  },
  {
    id: 'krasnaya', kind: 'character', lines: [
      { who: 'medic', text: 'You were talking in your sleep again. Krasnaya.' },
      { who: 'merc', text: 'Then I was asleep. Leave it there.' },
    ],
  },
  {
    id: 'map', kind: 'character', afterExtraction: true, lines: [
      { who: 'smuggler', text: 'Somebody sold a map of Tikhaya to three crews this week.' },
      { who: 'trader', text: 'Somebody?' },
      { who: 'smuggler', text: 'I have expenses.' },
    ],
  },
  {
    id: 'clocks', kind: 'lore', lore: 'clocks', lines: [
      { who: 'hacker', text: 'Every clock on every node. Zero, zero, zero.' },
      { who: 'medic', text: 'Maybe they just stopped.' },
      { who: 'hacker', text: 'Clocks don\'t stop together, Vera.' },
    ],
  },
  {
    id: 'risk', kind: 'character', afterExtraction: true, lines: [
      { who: 'merc', text: 'You sent them deep last time.' },
      { who: 'trader', text: 'I didn\'t send anyone. I said where the money was.' },
      { who: 'merc', text: 'Same thing, said by a coward.' },
      { who: 'trader', text: 'Said by a man with a loan, Emeka.' },
    ],
  },
  {
    id: 'howmany', kind: 'lore', lore: 'rollcall', lines: [
      { who: 'hacker', text: 'How many people lived on those stations?' },
      { who: 'medic', text: 'Enough.' },
      { who: 'hacker', text: 'That\'s not a number.' },
      { who: 'medic', text: 'It\'s the one I have.' },
    ],
  },
  {
    id: 'evacuated', kind: 'lore', afterExtraction: true, lines: [
      { who: 'hacker', text: 'Half those stations weren\'t abandoned, you know. They were evacuated.' },
      { who: 'trader', text: 'Everyone says that about their station.' },
      { who: 'hacker', text: 'The logs I\'ve read say they did it in six minutes.' },
      { who: 'merc', text: 'Six minutes. That\'s optimistic.' },
    ],
  },
  {
    id: 'lastone', kind: 'character', afterDeath: true, lines: [
      { who: 'medic', text: 'What was the last operator\'s name?' },
      { who: 'trader', text: 'Grisha.' },
      { who: 'medic', text: 'Did he owe you money too?' },
      { who: 'trader', text: '... Less than he owed you, Vera. He owed you his arm, twice.' },
    ],
  },
  {
    id: 'value', kind: 'character', afterExtraction: true, lines: [
      { who: 'hacker', text: 'the drive they found has forty years of somebody\'s letters on it.' },
      { who: 'smuggler', text: 'What\'s it worth?' },
      { who: 'hacker', text: 'Lis.' },
      { who: 'smuggler', text: 'I asked a question.' },
    ],
  },
  {
    id: 'sirin', kind: 'lore', after: 'shura_channel', lines: [
      { who: 'medic', text: 'You don\'t want to go to Sirin.' },
      { who: 'hacker', text: 'I don\'t. I really don\'t.' },
      { who: 'medic', text: 'Then why is it on the nav console?' },
      { who: 'hacker', text: 'because I\'m going to anyway. that\'s how it works with me. I\'m sorry.' },
    ],
  },
  {
    id: 'gvozd', kind: 'character', after: 'molot_gvozd', lines: [
      { who: 'trader', text: 'Gvozd had a daughter, you know. On Tikhaya.' },
      { who: 'merc', text: 'I know.' },
      { who: 'trader', text: 'I\'m just saying.' },
      { who: 'merc', text: 'I know, Fedya.' },
    ],
  },
  {
    id: 'tomatoes_grow', kind: 'atmosphere', after: 'fedya_tomatoes', lines: [
      { who: 'smuggler', text: 'I could sell those tomatoes for more than the ship.' },
      { who: 'trader', text: 'Touch them and I sell you.' },
    ],
  },
  {
    id: 'enough', kind: 'character', afterExtraction: true, lines: [
      { who: 'medic', text: 'That\'s enough for this week.' },
      { who: 'trader', text: 'We need the money.' },
      { who: 'medic', text: 'We need them more.' },
      { who: 'trader', text: '... Both. We need both. That\'s the whole problem, Vera.' },
    ],
  },
  {
    id: 'spent', kind: 'character', afterExtraction: true, lines: [
      { who: 'trader', text: 'How much did we spend on that jump?' },
      { who: 'smuggler', text: 'You don\'t want to know.' },
      { who: 'trader', text: 'I always want to know. I just never like knowing.' },
    ],
  },
  {
    id: 'crews', kind: 'character', afterExtraction: true, lines: [
      { who: 'smuggler', text: 'Three crews went down on Tikhaya last week. Two came back up.' },
      { who: 'merc', text: 'And the third?' },
      { who: 'smuggler', text: 'Their kit is on the market. Cheap.' },
    ],
  },
  {
    id: 'creditor', kind: 'character', lines: [
      { who: 'trader', text: 'He called again.' },
      { who: 'medic', text: 'The man on the Belt?' },
      { who: 'trader', text: 'He asked how she\'s flying. He means: what is she worth, if he takes her.' },
      { who: 'merc', text: 'She\'s flying. Tell him that.' },
    ],
  },
  {
    id: 'landing', kind: 'character', afterExtraction: true, lines: [
      { who: 'medic', text: 'Do you ever think about landing somewhere, Fedya? For good?' },
      { who: 'trader', text: 'Every day.' },
      { who: 'merc', text: 'And?' },
      { who: 'trader', text: 'And then I look at the fuel gauge.' },
    ],
  },
  {
    id: 'counting', kind: 'character', afterDeath: true, lines: [
      { who: 'medic', text: 'Forty-one seconds. That\'s how long the signal was down.' },
      { who: 'merc', text: 'You counted.' },
      { who: 'medic', text: 'I always count.' },
    ],
  },
];

/**
 * One line from the crew at the airlock before a raid (not the first: that one is a scene).
 * Money first: if the jump took the last of it, Fedya says so. Otherwise whoever has
 * something to say about where you're going, or something that's always true. Picked by
 * the facility's seed, so it doesn't change while you stand there.
 */
export const DEPARTURE: Record<string, { who: CrewId; text: string }[]> = {
  any: [
    { who: 'trader', text: 'Fuel\'s paid. If the Lastochka starts screaming on the way down, that\'s normal.' },
    { who: 'merc', text: 'Count your rounds on the way down. You won\'t have time on the way up.' },
    { who: 'medic', text: 'Under half, you come home. I mean it every time I say it.' },
    { who: 'hacker', text: 'radio check. ... yep, I\'ve got you. go.' },
    { who: 'smuggler', text: 'Bring me something nobody else is selling.' },
  ],
  tikhaya: [{ who: 'trader', text: 'Tikhaya. Cheap fuel, cheap salvage. Bring me anything that still works.' }],
  merzlota: [{ who: 'hacker', text: 'most of the bores lost their heating years ago. and their lights. take the flashlight seriously.' }],
  krasnaya: [{ who: 'merc', text: 'They\'ll be at their posts. They always are. Don\'t walk into a room they\'re holding if there\'s a way round.' }],
  kombinat: [{ who: 'smuggler', text: 'Kombinat\'s cameras don\'t work. Their guards do.' }],
  sirin: [{ who: 'medic', text: 'Come back. That\'s all. Just come back.' }],
};

export function departureLine(
  p: { credits: number },
  destination: string,
  seed: number,
  /** What the short hop home costs right now. */
  homeCost: number,
): { who: CrewId; text: string } {
  if (p.credits < homeCost) {
    return destination === 'tikhaya'
      ? { who: 'trader', text: 'You\'re on my tab for this one. Come back heavy.' }
      : { who: 'trader', text: 'That jump was the last of the fuel money. Come back heavy, or we stay wherever we are.' };
  }
  const pool = [...(DEPARTURE[destination] ?? []), ...(DEPARTURE[destination] ?? []), ...DEPARTURE.any];
  return pool[Math.abs(seed) % pool.length];
}

/** What the ship might say right now, given what has happened so far. */
export function chatterFor(
  p: { stats: { extractions: number; deaths: number }; lore: readonly string[]; quests: Record<string, { status: string }> },
  said: ReadonlySet<string> = new Set(),
): Exchange[] {
  const done = (q: string) => p.quests[q]?.status === 'turnedIn';
  return CHATTER.filter((ex) => !said.has(ex.id)
    && (!ex.afterExtraction || p.stats.extractions > 0)
    && (!ex.afterDeath || p.stats.deaths > 0)
    && (!ex.lore || p.lore.includes(ex.lore))
    && (!ex.after || done(ex.after))
    && (!ex.before || !done(ex.before)));
}
