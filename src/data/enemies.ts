/**
 * How a faction behaves, beyond how well it shoots: the same senses and the same code,
 * different people. Scavengers are nervous and would rather not know; raiders go looking
 * and keep coming; the garrison moves in pairs and holds; corporate security searches
 * properly and covers each other.
 */
export interface Temper {
  /** 0..1 chance to go and look at a gunshot heard from far off (else: stop, face it, listen). */
  curiosity: number;
  /** Seconds a search lasts before they give up and go back to what they were doing. */
  patience: number;
  /** How far around where they think you were they'll search (tiles). */
  sweep: number;
  /** 0..1 chance to go after you when you break line of sight, rather than hold a corner. */
  push: number;
  /** 0..1 chance to fall back when a friend drops nearby. */
  panic: number;
  /** When a squad-mate is already checking a noise, stop halfway and cover them. */
  overwatch: boolean;
}

export interface EnemyDef {
  id: string;
  name: string;
  /** Faction look (character sheets `en_<anim>_a`/`_b`, see `game/entities/look.ts`). */
  anim: string;
  hp: number;
  /** px/s */
  walkSpeed: number;
  runSpeed: number;
  /** Weapon item ids; one is picked per spawn. */
  weapons: string[];
  /** Body armor / helmet worn, as item ids (dropped on death, worn down). */
  armor?: string;
  helmet?: string;
  /** Chance each piece of armor is actually worn. */
  armorChance?: number;
  /** Rounds of spare ammo carried [min, max]. */
  ammo: [number, number];
  /** Random pocket items [min, max]. */
  pockets: [number, number];
  /** Frag grenades carried (thrown at players who hide). */
  grenades?: number;

  /** Seconds between first seeing the player and opening fire. */
  reactionTime: number;
  /** Extra aim error (deg) on top of the weapon's spread. */
  aimError: number;
  sightRange: number;
  /** Half-angle of vision cone when unaware (deg). */
  fov: number;
  /** Multiplier on how far away gunshots are heard. */
  hearing: number;
  /** Distance the enemy tries to keep while fighting. */
  preferredRange: number;
  /** Shots per burst before re-positioning. */
  burst: [number, number];
  /** Health fraction below which it tries to break line of sight. */
  retreatBelow: number;
  /** Somebody in particular (a contract target): referred to by name, never rolled into a mix. */
  named?: boolean;
  temper: Temper;
}

export const ENEMIES: Record<string, EnemyDef> = {
  /** Desperate locals in rags and gas masks. Poorly armed, jumpy, run when hurt. */
  scavenger: {
    id: 'scavenger', name: 'Scavenger', anim: 'scav',
    hp: 60, walkSpeed: 38, runSpeed: 82, weapons: ['sp5', 'sp5', 'obrez', 'pm9'],
    helmet: 'respcap', armorChance: 0.25, ammo: [4, 18], pockets: [0, 2],
    reactionTime: 0.55, aimError: 4, sightRange: 300, fov: 65, hearing: 1,
    preferredRange: 150, burst: [2, 4], retreatBelow: 0.35,
    // Would rather not know. Freeze at distant shots, give up quickly, scatter when one drops.
    temper: { curiosity: 0.4, patience: 5, sweep: 5, push: 0.3, panic: 0.35, overwatch: false },
  },
  /** Organised salvage crews. Aggressive, close-range, decent kit. */
  raider: {
    id: 'raider', name: 'Raider', anim: 'raider',
    hp: 80, walkSpeed: 44, runSpeed: 92, weapons: ['kedr', 'ppd41', 'toz12', 'obrez'],
    armor: 'vest_ps2', helmet: 'respcap', armorChance: 0.5, ammo: [12, 35], pockets: [1, 2], grenades: 1,
    reactionTime: 0.45, aimError: 3.2, sightRange: 320, fov: 70, hearing: 1.15,
    preferredRange: 110, burst: [3, 6], retreatBelow: 0.25,
    // Go toward the noise, search wide and long, and push when you break contact.
    temper: { curiosity: 0.95, patience: 11, sweep: 9, push: 0.8, panic: 0.1, overwatch: false },
  },
  /** Commonwealth garrison that never stood down. Disciplined, armored, accurate. */
  soldier: {
    id: 'soldier', name: 'Garrison Soldier', anim: 'soldier',
    hp: 95, walkSpeed: 40, runSpeed: 88, weapons: ['akr74', 'skv', 'akr74'],
    armor: 'vest_zhuk', helmet: 'k6helmet', armorChance: 0.85, ammo: [20, 50], pockets: [0, 2], grenades: 1,
    reactionTime: 0.38, aimError: 2.2, sightRange: 380, fov: 75, hearing: 1.2,
    preferredRange: 200, burst: [2, 5], retreatBelow: 0.3,
    // One checks, one covers. Hold corners rather than chase.
    temper: { curiosity: 0.7, patience: 9, sweep: 7, push: 0.35, panic: 0.05, overwatch: true },
  },
  /** Corporate security on Kombinat. Heavy armor, expensive guns, no mercy. */
  security: {
    id: 'security', name: 'Corporate Security', anim: 'security',
    hp: 100, walkSpeed: 42, runSpeed: 90, weapons: ['vektor', 'vektor', 'svk'],
    armor: 'vest_granit', helmet: 'zaslon', armorChance: 0.7, ammo: [20, 45], pockets: [1, 2], grenades: 2,
    reactionTime: 0.32, aimError: 1.6, sightRange: 400, fov: 80, hearing: 1.25,
    preferredRange: 220, burst: [3, 5], retreatBelow: 0.2,
    // Methodical: they sweep the rooms around a noise, and cover each other doing it.
    temper: { curiosity: 0.85, patience: 12, sweep: 8, push: 0.5, panic: 0.05, overwatch: true },
  },
  /**
   * Gvozd, "the Nail": the scavengers' boss on Tikhaya. Sits in the back of whatever plant he
   * has taken, on the good stuff, with two of his own. Doesn't go looking; waits. Heavier than
   * anyone he commands, slow to rattle, and very dangerous at the range he prefers.
   */
  boss: {
    id: 'boss', name: 'Gvozd', anim: 'raider', named: true,
    hp: 150, walkSpeed: 34, runSpeed: 78, weapons: ['toz12'],
    armor: 'vest_ps2', helmet: 'k6helmet', armorChance: 1, ammo: [12, 24], pockets: [2, 3], grenades: 1,
    reactionTime: 0.42, aimError: 2.6, sightRange: 330, fov: 75, hearing: 1.25,
    preferredRange: 90, burst: [1, 2], retreatBelow: 0.15,
    // Doesn't go looking. Waits for you to come to him.
    temper: { curiosity: 0.2, patience: 4, sweep: 4, push: 0.2, panic: 0, overwatch: false },
  },
};

/**
 * How a destination's hostiles fight, on top of their faction (1 = as written above).
 * Tikhaya is where operators learn: its scavengers are as dangerous as ever up close, but
 * slower to notice, slower to shoot, wild in the first moments of a fight, and loosely
 * organised, so being seen is a mistake you can survive, not an instant death.
 */
export interface AiTuning {
  /** × seconds between seeing the target and opening fire. */
  reaction: number;
  /** × aim error. */
  aim: number;
  /** × how fast awareness builds from a sighting. */
  notice: number;
  /** × damage their rounds do to the operator. */
  damage: number;
  /** Extra aim error (× on top) in the first moments of a fight, fading over STARTLE_TIME. */
  startle: number;
  /** × shout range and flanking. */
  coordination: number;
  /** × pause between bursts. */
  pause: number;
}

/** Seconds over which a fresh contact's startle wears off. */
export const STARTLE_TIME = 1.8;

export const DEFAULT_AI: AiTuning = { reaction: 1, aim: 1, notice: 1, damage: 1, startle: 0.6, coordination: 1, pause: 1 };

/** An operator's first raid: the facility is still dangerous, but it lets them learn. */
export const FIRST_RAID_AI: AiTuning = { reaction: 1.7, aim: 1.5, notice: 0.6, damage: 0.7, startle: 2.2, coordination: 0.45, pause: 1.45 };
