import type { MomentKind } from '../core/story';

/**
 * The crew of the Lastochka. Each has a station on the ship, a trade, a voice, a reason to
 * be out here, and opinions about the others. Lines are short on purpose: they're people,
 * not manuals. Nobody explains their own personality. (Who they are and why they're together:
 * docs/LORE_BIBLE.md.)
 */

export type CrewId = 'trader' | 'merc' | 'medic' | 'hacker' | 'smuggler';

export interface CrewDef {
  id: CrewId;
  name: string;
  /** What everyone calls them. */
  callsign: string;
  role: string;
  /** Atlas animation prefix `crew_<sprite>_<anim>`. */
  sprite: string;
  portrait: string;
  /** UI accent colour. */
  color: string;
  /** Pitch of their dialogue "voice" blips (Hz). */
  voice: number;
  /** Idle animation at their station. */
  idleAnim: 'idle' | 'sit' | 'interact';
  /** One-line description shown in the dialogue header. */
  blurb: string;
  /** First meeting. */
  intro: string[];
  /** Rotating greetings. `{name}` is the operator's callsign. */
  greetings: string[];
  /** After the player comes back from a raid alive / dead. */
  welcomeBack: string[];
  afterDeath: string[];
  /** Back alive but badly hurt / with something rare / after a hard fight: whoever cares says so. */
  wounded?: string[];
  bigFind?: string[];
  hardFight?: string[];
  /**
   * Something that happened down there (see core/story.ts) that this one has an opinion
   * about. Only one crew member owns each moment, so it's said once, by the right person.
   */
  moments?: Partial<Record<MomentKind, string[]>>;
  /** Extra greetings once a contract (id) has been handed in: the ship remembers. */
  greetingsAfter?: Record<string, string[]>;
  /**
   * Things to ask about. `lore`: only once you've read that record. `after`: only once that
   * contract is handed in. `kind` says what the answer is for (see docs/LORE_BIBLE.md).
   */
  topics: { q: string; a: string[]; minTrust?: number; lore?: string; after?: string; kind?: LineClass }[];
}

/**
 * What a line is for. FUNCTIONAL: needed to play, said plainly. CHARACTER: who this person
 * is. LORE: about the world, allowed to be mysterious. ATMOSPHERE: flavour.
 */
export type LineClass = 'functional' | 'character' | 'lore' | 'atmosphere';

export const TRUST_LEVELS = [
  { name: 'STRANGER', points: 0 },
  { name: 'KNOWN', points: 15 },
  { name: 'TRUSTED', points: 45 },
  { name: 'CREW', points: 100 },
  { name: 'FAMILY', points: 200 },
];

export function trustLevel(points: number): number {
  let lvl = 0;
  TRUST_LEVELS.forEach((t, i) => {
    if (points >= t.points) lvl = i;
  });
  return lvl;
}

export const CREW: Record<CrewId, CrewDef> = {
  trader: {
    id: 'trader', name: 'Fyodor Kuznetsov', callsign: 'DYADYA FEDYA', role: 'Captain & Trader',
    sprite: 'trader', portrait: 'portrait_trader', voice: 150, color: '#d7a45f', idleAnim: 'sit',
    blurb: 'Owns the Lastochka, on paper, and owes money on her. Buys anything, sells everything, remembers every kopek.',
    intro: [
      'So. Face to face. You\'re shorter than you sound on the radio.',
      'The last one owed me money too. Don\'t take it personally.',
      'This is my ship. Fifty years old. Held together with tape and a man on the Belt who wants his loan back.',
      'You go down, you bring things up, I turn things into kosmorubli, and she keeps flying. That\'s the whole arrangement.',
    ],
    greetings: [
      'Buying or selling? Both is also acceptable.',
      'Ask me what sells today. I\'ll tell you. Mostly the truth.',
      'Wipe your boots. That deck was scrubbed the year before the Blackout.',
      'Sit, sit. Not there, that one\'s broken. Not that one either.',
      'I did the sums again this morning. Don\'t ask.',
    ],
    greetingsAfter: {
      fedya_first: ['Listen. Hear that? Neither do I. Best sound on the ship.', 'The pump is holding. I keep going down to check on it. Like a baby.'],
      fedya_tomatoes: ['The tomatoes are doing better than me. Go and look, they like company.'],
    },
    welcomeBack: [
      'You came back heavy. I like heavy.',
      'Alive and carrying. The two best qualities in a person.',
      'Let me see, let me see. Don\'t be shy.',
      'Back. Good. I only started the speech for your replacement.',
    ],
    bigFind: [
      'Wait. Put that on the table. Slowly. Do you know what that is? I do. Sit down, we should talk.',
      'Now that is a reason to go down there. Don\'t tell Lis you have it.',
    ],
    moments: {
      lastMinute: [
        'I had my hand on the throttle, {name}. On it. I could feel the clamps letting go.',
        'Next time you want to see how close we can cut the window, do it on someone else\'s ship.',
      ],
      patrol: [
        'Shura said somebody walked in behind you. That\'s how it goes. You think the rooms behind you are done. They\'re never done.',
      ],
    },
    afterDeath: [
      'Eh. The facility keeps what it takes. Take a tea. Start again.',
      'You lost the kit. You didn\'t lose yourself. One of those is replaceable, and I sell it.',
      'Molot says you pushed too deep. Molot says that about everyone. Sometimes he\'s right.',
    ],
    topics: [
      { q: 'Why do the stations still run?', lore: 'tk_grid', kind: 'lore', a: ['Reserve power. The Commonwealth built for a hundred years and got sixty.', 'What I don\'t understand is what gets the power first when there\'s almost none. It\'s never the heating.'] },
      { q: 'What is this ship?', kind: 'character', a: ['The Lastochka. Swallow. A Commonwealth ore tender, decommissioned twice. Recommissioned once, by me.', 'I bought her at an auction nobody else came to. The reactor was still warm. So was the previous owner, but that\'s another story.'] },
      { q: 'What happened to the Commonwealth?', kind: 'lore', a: ['The Blackout. One night every clock stopped. Then the orders stopped. Then the pay.', 'The garrisons waited. Then they stopped waiting. The factories just... kept the lights on.'] },
      { q: 'And Earth?', kind: 'lore', a: ['Earth is where the orders came from. Then it\'s where the orders didn\'t come from.', 'Shura thinks something switched us off. I think they forgot us. Which is worse, I haven\'t decided.'] },
      { q: 'Why is there still anything left down there?', kind: 'lore', a: ['Thousands of stations. Fuel costs what it costs. And the deep parts were sealed, by order, forty years ago.', 'When a station\'s reserve finally dies, its seals die with it. Doors that held for forty years open. That\'s a fresh signal. Everyone runs for those.'] },
      { q: 'Why do people still guard those places?', minTrust: 1, kind: 'character', a: ['Some are soldiers who never got told to go home. Some are families who think it\'s theirs now. Maybe it is.', 'Everybody guards something. I guard this ship. From Lis, mainly.'] },
      { q: 'Molot doesn\'t like the risks you take.', minTrust: 1, kind: 'character', a: ['Molot doesn\'t like anything. It\'s why he\'s alive.', 'I don\'t send anyone anywhere. I say where the money is. You decide. That\'s different.', '... It\'s a little different.'] },
      { q: 'What do you want out of all this?', minTrust: 3, kind: 'character', a: ['A little house on Tikhaya. A garden. Tomatoes.', 'Don\'t laugh. Tomatoes are expensive out here.'] },
    ],
  },
  merc: {
    id: 'merc', name: 'Emeka Adeyemi', callsign: 'MOLOT', role: 'Security & Armorer',
    sprite: 'merc', portrait: 'portrait_merc', voice: 92, color: '#c2573f', idleAnim: 'idle',
    blurb: 'Old soldier of the Seventh Orbital. Walked away from Krasnaya in year three. Says little and counts everything.',
    intro: [
      'You\'re the operator.',
      'I keep the guns clean and the crew breathing. Down there, you do what I told you up here, and you come back.',
      'Need iron, me. Need advice, also me. Need a hug, the Doctor.',
    ],
    greetings: [
      'Operator.',
      'Check your magazines before you check anything else.',
      'Rifle, armour, ammunition. In that order.',
      'Talk.',
      'You slept. Good. Most don\'t, the first week.',
    ],
    greetingsAfter: {
      molot_gvozd: ['Tikhaya\'s quieter. Don\'t get used to it.'],
      molot_garrison: ['I dreamt about the depot. First time it wasn\'t loud.'],
    },
    welcomeBack: [
      'Back in one piece. Good.',
      'You smell like cordite. That\'s the right smell.',
      'Sit. Tell me what you\'d do differently. There\'s always something.',
    ],
    hardFight: [
      'Count the rounds you have left. Now tell me how many you thought you had. The difference is how close it was.',
      'That was a fight, not a salvage run. Good that you won it. Better if you hadn\'t needed to.',
      'Every shot you fire down there, someone hears. Remember that next time you\'re winning.',
    ],
    moments: {
      forced: [
        'You went through a shutter instead of round it. Fine. You bought time with noise. Just know you bought it.',
        'Forcing a door is a decision. Everyone on the other side of it gets to make one too.',
      ],
      hunted: [
        'They were on the pad with you. You don\'t stand in the open waiting for a shuttle. You hold a corner and let the shuttle come.',
        'You got out with them behind you. Next time, lose them first. Then leave.',
      ],
    },
    afterDeath: [
      'You got dropped. It happens to everybody once. Don\'t let it happen twice in the same doorway.',
      'Walk me through it. Where did the shot come from? ... Right. Next time, you check that corner.',
      'You had enough and you stayed. I know. Everybody stays once.',
    ],
    topics: [
      { q: 'Any advice for down there?', kind: 'functional', a: ['Listen before you look. If you hear them first, you choose the fight.', 'Walking is quiet, running isn\'t, shooting is the loudest thing you own.', 'A pistol is a conversation: the room hears it, maybe next door. A rifle, the level. A shotgun is an announcement. Pick what you want them to hear.', 'Far off, they only know "somewhere that way". Close, they know where. Shoot, then move.', 'Flashlight is a beacon. Use it when you need eyes, not when you\'re scared.'] },
      { q: 'What about armour?', kind: 'functional', a: ['Class matters more than weight. Pistol rounds won\'t go through a Zhuk plate. Rifle rounds will go through your shirt.', 'Buckshot is murder across a table and a rumour across a hall. Armour-piercing rounds are expensive. So is dying.'] },
      { q: 'When do I leave?', kind: 'functional', a: ['When you think "one more room". That\'s the signal.', 'The deeper rooms pay better because fewer people come back from them. That\'s not a coincidence. That\'s the price.'] },
      { q: 'Where did you serve?', minTrust: 1, kind: 'character', a: ['Seventh Orbital. We held the Krasnaya depots after the Blackout. Eleven months after the pay stopped.', 'Nobody relieved us. So I relieved myself. Walked out through the red dust. Fedya picked me up at the spaceport and never asked.'] },
      { q: 'You and Fedya argue a lot.', minTrust: 1, kind: 'character', a: ['Fedya counts money. I count people. Sometimes the numbers disagree.', 'He\'s not a bad man. He\'s a man with a loan.'] },
      { q: 'Why "Molot"?', minTrust: 3, kind: 'character', a: ['My sergeant couldn\'t say Emeka. He could say hammer.', 'He can\'t say anything now. Krasnaya.'] },
    ],
  },
  medic: {
    id: 'medic', name: 'Dr. Vera Sokolova', callsign: 'DOC', role: 'Ship\'s Medic',
    sprite: 'medic', portrait: 'portrait_medic', voice: 250, color: '#e8e2d6', idleAnim: 'interact',
    blurb: 'Surgeon from Kharon General, which closed in the Leaving. Patches holes, counts seconds, keeps samples.',
    intro: [
      'Sit. No, not there, that\'s the clean side.',
      'Sokolova. I fix what the facilities break. I also look at what the facilities grow.',
      'Bring me medicine. And anything that looks alive and shouldn\'t. I pay for both.',
    ],
    greetings: [
      'You\'re not bleeding on my floor. That\'s a good start.',
      'Bandages. Tell me you have bandages. Humour me.',
      'Look at me. ... Pupils fine. Go on.',
      'Did you eat? You didn\'t eat.',
      'Fedya\'s blood pressure is your fault, by the way. I\'ve decided.',
    ],
    greetingsAfter: {
      doc_evac: ['I wrote their names in my own book as well. The four. It seemed right.'],
    },
    welcomeBack: [
      'Scrapes and bruises. You got lucky.',
      'Let me see that arm. ... Fine. Go away. Come back later.',
      'You came back. I don\'t say that lightly. I count.',
    ],
    wounded: [
      'Sit. Don\'t talk. You\'re bleeding through that dressing and you walked here. Heroic. Stupid.',
      'You came back with more holes than you left with. Let me count them.',
      'Next time you\'re this hurt down there, you leave. Nobody\'s grading you on bravery. I\'m grading you on pulse.',
    ],
    moments: {
      lowHp: [
        'Sit. No. Lie down. Your numbers on the way up were the kind I used to write on a chart and then stop writing.',
        'You got out on what was left of you. Leave earlier. That\'s not advice, that\'s a prescription.',
      ],
    },
    afterDeath: [
      'Your signal dropped. I counted the seconds. Don\'t make me count so often.',
      'We pulled your tracker out of the feed. I\'m glad it was only the tracker.',
      'You ignored the bleeding. I could tell from the telemetry. Bandage first. Always first.',
    ],
    topics: [
      { q: 'Any medical advice?', kind: 'functional', a: ['Bleeding kills slower than bullets, but it kills. Bandage first, then heal.', 'Painkillers work over time. Take them before the fight, not during. And if you\'re under half, that\'s the ship telling you to come home.'] },
      { q: 'What are the samples for?', minTrust: 1, kind: 'lore', a: ['The things growing in the lower levels shouldn\'t exist. Fungus that eats steel. Things in sealed fridges with no parent species.', 'Somebody in the Commonwealth brought them here. I want to know from where.'] },
      { q: 'Does it matter what happened to Earth?', kind: 'character', a: ['Not to anyone I\'ve ever stitched.'] },
      { q: 'Where did you work before?', minTrust: 3, kind: 'character', a: ['Kharon General. Nine hundred beds. When the supply ships stopped, I chose who got the last of the antibiotics.', 'I don\'t want to choose like that again. So I stockpile. So you go downstairs.'] },
    ],
  },
  hacker: {
    id: 'hacker', name: 'Shura Belova', callsign: 'SHURA', role: 'Systems & Signals',
    sprite: 'hacker', portrait: 'portrait_hacker', voice: 320, color: '#46d4d8', idleAnim: 'sit',
    blurb: 'Born after the Blackout on a relay station. Talks to machines better than people. Wants every record the Commonwealth left.',
    intro: [
      'oh. hi. you\'re the new operator? cool cool cool.',
      'I do the ship systems. the scanners, the locks. basically everything that beeps. and your radio.',
      'bring me drives. chips. anything with memory. I want to know what happened out there. like, really happened.',
    ],
    greetings: [
      'hey. got any data?',
      'don\'t touch that cable. or that one. actually just don\'t touch.',
      'the facility networks are still talking to each other. isn\'t that creepy? I love it.',
      'I rewrote the nav firmware again. it\'s fine. probably.',
      'Molot says I talk too much on the radio. I say he talks too little. we\'re working on it. we\'re not.',
    ],
    greetingsAfter: {
      shura_relay: ['forty years of weather reports. it rained on Tikhaya on the day of the Blackout. nobody wrote that down anywhere else.'],
    },
    welcomeBack: [
      'you\'re back! did you find a drive? any drive?',
      'signal was clean the whole time. nice.',
      'your heart rate on the way out was very funny. sorry. not funny. interesting.',
    ],
    moments: {
      seal: [
        'that seal. reserve cells don\'t just die on a schedule. except they keep dying when somebody\'s standing near them. I\'m writing it down.',
        'a seal let go while you were in there. I checked the log afterwards: every seal I\'ve ever seen fail, failed on the minute. not the second. the minute.',
      ],
      nine: [
        'nine came through a speaker down there? five tones? ... okay. okay. tell me exactly where you were standing. exactly.',
      ],
      blackout: [
        'when the lights went, the channel didn\'t. everything else in that station lost power and the receiver kept listening. just saying.',
      ],
    },
    afterDeath: [
      'your biomonitor flatlined and I kind of panicked. glad you\'re... back. anyway.',
      'I saved the last thirty seconds of your helmet cam. you don\'t want to watch it. Molot watched it. he made notes.',
    ],
    topics: [
      { q: 'What is channel nine?', lore: 'tk_radio9', kind: 'lore', a: ['every Commonwealth node had a receiver on nine. military, civilian, a tractor plant: all of them. nobody could tell you why.', 'since the Blackout it carries something. not a voice. a pattern that repeats every eleven minutes. I\'ve been recording it.'] },
      { q: 'What are you looking for?', kind: 'character', a: ['the Blackout logs. the moment the network went dark, every node recorded something.', 'nobody\'s put them together. I\'m going to. I was born into the dark. I\'d like to know who turned it off.'] },
      { q: 'What\'s a jammed shutter?', kind: 'functional', a: ['rust on the leaves, amber lamp. somebody welded it shut behind them once.', 'you can force it. hold on it a few seconds. it screams halfway and bangs at the end. anyone a room or two off hears both, and so does the channel.', 'it\'s usually the short way to somewhere deep. the long way round is quieter. and full of people. pick one.'] },
      { q: 'What\'s a vault keycard for?', kind: 'functional', a: ['deep facilities have a vault. security-sealed. red door, you can\'t miss it.', 'cards wear out after three swipes. I can sell you one. at cost. ish.'] },
      { q: 'What do you think happened?', minTrust: 2, kind: 'lore', a: ['I think something on the ninth channel talked, and something here listened.', 'every node that went dark was listening to the same channel. that\'s not a coincidence, that\'s a message.', 'Doc says it doesn\'t matter. Doc wasn\'t born in it.'] },
    ],
  },
  smuggler: {
    id: 'smuggler', name: 'Unknown', callsign: 'LIS', role: 'Contrabandist',
    sprite: 'smuggler', portrait: 'portrait_smuggler', voice: 118, color: '#b8322a', idleAnim: 'idle',
    blurb: 'Nobody knows the face under the hood. Fedya says Lis came with the ship. Lis says nothing.',
    intro: [
      '...',
      'You need something the others won\'t sell. I have it.',
      'You find something the others won\'t buy. I buy it.',
      'We never talked.',
    ],
    greetings: [
      '...',
      'Quiet today.',
      'Show me.',
      'Walls have ears. Mine.',
      'Fedya counted his cards again. He\'s short one. He\'s always short one.',
    ],
    welcomeBack: ['You\'re still breathing. Profitable.', 'Anything shiny?', 'Hm. You walk differently when you\'re carrying something good.'],
    moments: {
      leftBehind: ['You left something on the floor down there. I heard. Somebody else is carrying it now. They\'ll sell it to me.'],
    },
    afterDeath: ['Unlucky.', 'The dead don\'t pay. You\'re not dead. Pay attention.'],
    topics: [
      { q: 'Who are you?', kind: 'character', a: ['Someone who delivers.', 'Next question.'] },
      { q: 'What happened to Earth?', kind: 'lore', a: ['Depends who\'s paying.', 'For you, free: I met a man once who said he\'d been there. He wanted forty kosmorubli for the rest.', 'I didn\'t pay. I regret it about once a year.'] },
      { q: 'Who buys what you sell?', minTrust: 1, kind: 'lore', a: ['People who don\'t exist, on stations that aren\'t on maps.', 'Kombinat Holdings buys stations at auction. Kombinat Holdings buys from me too. Don\'t tell Kombinat Holdings.'] },
      { q: 'How long have you been on this ship?', minTrust: 3, kind: 'character', a: ['Longer than Fedya.', 'Don\'t tell him.'] },
    ],
  },
};

export const CREW_IDS = Object.keys(CREW) as CrewId[];
