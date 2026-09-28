import type { RoomKind } from './themes';

/**
 * Things a contract can only get done by going down there: a part bolted to a particular
 * machine, a relay that has to be restarted by hand, a log that can only be read at its own
 * terminal, a man who has to be dealt with. Contracts point at these; the facility generator
 * puts them in the world while the contract is open (see `raidPlan` in core/quests.ts).
 */

/** How deep into a facility something sits (see `Room.zone`). */
export type Zone = 'entry' | 'working' | 'restricted' | 'deep' | 'exit';

export interface SiteDef {
  /** Rooms it belongs in, most fitting first. If the facility has none, one is made. */
  rooms: RoomKind[];
  /** How deep it sits. */
  zone: 'working' | 'restricted' | 'deep';
  /** What the operator holds E at (verb phrase, upper case). */
  verb: string;
  /** Seconds of holding E. */
  time: number;
  /** How far the work carries (px). Unbolting and restarting things is not quiet. */
  noise: number;
  /** The wall piece it's fitted to. */
  sprite: string;
  /** Said on the feed when it's done. */
  done: string;
}

/**
 * Items that exist in one kind of place and are never sold: they're taken off the wall they
 * were fitted to. Keyed by item id.
 */
export const RETRIEVALS: Record<string, SiteDef> = {
  regulator: {
    rooms: ['reactor', 'workshop'], zone: 'working', verb: 'UNBOLT THE PUMP REGULATOR', time: 3, noise: 260,
    sprite: 'ship_pipe_v', done: 'REGULATOR FREE · IT IS YOURS WHEN YOU GET IT HOME',
  },
  kamenev_tin: {
    rooms: ['barracks', 'storage'], zone: 'restricted', verb: 'PRISE OPEN LOCKER 41', time: 2.2, noise: 140,
    sprite: 'ship_locker_s', done: 'A BISCUIT TIN. LETTERS, AND A PHOTOGRAPH',
  },
  flight_recorder: {
    rooms: ['storage', 'workshop', 'security'], zone: 'deep', verb: 'CUT THE FLIGHT RECORDER LOOSE', time: 3.2, noise: 220,
    sprite: 'merc_case2', done: 'THE VESNA\'S RECORDER · STILL WARM FROM ITS BATTERY',
  },
  grow_lamp: {
    rooms: ['lab', 'mess', 'storage'], zone: 'restricted', verb: 'UNSCREW THE GROW LAMP', time: 2.4, noise: 120,
    sprite: 'med_monitor', done: 'GROW LAMP · THE BULB IS INTACT. FEDYA WILL CRY',
  },
  sample_case: {
    rooms: ['lab', 'medbay'], zone: 'deep', verb: 'BREAK THE SEAL ON THE SAMPLE FRIDGE', time: 2.8, noise: 180,
    sprite: 'med_crate', done: 'SAMPLE CASE · COLD. SOMETHING TAPS INSIDE',
  },
};

/** Jobs done with your hands, in a particular room. Keyed by task id. */
export interface TaskDef extends SiteDef {
  /** The objective line. */
  text: string;
}

export const TASKS: Record<string, TaskDef> = {
  relay: {
    text: 'Restart a station relay by hand', rooms: ['servers', 'office', 'security'], zone: 'restricted',
    verb: 'RESTART THE RELAY', time: 3.5, noise: 420, sprite: 'hack_terminal',
    done: 'RELAY LIVE · SHURA: "I hear it. Oh, I hear it."',
  },
  evac_log: {
    text: 'Read the evacuation log in a medical bay', rooms: ['medbay'], zone: 'restricted',
    verb: 'READ THE EVACUATION LOG', time: 1.6, noise: 0, sprite: 'med_monitor',
    done: 'EVACUATION LOG READ · SIX MINUTES. THEN NOTHING',
  },
  standdown: {
    text: 'Post the stand-down order on a garrison roll-call board', rooms: ['security', 'barracks'], zone: 'deep',
    verb: 'NAIL THE STAND-DOWN ORDER TO THE BOARD', time: 2.6, noise: 200, sprite: 'ship_cabinet',
    done: 'ORDER POSTED · WHETHER ANYONE READS IT IS THEIR BUSINESS',
  },
  archive: {
    text: 'Burn a Kombinat backup archive', rooms: ['servers', 'office'], zone: 'deep',
    verb: 'SHORT THE ARCHIVE', time: 3, noise: 460, sprite: 'ship_server',
    done: 'ARCHIVE SHORTED · SPARKS, SMOKE, AND SOMEONE WILL HAVE HEARD',
  },
};

/**
 * People who have to be dealt with in person. Keyed by enemy id (see data/enemies.ts). They
 * hold a room with a couple of their own, and don't wander.
 */
export const MARKS: Record<string, { rooms: RoomKind[]; zone: 'restricted' | 'deep'; guards: number }> = {
  boss: { rooms: ['storage', 'barracks', 'workshop'], zone: 'deep', guards: 2 },
};

export function siteOf(kind: 'item' | 'task', id: string): SiteDef | undefined {
  return kind === 'item' ? RETRIEVALS[id] : TASKS[id];
}
