import type { CrewId } from './crew';
import type { ItemCategory } from './items';

/**
 * Contracts from the crew. They aren't a quest board: they're the crew's own needs (a pump
 * part, dressings, a record Shura has wanted for years) and now and then a buyer on the Belt
 * who wants something from one particular place.
 *
 * The rule: shops prepare you, raids do the job. No contract asks for anything a crew member
 * sells. Where an item is wanted, it has to be taken from a place (`retrieve`, placed by the
 * generator while the contract is open) or found down there and carried out (`extractWith`,
 * found in raid, never bought). Where a thing has to be done, it's done with your hands at a
 * site (`task`), or it's about how you raid (`haul`, `read`, `kill`).
 *
 * When they count:
 *   kill, search, visit, task, read   the moment they happen, even if you die after
 *   extract, extractWith, retrieve, haul   only when you get out
 *   handIn, handInCategory   from the stash, when you turn the contract in
 *
 * Every contract has three kinds of text, kept apart on purpose (see docs/LORE_BIBLE.md):
 * `brief` and `done` are the person talking (CHARACTER); the objective lines and `intel` are
 * what the operator needs to know to play (FUNCTIONAL), said plainly.
 */

export type Objective =
  | { kind: 'kill'; count: number; enemy?: string; headshot?: boolean; destination?: string }
  | { kind: 'search'; count: number; destination?: string }
  | { kind: 'visit'; room: 'vault' | 'extraction'; destination?: string }
  | { kind: 'extract'; count: number; destination?: string }
  | { kind: 'extractWith'; item: string; count: number; destination?: string }
  /** Take a contract item from where it is fitted (data/objectives.ts RETRIEVALS) and get it home. */
  | { kind: 'retrieve'; item: string; destination: string }
  /** Do a job with your hands at its site (data/objectives.ts TASKS). */
  | { kind: 'task'; task: string; destination: string }
  /** Come home from one raid carrying at least this much found salvage (KR). */
  | { kind: 'haul'; value: number; destination?: string }
  /** Read this many records (terminals, notes) down there. */
  | { kind: 'read'; count: number; destination?: string }
  | { kind: 'handIn'; item: string; count: number }
  | { kind: 'handInCategory'; category: ItemCategory; count: number };

export interface QuestReward {
  credits?: number;
  items?: [string, number][];
  trust?: number;
  destination?: string;
}

export interface QuestDef {
  id: string;
  giver: CrewId;
  title: string;
  /** What they say when offering it. */
  brief: string[];
  /** Where and how, in one plain line (shown on the contract card and the job sheet). */
  intel?: string;
  /** What they say when you hand it in. */
  done: string[];
  objectives: Objective[];
  reward: QuestReward;
  requires?: { quests?: string[]; trust?: number };
}

export const QUESTS: QuestDef[] = [
  // --- Fedya: the ship, the money, the next jump ----------------------------
  {
    id: 'fedya_first', giver: 'trader', title: 'The Pump',
    brief: [
      'The coolant pump. You hear that knock? That\'s a regulator with nine days left in it. Maybe seven.',
      'Zarya-7 ran the same pump. Every station on Tikhaya did. Unbolt theirs, bring it here.',
      'Anything else you find down there is yours to sell. The regulator is mine.',
    ],
    intel: 'Pump halls sit mid-facility: big tanks, loud machinery. Unbolting is noisy. It only counts once it\'s aboard.',
    done: [
      'Let me hear it.',
      '... Listen to that. Nothing. Beautiful nothing.',
      'You came back with the part. That puts you ahead of the last three. Here, your share.',
    ],
    objectives: [{ kind: 'retrieve', item: 'regulator', destination: 'tikhaya' }],
    reward: { credits: 900, trust: 12 },
  },
  {
    id: 'fedya_parts', giver: 'trader', title: 'Fuel Money',
    brief: [
      'Good news: the pump works. Bad news: it pumps into a reactor that wants feeding.',
      'I need one good run. Not a brave run. A heavy one. Come home with a week of fuel on your back.',
    ],
    intel: 'Carry out 1,500 KR of salvage from a single raid. Anything you brought down doesn\'t count.',
    done: ['Heavy. I like heavy.', 'Half of this is going to a man on the Belt who doesn\'t say please. The other half is yours.'],
    objectives: [{ kind: 'haul', value: 1500 }],
    reward: { credits: 700, trust: 10 },
    requires: { quests: ['fedya_first'] },
  },
  {
    id: 'fedya_foreman', giver: 'trader', title: 'Locker 41',
    brief: [
      'There\'s a foreman on Merzlota who can get us landing codes. Kamenev. He doesn\'t want money.',
      'His brother worked the ore mill on Tikhaya. Never came up when they evacuated. Locker 41.',
      'He wants what\'s in it. I didn\'t ask. You don\'t ask either.',
    ],
    intel: 'Tikhaya. Barracks or stores, past the working rooms. Prise open locker 41 and bring what\'s inside home.',
    done: [
      'He called. He didn\'t say anything for a long time, then he read me the codes.',
      'Merzlota is on the nav. Dress warm. Shoot first.',
    ],
    objectives: [{ kind: 'retrieve', item: 'kamenev_tin', destination: 'tikhaya' }],
    reward: { credits: 500, trust: 12, destination: 'merzlota' },
    requires: { quests: ['fedya_parts'], trust: 1 },
  },
  {
    id: 'fedya_crystals', giver: 'trader', title: 'Cold Hard Cash',
    brief: [
      'A buyer on the Belt wants cryo crystals. From the source, he says. He can tell.',
      'He can\'t tell. But he pays like he can, so they come out of Merzlota in your pack.',
    ],
    intel: 'Merzlota. Cryo crystals turn up in stores and mining rooms. Found down there, carried out.',
    done: ['Still cold. Perfect. My creditor will be very happy, and so will I, briefly.'],
    objectives: [{ kind: 'extractWith', item: 'cryo', count: 2, destination: 'merzlota' }],
    reward: { credits: 2400, trust: 15 },
    requires: { quests: ['fedya_foreman'] },
  },
  {
    id: 'fedya_tomatoes', giver: 'trader', title: 'A Small Garden',
    brief: [
      'Don\'t laugh. I want to grow tomatoes. In the cargo bay.',
      'The miners on Merzlota had a greenhouse. The lamps are still up there, I\'d bet my ship on it. Don\'t tell Lis I said that.',
      'And the Doctor says something that grows in the dark. Fungus. For the soil.',
    ],
    intel: 'Merzlota: unscrew a grow lamp in a lab, canteen or stores. Plus one luminous fungus found down there.',
    done: ['Look at that. Green. On my ship.', 'You\'re family now, you know that? Family pays full price, but still.'],
    objectives: [{ kind: 'retrieve', item: 'grow_lamp', destination: 'merzlota' }, { kind: 'extractWith', item: 'fungus', count: 1 }],
    reward: { credits: 1500, trust: 30, items: [['vodka', 2]] },
    requires: { quests: ['fedya_crystals'], trust: 3 },
  },

  // --- Molot: can you be trusted with a gun, and what he left on Krasnaya -----------
  {
    id: 'molot_zero', giver: 'merc', title: 'Zeroing In',
    brief: [
      'I don\'t know you yet. Everyone is brave on the ship.',
      'Put four of them down. Any facility. Then come back and tell me which one you should have left alone.',
    ],
    intel: 'Four kills, anywhere. Counts even if you don\'t make it out.',
    done: ['Good. You can shoot. Now learn when not to.'],
    objectives: [{ kind: 'kill', count: 4 }],
    reward: { credits: 700, trust: 12, items: [['ammo_545', 60]] },
  },
  {
    id: 'molot_clean', giver: 'merc', title: 'Clean Kills',
    brief: ['Centre mass is for people with ammunition to spare. We don\'t have ammunition to spare.', 'Three. In the head. Hold your aim steady and wait for it.'],
    intel: 'Three headshot kills. Steady aim (RMB / LT) tightens the cone.',
    done: ['Now you\'re saving me money. Take this. It\'ll save you a skull.'],
    objectives: [{ kind: 'kill', count: 3, headshot: true }],
    reward: { trust: 15, items: [['k6helmet', 1]] },
    requires: { quests: ['molot_zero'] },
  },
  {
    id: 'molot_gvozd', giver: 'merc', title: 'Gvozd',
    brief: [
      'The scavengers on Tikhaya have a boss now. Gvozd. Nail. He\'s been selling our landing pattern to raiders.',
      'He sits in the back of whatever plant he\'s in, with two of his own, on the good stuff. He doesn\'t go looking. He waits.',
      'So don\'t make him wait long.',
    ],
    intel: 'Tikhaya, the deep rooms. Gvozd wears a steel helmet and a vest and carries a pump gun; two guards hold the room with him.',
    done: ['Gvozd.', 'Hm. I thought I\'d feel something about that.', 'His stash is yours. That\'s how it works down there.'],
    objectives: [{ kind: 'kill', count: 1, enemy: 'boss', destination: 'tikhaya' }],
    reward: { credits: 2200, trust: 18, items: [['ammo_12slug', 20]] },
    requires: { quests: ['molot_clean'] },
  },
  {
    id: 'molot_orders', giver: 'merc', title: 'Old Unit',
    brief: [
      'Krasnaya\'s depots send orders on paper. Sealed. Couriers used to run them through every depot in the system.',
      'Some never arrived. They\'re in lockers and on bodies all over. Bring me two and I\'ll know which depots still answer the roll.',
    ],
    intel: 'Any two Sealed Orders, found anywhere. Offices, lockers, filing cabinets, bodies.',
    done: ['Seventh Orbital. Depot 4. Still holding.', 'Forty years. Most of them weren\'t born when the order came.', 'Krasnaya is on the nav. Bring armour-piercing rounds. They wear real plate.'],
    objectives: [{ kind: 'handIn', item: 'orders', count: 2 }],
    reward: { credits: 800, trust: 15, destination: 'krasnaya' },
    requires: { quests: ['molot_gvozd'], trust: 1 },
  },
  {
    id: 'molot_garrison', giver: 'merc', title: 'Relief Column',
    brief: [
      'I wrote something. A stand-down order. In the old format, with the old stamp. I kept the stamp.',
      'Nail it to the roll-call board in Depot 4. Deep in. They\'ll shoot at you all the way there. They were raised to.',
      'Maybe someone reads it.',
    ],
    intel: 'Krasnaya, the deepest rooms: security or barracks. Posting it takes a few seconds and it isn\'t quiet.',
    done: ['...', 'Thank you.', 'Take the Zaslon. It was meant for someone who didn\'t come back. It\'s been waiting long enough too.'],
    objectives: [{ kind: 'task', task: 'standdown', destination: 'krasnaya' }],
    reward: { credits: 3000, trust: 25, items: [['zaslon', 1]] },
    requires: { quests: ['molot_orders'] },
  },

  // --- Doc: medicine, and what grows down there -----------------------------------
  {
    id: 'doc_stock', giver: 'medic', title: 'Stock the Infirmary',
    brief: [
      'We\'re out of antiseptic.',
      'Medical cabinets. Every facility had one. Most were looted in the Leaving; most isn\'t all.',
      'Nobody sells antibiotics any more. So nobody gets sick. That\'s the plan.',
    ],
    intel: 'Two antiseptic and one antibiotics. Medical cabinets in medical bays are the best bet.',
    done: ['Oh, thank God.', 'Take this. You\'ll need it before I do.'],
    objectives: [{ kind: 'handIn', item: 'antiseptic', count: 2 }, { kind: 'handIn', item: 'antibiotics', count: 1 }],
    reward: { credits: 500, trust: 14, items: [['carkit', 1]] },
  },
  {
    id: 'doc_growth', giver: 'medic', title: 'Things That Grow',
    brief: ['There\'s a fungus in the lower levels that glows. And another that eats rust.', 'Fresh, from a facility, carried by you. Not from Fedya\'s drawer. I know what\'s in Fedya\'s drawer.'],
    intel: 'One luminous fungus and one rustcap, found down there and carried out.',
    done: ['Look at the cell walls. That\'s... wrong. Beautifully wrong.', 'Here. A stimulant. Only when you have to.'],
    objectives: [{ kind: 'extractWith', item: 'fungus', count: 1 }, { kind: 'extractWith', item: 'rustcap', count: 1 }],
    reward: { credits: 900, trust: 15, items: [['stim', 1]] },
    requires: { quests: ['doc_stock'] },
  },
  {
    id: 'doc_evac', giver: 'medic', title: 'Six Minutes',
    brief: [
      'The miners on Merzlota evacuated their infirmary. The log says it took six minutes.',
      'You don\'t evacuate an infirmary in six minutes. Not with patients.',
      'I want to know what they left. Read it for me. At the terminal. The log never leaves that room.',
    ],
    intel: 'Merzlota. A medical bay past the working rooms. Read its evacuation log. Counts the moment you read it.',
    done: ['Six minutes.', 'That\'s optimistic.', 'They left four in beds. They wrote their names down first. That was something, at least.'],
    objectives: [{ kind: 'task', task: 'evac_log', destination: 'merzlota' }],
    reward: { credits: 1100, trust: 16, items: [['medkit', 1]] },
    requires: { quests: ['doc_growth'] },
  },
  {
    id: 'doc_egg', giver: 'medic', title: 'Parent Species',
    brief: [
      'Kombinat keeps sample fridges in its deep labs. Sealed by the Commonwealth, never opened.',
      'I want one. Intact. If I can sequence what\'s in it, I can find where it came from. Where all of this came from.',
    ],
    intel: 'Kombinat Orbital, deep labs or medical bays. Break the fridge seal, carry the case out.',
    done: ['It\'s warm.', 'Whatever this is, the Commonwealth never catalogued it. Which means they brought it back from somewhere they never told anyone about.'],
    objectives: [{ kind: 'retrieve', item: 'sample_case', destination: 'kombinat' }],
    reward: { credits: 4000, trust: 30, items: [['surgkit', 1]] },
    requires: { quests: ['doc_evac'], trust: 2 },
  },

  // --- Shura: the network, and what it was listening to -----------------------------
  {
    id: 'shura_relay', giver: 'hacker', title: 'Wake the Relay',
    brief: [
      'every station on Tikhaya has a relay cabinet. they all went quiet at the Blackout.',
      'if you restart one by hand, just one, I get forty years of its buffer. forty years!',
      'it\'s a big switch. it makes a big noise. that\'s the only downside. well. one of the downsides.',
    ],
    intel: 'Tikhaya. Relay cabinets are in computing rooms, offices and guard posts past the working rooms. Loud.',
    done: ['it\'s downloading. it\'s... it\'s mostly weather reports. forty years of weather.', 'I love it. thank you. genuinely.'],
    objectives: [{ kind: 'task', task: 'relay', destination: 'tikhaya' }],
    reward: { credits: 800, trust: 14 },
  },
  {
    id: 'shura_fragments', giver: 'hacker', title: 'Fragments',
    brief: [
      'every terminal down there remembers the Blackout differently. I need readings. yours. in your helmet.',
      'read three things. terminals, notes, anything. I\'ll get a keycard off you for the vaults.',
      'off TO you. I\'ll get a keycard to you. sorry.',
    ],
    intel: 'Read three records in one raid or across several. Terminals glow green; notes lie near what people left.',
    done: ['this one has a header I\'ve never seen. ooh.', 'here\'s the card. vault doors are red. you can\'t miss them. people do, but you can\'t.'],
    objectives: [{ kind: 'read', count: 3 }],
    reward: { credits: 400, trust: 14, items: [['keycard', 1]] },
    requires: { quests: ['shura_relay'] },
  },
  {
    id: 'shura_vault', giver: 'hacker', title: 'Behind the Red Door',
    brief: ['every vault has an air-gapped node. air-gapped means I can\'t reach it. it means YOU can.', 'just stand inside one. my tracker in your helmet does the rest.'],
    intel: 'Get inside any sealed vault. A keycard opens the red door.',
    done: ['got it. the vault node logged the Blackout at the same thousandth of a second as every other node.', 'the SAME thousandth. across light-hours. that\'s impossible. that\'s so cool. that\'s horrible.'],
    objectives: [{ kind: 'visit', room: 'vault' }],
    reward: { credits: 1800, trust: 18 },
    requires: { quests: ['shura_fragments'] },
  },
  {
    id: 'shura_key', giver: 'hacker', title: 'Security Key',
    brief: ['Kombinat Orbital won\'t talk to anyone without a corporate handshake.', 'an encrypted drive and a diagnostic pad. real ones, from down there. I can forge the rest.'],
    intel: 'An encrypted drive (vaults, secure cases) and a diagnostic pad (server rooms, reactor rooms).',
    done: ['...and we\'re in. Kombinat is on the nav console.', 'careful. corporate security doesn\'t miss. like, statistically.'],
    objectives: [{ kind: 'handIn', item: 'cryptdrive', count: 1 }, { kind: 'handIn', item: 'diagpad', count: 1 }],
    reward: { credits: 1200, trust: 20, destination: 'kombinat' },
    requires: { quests: ['shura_vault'], trust: 2 },
  },
  {
    id: 'shura_archive', giver: 'hacker', title: 'Burn Notice',
    brief: [
      'Kombinat keeps a backup of everything it takes. including the Lastochka\'s transponder, since yesterday.',
      'I don\'t want to be in a Kombinat archive. short it. from inside. it\'ll make a lot of smoke.',
    ],
    intel: 'Kombinat, the deepest computing rooms or offices. Shorting the archive is loud: expect company.',
    done: ['we\'re nobody again. I love being nobody.'],
    objectives: [{ kind: 'task', task: 'archive', destination: 'kombinat' }],
    reward: { credits: 2600, trust: 16 },
    requires: { quests: ['shura_key'] },
  },
  {
    id: 'shura_channel', giver: 'hacker', title: 'The Channel',
    brief: [
      'I need an AI core from Kombinat. a live one. carried out, not bought.',
      'if the cores were listening to channel nine, one of them remembers where it came from.',
    ],
    intel: 'Kombinat Orbital. AI cores are rare: servers, secure cases, the vault.',
    done: [
      'it\'s talking. it\'s giving me coordinates.',
      'Sirin. the source. it\'s on the nav console. I don\'t think we should go. I think we\'re going to go.',
    ],
    objectives: [{ kind: 'extractWith', item: 'ai_core', count: 1, destination: 'kombinat' }],
    reward: { credits: 5000, trust: 30, destination: 'sirin' },
    requires: { quests: ['shura_key'] },
  },

  // --- Lis: things with value, and people who don't exist ------------------------------
  {
    id: 'lis_bar', giver: 'smuggler', title: 'Discreet Delivery',
    brief: ['A gold bar. Out of a facility, in your pack, onto this ship.', 'Nobody sees it. Nobody asks.'],
    intel: 'One gold bar found down there and carried out. Secure cases and lockers.',
    done: ['Good.', 'Here.'],
    objectives: [{ kind: 'extractWith', item: 'gold_bar', count: 1 }],
    reward: { credits: 1200, trust: 15 },
  },
  {
    id: 'lis_recorder', giver: 'smuggler', title: 'Two In, One Out',
    brief: [
      'The Vesna. I sold them their last map of Tikhaya.',
      'Their recorder is still down there, deep, where they stopped. Someone on the Belt wants to know what they saw.',
      'I want to know who wants to know.',
    ],
    intel: 'Tikhaya, the deepest rooms. Cut the recorder loose and get it home.',
    done: ['Thank you.', 'Don\'t listen to it. I did.'],
    objectives: [{ kind: 'retrieve', item: 'flight_recorder', destination: 'tikhaya' }],
    reward: { credits: 1800, trust: 18 },
    requires: { quests: ['lis_bar'] },
  },
  {
    id: 'lis_shiny', giver: 'smuggler', title: 'Shiny Things',
    brief: ['My buyers like jewellery. Rings, watches, chains, coins.', 'Four. Any kind.'],
    intel: 'Any four valuables. Lockers, offices, bodies, secure cases.',
    done: ['They\'ll be happy.', 'Happy buyers make generous sellers. Look at my stock again.'],
    objectives: [{ kind: 'handInCategory', category: 'valuables', count: 4 }],
    reward: { credits: 800, trust: 20, items: [['frag', 2]] },
    requires: { quests: ['lis_bar'] },
  },
  {
    id: 'lis_crown', giver: 'smuggler', title: 'The Crown',
    brief: [
      'Otets had a governor, once. He had a crown made. Everyone says it was melted down in the Leaving.',
      'Everyone is wrong. If you find it, you bring it to me. Not to Fedya. To me.',
    ],
    intel: 'Legendary. Deep vaults and secure cases, on the richer worlds. You\'ll know it.',
    done: ['...', 'So it was real.', 'You\'ve done me a kindness. I remember kindness.'],
    objectives: [{ kind: 'handIn', item: 'crown', count: 1 }],
    reward: { credits: 12000, trust: 40 },
    requires: { quests: ['lis_shiny'], trust: 2 },
  },
];

export const QUEST: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
