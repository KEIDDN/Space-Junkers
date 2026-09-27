import type { CrewId } from './crew';

/**
 * The crew talking to each other, overheard when the operator walks past. Nobody stops for
 * you and nobody explains anything: it's their ship too.
 */
export interface Exchange {
  id: string;
  lines: { who: CrewId; text: string }[];
  /** Only after the operator has come home at least once. */
  afterExtraction?: boolean;
  /** Only once the operator has read this record. */
  lore?: string;
}

export const CHATTER: Exchange[] = [
  {
    id: 'pump', lines: [
      { who: 'trader', text: 'The pump is making the noise again.' },
      { who: 'merc', text: 'Which noise.' },
      { who: 'trader', text: 'The expensive one.' },
    ],
  },
  {
    id: 'tea', lines: [
      { who: 'medic', text: 'Who drank the last of the real tea?' },
      { who: 'smuggler', text: 'There was real tea?' },
      { who: 'medic', text: 'There was.' },
    ],
  },
  {
    id: 'nine', lines: [
      { who: 'hacker', text: 'It repeated again. Eleven minutes, same as always.' },
      { who: 'merc', text: 'Then turn it off.' },
      { who: 'hacker', text: 'It isn\'t on. That\'s the point.' },
    ], lore: 'tk_radio9',
  },
  {
    id: 'cards', lines: [
      { who: 'smuggler', text: 'Double or nothing.' },
      { who: 'merc', text: 'You said that yesterday.' },
      { who: 'smuggler', text: 'And I\'m still here. So is my luck.' },
    ],
  },
  {
    id: 'newone', afterExtraction: true, lines: [
      { who: 'trader', text: 'The new one came back again.' },
      { who: 'medic', text: 'Don\'t say that out loud. You\'ll curse it.' },
    ],
  },
  {
    id: 'garden', lines: [
      { who: 'trader', text: 'Tomatoes need warmth, water, and nobody shooting at them.' },
      { who: 'hacker', text: 'Two out of three is a lot out here, Fedya.' },
    ],
  },
  {
    id: 'krasnaya', lines: [
      { who: 'medic', text: 'You were talking in your sleep again. Krasnaya.' },
      { who: 'merc', text: 'Then I was asleep. Leave it there.' },
    ],
  },
  {
    id: 'map', afterExtraction: true, lines: [
      { who: 'smuggler', text: 'Somebody sold a map of Tikhaya to three crews this week.' },
      { who: 'trader', text: 'Somebody?' },
      { who: 'smuggler', text: 'I have expenses.' },
    ],
  },
  {
    id: 'clocks', lore: 'clocks', lines: [
      { who: 'hacker', text: 'Every clock on every node. Zero, zero, zero.' },
      { who: 'medic', text: 'Maybe they just stopped.' },
      { who: 'hacker', text: 'Clocks don\'t stop together, Vera.' },
    ],
  },
];
