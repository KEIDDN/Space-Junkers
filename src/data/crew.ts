/**
 * The crew of the Lastochka. Each has a station on the ship, a trade, a voice and a
 * reason to be out here. Dialogue lines are short on purpose: they're people, not manuals.
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
  /** Things to ask about: world, past, the Collapse. `lore`: only once you've read that record. */
  topics: { q: string; a: string[]; minTrust?: number; lore?: string }[];
}

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
    id: 'trader', name: 'Fyodor Kuznetsov', callsign: 'DYADYA FEDYA', role: 'Quartermaster & Trader',
    sprite: 'trader', portrait: 'portrait_trader', voice: 150, color: '#d7a45f', idleAnim: 'sit',
    blurb: 'Owns the Lastochka, on paper. Buys anything, sells everything, remembers every kopek.',
    intro: [
      'So you\'re the new one. Good. The last one owed me money.',
      'This is my ship. Fifty years old, held together with tape and prayer. Mostly tape.',
      'You go down, you bring things up, I turn things into kosmorubli. Simple. The Commonwealth ran on less.',
    ],
    greetings: [
      'Ah, {name}. Buying or selling? Both is also acceptable.',
      'Market\'s moving today. Ask me what sells.',
      'Wipe your boots. That deck was scrubbed in 2291.',
      'Come, come. Old Fedya has deals. Some of them are even good.',
    ],
    welcomeBack: [
      'You came back heavy. I like heavy.',
      'Alive and carrying. The two best qualities in a person.',
      'Let me see, let me see. Don\'t be shy.',
    ],
    bigFind: [
      'Wait. Wait. Put that on the table. Slowly. Do you know what that is? I do. Sit down, we should talk.',
      'Now that is a reason to go down there. Don\'t tell Lis you have it.',
    ],
    afterDeath: [
      'Eh. The facility keeps what it takes. Take a tea, start again.',
      'You lost the kit. You didn\'t lose yourself. One of those is replaceable.',
    ],
    topics: [
      { q: 'Why do the stations still run?', lore: 'tk_grid', a: ['Reserve power. The Commonwealth built for a hundred years and got forty.', 'What I don\'t understand is what gets the power first when there\'s almost none. It\'s never the heating.'] },
      { q: 'What is this ship?', a: ['The Lastochka. Swallow. A Commonwealth ore tender, decommissioned twice.', 'I bought her at an auction nobody else showed up to. The reactor was still warm.'] },
      { q: 'What happened to the Commonwealth?', a: ['The Collapse. One day the orders stopped coming. The next, the pay.', 'The garrisons waited. Then they stopped waiting. The factories just... kept the lights on.'] },
      { q: 'Why do people still guard those places?', a: ['Some are soldiers who never got told to go home. Some are scavengers who think it\'s theirs now.', 'Everybody guards something. I guard this ship.'], minTrust: 1 },
      { q: 'What do you want out of all this?', a: ['A little house on Tikhaya. A garden. Tomatoes.', 'Don\'t laugh. Tomatoes are expensive out here.'], minTrust: 3 },
    ],
  },
  merc: {
    id: 'merc', name: 'Emeka Adeyemi', callsign: 'MOLOT', role: 'Mercenary & Armorer',
    sprite: 'merc', portrait: 'portrait_merc', voice: 92, color: '#c2573f', idleAnim: 'idle',
    blurb: 'Ex-Commonwealth Foreign Legion. Says little, carries a lot, and means every word.',
    intro: [
      'You\'re the operator.',
      'I keep the guns clean and the crew breathing. You do what I say down there, you come back.',
      'Need iron, you come to me. Need advice, also me. Need a hug, the Doctor.',
    ],
    greetings: [
      'Operator.',
      'Check your mags before you check your mail.',
      'Rifle, armor, ammunition. In that order.',
      'Talk.',
    ],
    welcomeBack: [
      'Back in one piece. Good work.',
      'You smell like cordite. That\'s the right smell.',
    ],
    hardFight: [
      'I heard it on the radio. Count the rounds you have left, then tell me how many you think you have. The difference is how close it was.',
      'That was a fight, not a salvage run. Good that you won it. Better if you hadn\'t needed to.',
    ],
    afterDeath: [
      'You got dropped. It happens to everybody once. Don\'t let it happen twice in the same doorway.',
      'Walk me through it. Where did the shot come from? ... Right. Next time, you check that corner.',
    ],
    topics: [
      { q: 'Any advice for down there?', a: ['Listen before you look. If you hear them first, you choose the fight.', 'Flashlight is a beacon. Use it when you need eyes, not when you\'re scared.'] },
      { q: 'What about armor?', a: ['Class matters more than weight. Pistol rounds won\'t go through a Zhuk plate. Rifle rounds will go through your shirt.', 'AP rounds are expensive. So is dying.'] },
      { q: 'Where did you serve?', a: ['Legion. Seventh Orbital. We held the Krasnaya depots for eleven months after the Collapse.', 'Nobody relieved us. So we relieved ourselves.'], minTrust: 1 },
      { q: 'Why "Molot"?', a: ['My sergeant couldn\'t say Emeka. He could say hammer.', 'He can\'t say anything now. Krasnaya.'], minTrust: 3 },
    ],
  },
  medic: {
    id: 'medic', name: 'Dr. Vera Sokolova', callsign: 'DOC', role: 'Ship\'s Medic',
    sprite: 'medic', portrait: 'portrait_medic', voice: 250, color: '#e8e2d6', idleAnim: 'interact',
    blurb: 'Field surgeon from a hospital that no longer exists. Patches holes, asks for samples.',
    intro: [
      'Sit. No, not there, that\'s the sterile side.',
      'I\'m Sokolova. I fix what the facilities break. I also study what the facilities grow.',
      'Bring me medical supplies and anything... alive-looking. I pay well for both.',
    ],
    greetings: [
      'You\'re not bleeding on my floor. That\'s a good start.',
      'Stocked up on bandages? Humour me and say yes.',
      'Hands where I can see them. I need to check your pupils.',
      'Did you eat? You didn\'t eat.',
    ],
    welcomeBack: [
      'Scrapes and bruises. You got lucky.',
      'Let me see that arm. ... Fine. Go away. Come back later.',
    ],
    wounded: [
      'Sit. No, don\'t talk. You\'re bleeding through that dressing and you walked here. Heroic. Stupid.',
      'You came back with more holes than you left with. Let me count them.',
    ],
    afterDeath: [
      'We pulled your tracker out of the feed. I\'m glad it was only the tracker.',
      'Every time the signal drops, I count the seconds. Don\'t make me count so often.',
    ],
    topics: [
      { q: 'Any medical advice?', a: ['Bleeding kills slower than bullets, but it kills. Bandage first, then heal.', 'Painkillers work over time. Take them before the fight, not during.'] },
      { q: 'What are the samples for?', a: ['The things growing in the lower levels shouldn\'t exist. Fungus that eats steel. Eggs with no parent species.', 'Somebody in the Commonwealth brought them here. I want to know from where.'], minTrust: 1 },
      { q: 'Where did you work before?', a: ['Kharon General. Nine hundred beds. When the supply ships stopped, I chose who got the last of the antibiotics.', 'I don\'t want to choose like that again. So I stockpile.'], minTrust: 3 },
    ],
  },
  hacker: {
    id: 'hacker', name: 'Shura Belova', callsign: 'SHURA', role: 'Systems & Intel',
    sprite: 'hacker', portrait: 'portrait_hacker', voice: 320, color: '#46d4d8', idleAnim: 'sit',
    blurb: 'Talks to machines better than people. Wants every scrap of data the Commonwealth left behind.',
    intro: [
      'oh. hi. you\'re the new operator? cool cool cool.',
      'I do the ship systems, the scanners, the locks. basically everything that beeps.',
      'bring me drives. chips. anything with memory. I want to know what happened out there. like, really happened.',
    ],
    greetings: [
      'hey. got any data?',
      'don\'t touch that cable. or that one. actually just don\'t touch.',
      'the facility networks are still talking to each other. isn\'t that creepy? I love it.',
      'I rewrote the nav firmware again. it\'s fine. probably.',
    ],
    welcomeBack: [
      'you\'re back! did you find a drive? any drive?',
      'signal was clean the whole time. nice.',
    ],
    afterDeath: [
      'your biomonitor flatlined and I kind of panicked. glad the tracker was wrong. wait, it wasn\'t wrong, you died. glad you\'re... back. anyway.',
      'I saved the last thirty seconds of your helmet cam. you don\'t want to watch it.',
    ],
    topics: [
      { q: 'What is channel nine?', lore: 'tk_radio9', a: ['Every Commonwealth node had a receiver on nine. Military, civilian, a tractor plant: all of them. Nobody could tell you why.', 'Since the Blackout it carries something. Not a voice. A pattern that repeats every eleven minutes. I\'ve been recording it.'] },
      { q: 'What are you looking for?', a: ['the Blackout logs. the moment the Commonwealth network went dark, every node recorded something.', 'nobody\'s put them together. I\'m going to.'] },
      { q: 'What\'s a vault keycard for?', a: ['deep facilities have a vault. security-sealed. red door, you can\'t miss it.', 'cards wear out after a few swipes. I can sell you one. at cost. ish.'] },
      { q: 'What do you think happened?', a: ['I think something on Sirin talked back.', 'every node that went dark was listening to the same channel. the same one. that\'s not a coincidence, that\'s a message.'], minTrust: 2 },
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
    ],
    welcomeBack: ['You\'re still breathing. Profitable.', 'Anything shiny?'],
    afterDeath: ['Unlucky.', 'The dead don\'t pay. You\'re not dead. Pay attention.'],
    topics: [
      { q: 'Who are you?', a: ['Someone who delivers.', 'Next question.'] },
      { q: 'Who buys what you sell?', a: ['People who don\'t exist, on stations that aren\'t on maps.', 'The corporations out past Kombinat want Commonwealth tech. They pay in anything.'], minTrust: 1 },
      { q: 'How long have you been on this ship?', a: ['Longer than Fedya.', 'Don\'t tell him.'], minTrust: 3 },
    ],
  },
};

export const CREW_IDS = Object.keys(CREW) as CrewId[];
