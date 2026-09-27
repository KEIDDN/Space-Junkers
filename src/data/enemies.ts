export interface EnemyDef {
  id: string;
  name: string;
  /** Atlas animation prefix: `${anim}_walk`, `${anim}_walk_flash`, `${anim}_dead`. */
  anim: string;
  hp: number;
  /** px/s */
  walkSpeed: number;
  runSpeed: number;
  weapon: string;

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
  scavenger: {
    id: 'scavenger', name: 'Scavenger', anim: 'scav',
    hp: 60, walkSpeed: 38, runSpeed: 82, weapon: 'sp5',
    reactionTime: 0.55, aimError: 4, sightRange: 300, fov: 65, hearing: 1,
    preferredRange: 150, burst: [2, 4], retreatBelow: 0.35,
  },
};
