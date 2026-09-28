/**
 * The crew on the radio during an operator's first raids. Nothing pops up and nothing
 * stops: Fedya, Molot, Shura and Doc say a line when something worth learning happens
 * (someone moving nearby, a guard who heard you, the first fight, the first body, the
 * first search, a wound, time to go), once each. Pure: the game hands in what is true
 * this moment and gets back what to say.
 *
 * Two kinds of line, kept apart on purpose: what to DO is said plainly, with the key
 * ({token}) at the moment it's needed; what the place IS stays for the terminals and notes
 * to be mysterious about. The crew still sound like themselves.
 */

export interface CoachFacts {
  /** Seconds into the raid. */
  elapsed: number;
  /** Distance (px) to the nearest living hostile the operator can't see, or Infinity. */
  unseenNear: number;
  /** A hostile is suspicious (investigating) right now. */
  suspected: boolean;
  /** A hostile is fighting the operator right now. */
  fighting: boolean;
  kills: number;
  /** Containers or bodies searched. */
  searched: number;
  /** Health fraction. */
  hp: number;
  bleeding: boolean;
  /** Value found so far this raid (KR). */
  haul: number;
  /** Seconds left in the orbit window. */
  left: number;
  /** Standing in an exit zone. */
  onExit: boolean;
  /** The shuttle is called but the operator stepped off the pad: its clock has stopped. */
  extractPaused: boolean;
}

export interface RadioLine {
  id: string;
  who: string;
  text: string;
}

interface Beat {
  id: string;
  who: string;
  text: string;
  when: (f: CoachFacts) => boolean;
}

const BEATS: Beat[] = [
  { id: 'down', who: 'SHURA', text: 'Signal\'s clean, you\'re down. It\'s dark in there. Light on, ears open, and don\'t run unless you mean it.', when: (f) => f.elapsed > 2.5 },
  { id: 'hear', who: 'FEDYA', text: 'Hear that? Someone\'s moving close. Stop and listen before you walk into a room.', when: (f) => f.unseenNear < 300 && f.elapsed > 6 },
  { id: 'suspect', who: 'FEDYA', text: 'He heard something. Back off into the dark, or get your gun up. Your choice, quickly.', when: (f) => f.suspected },
  { id: 'fight', who: 'MOLOT', text: 'Break his line of sight. Let him come looking, then take him from cover.', when: (f) => f.fighting },
  { id: 'kill', who: 'MOLOT', text: 'Good. Now check the body: hold {hold:interact} over it. They always carry rounds.', when: (f) => f.kills > 0 },
  { id: 'search', who: 'FEDYA', text: 'Take what\'s light and worth something: {inventory} opens your bag. None of it is ours until you\'re back aboard. Die and it stays down there.', when: (f) => f.searched > 0 },
  { id: 'hurt', who: 'DOC', text: 'You\'re hit. Get out of sight and {heal} to treat it, before you bleed out.', when: (f) => f.hp < 0.55 || f.bleeding },
  { id: 'hold', who: 'SHURA', text: 'The shuttle only comes down while you\'re on the pad. Get back on it, the clock\'s stopped.', when: (f) => f.extractPaused },
  { id: 'enough', who: 'FEDYA', text: 'That\'s a week of fuel on your back. The pad\'s on your map, {map}. Nobody ever died of leaving early.', when: (f) => f.haul > 900 && f.elapsed > 90 },
  { id: 'time', who: 'FEDYA', text: 'Half the window\'s gone. Start thinking about the way out.', when: (f) => f.left < 540 && f.left > 0 },
  { id: 'pad', who: 'SHURA', text: 'That\'s the pad. {interact} calls the shuttle, and the whole facility hears it. Stay on it and keep your gun up.', when: (f) => f.onExit },
  { id: 'map', who: 'FEDYA', text: 'Lost? {map}: the wrist map, and the job sheet. It only draws what you\'ve seen.', when: (f) => f.elapsed > 45 && !f.fighting && !f.suspected },
];

/** Minimum seconds between two lines, so the radio never talks over itself. */
const GAP = 7;

export class RadioCoach {
  private said = new Set<string>();
  private quiet = 0;

  step(dt: number, f: CoachFacts): RadioLine | null {
    this.quiet -= dt;
    if (this.quiet > 0) return null;
    for (const b of BEATS) {
      if (this.said.has(b.id) || !b.when(f)) continue;
      this.said.add(b.id);
      this.quiet = GAP;
      return { id: b.id, who: b.who, text: b.text };
    }
    return null;
  }
}
