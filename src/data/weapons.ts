import type { GunSound } from '../engine/audio';

export type WeaponArchetype = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'marksman';

/** How a gun is reloaded: swap a magazine, break it open, or feed rounds one by one. */
export type ReloadStyle = 'mag' | 'break' | 'tube' | 'clip';

/** Ammunition families. A weapon only accepts rounds of its caliber. */
export type Caliber = '9x18' | '12ga' | '545' | '762';

export const CALIBER_NAME: Record<Caliber, string> = {
  '9x18': '9×18 KOM',
  '12ga': '12 GAUGE',
  '545': '5.45×39',
  '762': '7.62×54R',
};

export interface WeaponDef {
  id: string;
  name: string;
  archetype: WeaponArchetype;
  caliber: Caliber;
  /** Atlas frame (original art from Assets/Guns/Guns). */
  sprite: string;
  /** Hand position and muzzle tip, in the sprite's own pixel coords. */
  grip: { x: number; y: number };
  muzzle: { x: number; y: number };

  damage: number;
  /** Projectiles per trigger pull, unless the loaded ammo says otherwise (shotgun slugs). */
  pellets: number;
  /** Shots per second. */
  fireRate: number;
  automatic: boolean;
  magSize: number;
  /** Seconds. */
  reloadTime: number;
  /** Seconds to raise the weapon after switching. */
  drawTime: number;
  /** Chance per shot to jam (cleared with R). Worn-out guns only. */
  jamChance?: number;
  /** Manually cycled between shots (plays a bolt/pump sound). */
  cycled?: boolean;
  /** Loads one round at a time (seconds per round) instead of swapping a magazine. */
  reloadPerRound?: number;
  /** Break-action guns open instead of swapping a magazine. Default: from the other fields. */
  reloadStyle?: ReloadStyle;

  /** Base cone half-angle in degrees. */
  spread: number;
  /** Extra spread (deg) while moving at full speed. */
  moveSpread: number;
  /** Spread added per shot (deg), capped at bloomMax, recovering at bloomRecovery deg/s. */
  bloomPerShot: number;
  bloomMax: number;
  bloomRecovery: number;

  /** px/s */
  bulletSpeed: number;
  /** Max travel distance, px. */
  range: number;
  /** Impulse applied to the target, px/s. */
  knockback: number;

  /** Camera push opposite the shot (px), screen shake trauma, and how far the gun jumps back (px). */
  cameraKick: number;
  shake: number;
  gunKick: number;

  /** How far enemies can hear this weapon, px. */
  noiseRadius: number;
  /** Multiplier on player movement speed while carrying it. */
  moveSpeedMul: number;

  tracerColor: number;
  casingColor: number;
  /** Integer scale of the muzzle flash sprite. */
  flashScale: number;
  sound: GunSound;
}

const BRASS = 0xd9a441;
const SHELL = 0xb3322b;
const STEEL = 0x9a9486;

export const WEAPONS: Record<string, WeaponDef> = {
  // --- Pistols -------------------------------------------------------------
  pm9: {
    id: 'pm9', name: 'PM-9 Makar', archetype: 'pistol', caliber: '9x18', sprite: 'gun_1',
    grip: { x: 24, y: 15 }, muzzle: { x: 41, y: 11 },
    damage: 24, pellets: 1, fireRate: 6.5, automatic: false, magSize: 9, reloadTime: 1.2, drawTime: 0.2,
    spread: 1.2, moveSpread: 2.5, bloomPerShot: 2.2, bloomMax: 7, bloomRecovery: 18,
    bulletSpeed: 900, range: 460, knockback: 70,
    cameraKick: 2.5, shake: 0.14, gunKick: 3,
    noiseRadius: 380, moveSpeedMul: 1,
    tracerColor: 0xffe6a0, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'pm9', thump: 150, crack: 5200, decay: 0.09, tail: 0.35, gain: 0.8 },
  },
  sp5: {
    id: 'sp5', name: 'SP-5 "Rzhavy"', archetype: 'pistol', caliber: '9x18', sprite: 'gun_6',
    grip: { x: 23, y: 17 }, muzzle: { x: 37, y: 12 },
    damage: 20, pellets: 1, fireRate: 4, automatic: false, magSize: 7, reloadTime: 1.7, drawTime: 0.3, jamChance: 0.04,
    spread: 3, moveSpread: 3, bloomPerShot: 2.5, bloomMax: 8, bloomRecovery: 12,
    bulletSpeed: 700, range: 440, knockback: 55,
    cameraKick: 2.8, shake: 0.15, gunKick: 3,
    noiseRadius: 380, moveSpeedMul: 1,
    tracerColor: 0xff9a60, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'sp5', thump: 140, crack: 4200, decay: 0.1, tail: 0.35, gain: 0.75 },
  },

  // --- SMGs ----------------------------------------------------------------
  kedr: {
    id: 'kedr', name: 'Kedr-9 Machine Pistol', archetype: 'smg', caliber: '9x18', sprite: 'gun_15',
    grip: { x: 25, y: 18 }, muzzle: { x: 46, y: 11 },
    damage: 13, pellets: 1, fireRate: 15, automatic: true, magSize: 20, reloadTime: 1.6, drawTime: 0.22,
    spread: 3.2, moveSpread: 1.5, bloomPerShot: 1.1, bloomMax: 10, bloomRecovery: 16,
    bulletSpeed: 820, range: 360, knockback: 35,
    cameraKick: 1.3, shake: 0.06, gunKick: 2,
    noiseRadius: 400, moveSpeedMul: 1,
    tracerColor: 0xffd890, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'kedr', thump: 145, crack: 4800, decay: 0.06, tail: 0.25, gain: 0.55 },
  },
  ppd41: {
    id: 'ppd41', name: 'PPD-41 Drum SMG', archetype: 'smg', caliber: '9x18', sprite: 'gun_11',
    grip: { x: 25, y: 17 }, muzzle: { x: 60, y: 11 },
    damage: 15, pellets: 1, fireRate: 13, automatic: true, magSize: 35, reloadTime: 2.1, drawTime: 0.3,
    spread: 2.5, moveSpread: 2, bloomPerShot: 0.9, bloomMax: 9, bloomRecovery: 14,
    bulletSpeed: 850, range: 420, knockback: 45,
    cameraKick: 1.6, shake: 0.08, gunKick: 2,
    noiseRadius: 420, moveSpeedMul: 0.97,
    tracerColor: 0xffd890, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'ppd41', thump: 130, crack: 4200, decay: 0.07, tail: 0.3, gain: 0.6 },
  },

  // --- Shotguns ------------------------------------------------------------
  obrez: {
    id: 'obrez', name: 'Obrez Sawn-off', archetype: 'shotgun', caliber: '12ga', sprite: 'gun_22',
    grip: { x: 22, y: 16 }, muzzle: { x: 46, y: 12 },
    damage: 12, pellets: 9, fireRate: 3.5, automatic: false, magSize: 2, reloadTime: 1.8, drawTime: 0.25, reloadStyle: 'break',
    spread: 10, moveSpread: 1.5, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 10,
    bulletSpeed: 700, range: 220, knockback: 70,
    cameraKick: 7.5, shake: 0.45, gunKick: 6,
    noiseRadius: 520, moveSpeedMul: 1,
    tracerColor: 0xffc070, casingColor: SHELL, flashScale: 2,
    sound: { sample: 'obrez', thump: 80, crack: 2400, decay: 0.22, tail: 0.75, gain: 1.15 },
  },
  toz12: {
    id: 'toz12', name: 'TOZ-12 Pump', archetype: 'shotgun', caliber: '12ga', sprite: 'gun_23',
    grip: { x: 23, y: 16 }, muzzle: { x: 62, y: 12 },
    damage: 12, pellets: 9, fireRate: 1.4, automatic: false, magSize: 6, reloadTime: 2.6, drawTime: 0.4, cycled: true, reloadPerRound: 0.42,
    spread: 7.5, moveSpread: 2, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 10,
    bulletSpeed: 760, range: 270, knockback: 60,
    cameraKick: 7, shake: 0.42, gunKick: 6,
    noiseRadius: 520, moveSpeedMul: 0.93,
    tracerColor: 0xffc070, casingColor: SHELL, flashScale: 2,
    sound: { sample: 'toz12', thump: 85, crack: 2600, decay: 0.2, tail: 0.7, gain: 1.1 },
  },

  // --- Rifles --------------------------------------------------------------
  skv: {
    id: 'skv', name: 'SKV Carbine', archetype: 'rifle', caliber: '545', sprite: 'gun_41',
    grip: { x: 22, y: 16 }, muzzle: { x: 61, y: 12 },
    damage: 36, pellets: 1, fireRate: 5, automatic: false, magSize: 10, reloadTime: 2.2, drawTime: 0.4,
    spread: 0.6, moveSpread: 4, bloomPerShot: 1.8, bloomMax: 6, bloomRecovery: 14,
    bulletSpeed: 1200, range: 700, knockback: 85,
    cameraKick: 3.6, shake: 0.18, gunKick: 3,
    noiseRadius: 560, moveSpeedMul: 0.93,
    tracerColor: 0xfff0b0, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'skv', thump: 100, crack: 3500, decay: 0.13, tail: 0.65, gain: 0.95 },
  },
  akr74: {
    id: 'akr74', name: 'AKR-74 Rifle', archetype: 'rifle', caliber: '545', sprite: 'gun_36',
    grip: { x: 20, y: 16 }, muzzle: { x: 60, y: 13 },
    damage: 31, pellets: 1, fireRate: 9.5, automatic: true, magSize: 30, reloadTime: 2.3, drawTime: 0.4,
    spread: 1.0, moveSpread: 4, bloomPerShot: 1.3, bloomMax: 8, bloomRecovery: 12,
    bulletSpeed: 1150, range: 680, knockback: 80,
    cameraKick: 3.2, shake: 0.17, gunKick: 3,
    noiseRadius: 560, moveSpeedMul: 0.92,
    tracerColor: 0xfff0b0, casingColor: BRASS, flashScale: 1,
    sound: { sample: 'akr74', thump: 105, crack: 3600, decay: 0.12, tail: 0.6, gain: 0.95 },
  },
  vektor: {
    id: 'vektor', name: 'Vektor-7 Bullpup', archetype: 'rifle', caliber: '545', sprite: 'gun_33',
    grip: { x: 30, y: 17 }, muzzle: { x: 62, y: 12 },
    damage: 33, pellets: 1, fireRate: 11.5, automatic: true, magSize: 30, reloadTime: 2.0, drawTime: 0.35,
    spread: 0.7, moveSpread: 3, bloomPerShot: 0.9, bloomMax: 6, bloomRecovery: 15,
    bulletSpeed: 1250, range: 720, knockback: 80,
    cameraKick: 2.6, shake: 0.13, gunKick: 2,
    noiseRadius: 540, moveSpeedMul: 0.95,
    tracerColor: 0xc8f0ff, casingColor: STEEL, flashScale: 1,
    sound: { sample: 'vektor', thump: 115, crack: 4100, decay: 0.1, tail: 0.55, gain: 0.9 },
  },

  // --- Marksman ------------------------------------------------------------
  mosin: {
    id: 'mosin', name: 'Mosin-K Bolt Rifle', archetype: 'marksman', caliber: '762', sprite: 'gun_48',
    grip: { x: 48, y: 17 }, muzzle: { x: 101, y: 11 },
    damage: 120, pellets: 1, fireRate: 0.9, automatic: false, magSize: 5, reloadTime: 3.2, drawTime: 0.6, cycled: true, reloadPerRound: 0.5,
    spread: 0.12, moveSpread: 8, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 6,
    bulletSpeed: 1900, range: 1150, knockback: 170,
    cameraKick: 9.5, shake: 0.5, gunKick: 7,
    noiseRadius: 720, moveSpeedMul: 0.88,
    tracerColor: 0xffffff, casingColor: BRASS, flashScale: 2,
    sound: { sample: 'mosin', thump: 68, crack: 2900, decay: 0.26, tail: 1.2, gain: 1.25 },
  },
  svk: {
    id: 'svk', name: 'SVK Marksman', archetype: 'marksman', caliber: '762', sprite: 'gun_49',
    grip: { x: 44, y: 18 }, muzzle: { x: 105, y: 13 },
    damage: 105, pellets: 1, fireRate: 1.6, automatic: false, magSize: 10, reloadTime: 2.8, drawTime: 0.6,
    spread: 0.15, moveSpread: 7, bloomPerShot: 4, bloomMax: 6, bloomRecovery: 6,
    bulletSpeed: 1900, range: 1100, knockback: 160,
    cameraKick: 9, shake: 0.5, gunKick: 7,
    noiseRadius: 700, moveSpeedMul: 0.85,
    tracerColor: 0xffffff, casingColor: BRASS, flashScale: 2,
    sound: { sample: 'svk', thump: 70, crack: 3000, decay: 0.24, tail: 1.1, gain: 1.2 },
  },
};

/** How this gun's reload is performed. */
export function reloadStyleOf(def: WeaponDef): ReloadStyle {
  if (def.reloadStyle) return def.reloadStyle;
  if (def.reloadPerRound) return def.archetype === 'shotgun' ? 'tube' : 'clip';
  return 'mag';
}

/** Loadout for the gunplay test range, in hotkey order. */
export const TEST_LOADOUT = ['pm9', 'ppd41', 'toz12', 'akr74', 'svk'];
