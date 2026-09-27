export interface EnemyDef {
  id: string;
  name: string;
  /** Atlas animation prefix: `${anim}_walk`, `${anim}_walk_flash`, `${anim}_dead`. */
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
}

export const ENEMIES: Record<string, EnemyDef> = {
  /** Desperate locals in rags and gas masks. Poorly armed, jumpy, run when hurt. */
  scavenger: {
    id: 'scavenger', name: 'Scavenger', anim: 'scav',
    hp: 60, walkSpeed: 38, runSpeed: 82, weapons: ['sp5', 'sp5', 'obrez', 'pm9'],
    helmet: 'respcap', armorChance: 0.25, ammo: [4, 18], pockets: [0, 2],
    reactionTime: 0.55, aimError: 4, sightRange: 300, fov: 65, hearing: 1,
    preferredRange: 150, burst: [2, 4], retreatBelow: 0.35,
  },
};
