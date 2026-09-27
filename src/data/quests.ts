import type { CrewId } from './crew';
import type { ItemCategory } from './items';

/**
 * Contracts from the crew. Data-driven: objectives are a small vocabulary that raids report
 * against, so new contracts are just new entries here.
 *
 * Raid objectives (kill, search, visit) count even if you die. Extraction objectives only
 * count when you get out. Hand-ins are delivered from the stash when you turn the contract in.
 */

export type Objective =
  | { kind: 'kill'; count: number; enemy?: string; headshot?: boolean; destination?: string }
  | { kind: 'search'; count: number; destination?: string }
  | { kind: 'visit'; room: 'vault' | 'extraction'; destination?: string }
  | { kind: 'extract'; count: number; destination?: string }
  | { kind: 'extractWith'; item: string; count: number; destination?: string }
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
  /** What they say when you hand it in. */
  done: string[];
  objectives: Objective[];
  reward: QuestReward;
  requires?: { quests?: string[]; trust?: number };
}

export const QUESTS: QuestDef[] = [
  // --- Fedya ---------------------------------------------------------------
  {
    id: 'fedya_first', giver: 'trader', title: 'First Salvage',
    brief: ['First job is simple. Go down to Tikhaya, grab what you can, come back breathing.', 'The coming back part is the job. The grabbing is a bonus.'],
    done: ['You came back. That puts you ahead of the last three.', 'Here. Buy yourself something with a trigger.'],
    objectives: [{ kind: 'extract', count: 1 }],
    reward: { credits: 900, trust: 12 },
  },
  {
    id: 'fedya_parts', giver: 'trader', title: 'Parts for the Old Girl',
    brief: ['The Lastochka is sick. Hull plating, fittings. Nothing glamorous.', 'Bring me scrap and pipe. I\'ll pay you like it\'s glamorous.'],
    done: ['Beautiful. She\'ll hold another year.', 'Probably.'],
    objectives: [{ kind: 'handIn', item: 'scrap', count: 3 }, { kind: 'handIn', item: 'pipe', count: 2 }],
    reward: { credits: 700, trust: 10 },
    requires: { quests: ['fedya_first'] },
  },
  {
    id: 'fedya_foreman', giver: 'trader', title: 'The Foreman\'s Price',
    brief: [
      'An old friend runs what\'s left of a mine on Merzlota. Frozen world. Good crystals.',
      'He\'ll give me the landing codes. For a price: fuel and copper. His furnaces are dying.',
    ],
    done: ['He sent the codes. Merzlota is on the nav console now.', 'Dress warm. Shoot first.'],
    objectives: [{ kind: 'handIn', item: 'fuel', count: 1 }, { kind: 'handIn', item: 'copper_ore', count: 2 }],
    reward: { credits: 500, trust: 12, destination: 'merzlota' },
    requires: { quests: ['fedya_parts'], trust: 1 },
  },
  {
    id: 'fedya_crystals', giver: 'trader', title: 'Cold Hard Cash',
    brief: ['Cryo crystals. A buyer on the Belt wants them fresh from the source.', 'Merzlota. Bring them out yourself: no questions, no second-hand goods.'],
    done: ['Still cold. Perfect. The buyer will be very happy, and so will my accountant.'],
    objectives: [{ kind: 'extractWith', item: 'cryo', count: 2, destination: 'merzlota' }],
    reward: { credits: 2400, trust: 15 },
    requires: { quests: ['fedya_foreman'] },
  },
  {
    id: 'fedya_tomatoes', giver: 'trader', title: 'A Small Garden',
    brief: ['Don\'t laugh. I want to grow tomatoes. In the cargo bay.', 'I need a power cell for the grow lamp and something that grows in the dark. The Doctor says fungus.'],
    done: ['Look at that. Green. On my ship.', 'You\'re family now, you know that? Family pays full price, but still.'],
    objectives: [{ kind: 'handIn', item: 'cell', count: 1 }, { kind: 'handIn', item: 'fungus', count: 1 }],
    reward: { credits: 1500, trust: 30, items: [['vodka', 2]] },
    requires: { quests: ['fedya_crystals'], trust: 3 },
  },

  // --- Molot ---------------------------------------------------------------
  {
    id: 'molot_zero', giver: 'merc', title: 'Zeroing In',
    brief: ['I don\'t know you yet. Show me you can use that thing.', 'Five hostiles. Any facility.'],
    done: ['Good. You can shoot. Now learn to not get shot.'],
    objectives: [{ kind: 'kill', count: 5 }],
    reward: { credits: 700, trust: 12, items: [['ammo_545', 60]] },
  },
  {
    id: 'molot_clean', giver: 'merc', title: 'Clean Kills',
    brief: ['Center mass is for amateurs with ammunition to spare. We don\'t have ammunition to spare.', 'Three headshot kills. Aim for the line down the middle.'],
    done: ['Now you\'re saving me money. Take this, it\'ll save you a skull.'],
    objectives: [{ kind: 'kill', count: 3, headshot: true }],
    reward: { trust: 15, items: [['k6helmet', 1]] },
    requires: { quests: ['molot_zero'] },
  },
  {
    id: 'molot_orders', giver: 'merc', title: 'Old Unit',
    brief: [
      'The garrison on Krasnaya sealed their depots. Their orders travel on paper, sealed.',
      'Bring me their orders and I\'ll know which depots are still manned. Then I\'ll take you there.',
    ],
    done: ['Seventh Orbital... still holding Depot 4. After all these years.', 'Krasnaya is on the nav. Bring AP rounds. They wear real armor.'],
    objectives: [{ kind: 'handIn', item: 'orders', count: 2 }],
    reward: { credits: 800, trust: 15, destination: 'krasnaya' },
    requires: { quests: ['molot_clean'], trust: 1 },
  },
  {
    id: 'molot_garrison', giver: 'merc', title: 'Relief Column',
    brief: ['Nobody relieved them. So we will.', 'Eight garrison soldiers on Krasnaya. Make it quick. They\'ve waited long enough.'],
    done: ['...', 'Thank you. Take the Zaslon. It was meant for someone who didn\'t come back.'],
    objectives: [{ kind: 'kill', count: 8, enemy: 'soldier', destination: 'krasnaya' }],
    reward: { credits: 3000, trust: 25, items: [['zaslon', 1]] },
    requires: { quests: ['molot_orders'] },
  },

  // --- Doc -----------------------------------------------------------------
  {
    id: 'doc_stock', giver: 'medic', title: 'Stock the Infirmary',
    brief: ['I\'m down to boiled rags and good intentions.', 'Antiseptic and antibiotics. Facilities keep them in medical cabinets, when nobody\'s looted them.'],
    done: ['Oh, thank God. Take this. You\'ll need it before I do.'],
    objectives: [{ kind: 'handIn', item: 'antiseptic', count: 2 }, { kind: 'handIn', item: 'antibiotics', count: 1 }],
    reward: { credits: 500, trust: 14, items: [['carkit', 1]] },
  },
  {
    id: 'doc_growth', giver: 'medic', title: 'Things That Grow',
    brief: ['There\'s a fungus in the lower levels that glows. And another that eats rust.', 'I need them fresh from a facility. Not from Fedya\'s drawer.'],
    done: ['Look at the cell structure. It\'s... wrong. Beautifully wrong.', 'Here. A stimulant. Use it only when you have to.'],
    objectives: [{ kind: 'extractWith', item: 'fungus', count: 1 }, { kind: 'extractWith', item: 'rustcap', count: 1 }],
    reward: { credits: 900, trust: 15, items: [['stim', 1]] },
    requires: { quests: ['doc_stock'] },
  },
  {
    id: 'doc_egg', giver: 'medic', title: 'Parent Species',
    brief: ['The eggs. I need one. Intact.', 'If I can sequence it, I can find where it came from. Where all of this came from.'],
    done: ['It\'s warm.', 'Whatever laid this was never catalogued by the Commonwealth. Which means they brought it back from somewhere they never told anyone about.'],
    objectives: [{ kind: 'handIn', item: 'egg', count: 1 }],
    reward: { credits: 4000, trust: 30, items: [['surgkit', 1]] },
    requires: { quests: ['doc_growth'], trust: 2 },
  },

  // --- Shura ---------------------------------------------------------------
  {
    id: 'shura_fragments', giver: 'hacker', title: 'Fragments',
    brief: ['every drive down there has a piece of the Blackout logs. a timestamp. a packet. something.', 'bring me any two documents. chips, orders, drives. I\'ll give you a keycard for the vaults.'],
    done: ['ooh. oh. OK, this one has a header I\'ve never seen. thank you!!', 'here\'s the card. vault doors are red. you can\'t miss them.'],
    objectives: [{ kind: 'handInCategory', category: 'documents', count: 2 }],
    reward: { credits: 400, trust: 14, items: [['keycard', 1]] },
  },
  {
    id: 'shura_vault', giver: 'hacker', title: 'Behind the Red Door',
    brief: ['every facility vault has its own air-gapped terminal. I need someone to physically stand in one.', 'just get inside a vault. my tracker in your helmet will do the rest.'],
    done: ['got it. got it! the vault node logged the Blackout at the same second as all the others.', 'the SAME second. across light-hours. that\'s impossible. that\'s so cool.'],
    objectives: [{ kind: 'visit', room: 'vault' }],
    reward: { credits: 1800, trust: 18 },
    requires: { quests: ['shura_fragments'] },
  },
  {
    id: 'shura_key', giver: 'hacker', title: 'Security Key',
    brief: ['Kombinat Orbital won\'t answer anyone without a corporate handshake.', 'an encrypted drive and a diagnostic pad. I can forge the rest.'],
    done: ['...and we\'re in. Kombinat is on the nav console.', 'careful. corporate security doesn\'t miss. like, statistically.'],
    objectives: [{ kind: 'handIn', item: 'cryptdrive', count: 1 }, { kind: 'handIn', item: 'diagpad', count: 1 }],
    reward: { credits: 1200, trust: 20, destination: 'kombinat' },
    requires: { quests: ['shura_vault'], trust: 2 },
  },
  {
    id: 'shura_channel', giver: 'hacker', title: 'The Channel',
    brief: [
      'I need an AI core from Kombinat. a live one. carried out, not bought.',
      'if the cores were listening to the channel, one of them remembers where it came from.',
    ],
    done: [
      'it\'s talking. it\'s... giving me coordinates.',
      'Sirin. the source. it\'s on the nav console. I don\'t think we should go. I think we\'re going to go.',
    ],
    objectives: [{ kind: 'extractWith', item: 'ai_core', count: 1, destination: 'kombinat' }],
    reward: { credits: 5000, trust: 30, destination: 'sirin' },
    requires: { quests: ['shura_key'] },
  },

  // --- Lis -------------------------------------------------------------------
  {
    id: 'lis_bar', giver: 'smuggler', title: 'Discreet Delivery',
    brief: ['A gold bar. Out of a facility, in your pack, onto this ship.', 'Nobody sees it. Nobody asks.'],
    done: ['Good.', 'Here.'],
    objectives: [{ kind: 'extractWith', item: 'gold_bar', count: 1 }],
    reward: { credits: 1200, trust: 15 },
  },
  {
    id: 'lis_shiny', giver: 'smuggler', title: 'Shiny Things',
    brief: ['My buyers like jewellery. Rings, watches, chains, coins.', 'Four valuables. Any kind.'],
    done: ['They\'ll be happy.', 'Happy buyers make generous sellers. Look at my stock again.'],
    objectives: [{ kind: 'handInCategory', category: 'valuables', count: 4 }],
    reward: { credits: 800, trust: 20, items: [['frag', 2]] },
    requires: { quests: ['lis_bar'] },
  },
  {
    id: 'lis_crown', giver: 'smuggler', title: 'The Crown',
    brief: ['There\'s a story about a crown. A tsarina\'s. Carried out here by someone who shouldn\'t have had it.', 'If you find it, you bring it to me. Not to Fedya. To me.'],
    done: ['...', 'So it was real.', 'You\'ve done me a kindness. I remember kindness.'],
    objectives: [{ kind: 'handIn', item: 'crown', count: 1 }],
    reward: { credits: 12000, trust: 40 },
    requires: { quests: ['lis_shiny'], trust: 2 },
  },
];

export const QUEST: Record<string, QuestDef> = Object.fromEntries(QUESTS.map((q) => [q.id, q]));
