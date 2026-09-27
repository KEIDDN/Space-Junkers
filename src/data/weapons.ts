import type { GunSound } from '../engine/audio';

export type WeaponArchetype = 'pistol' | 'smg' | 'shotgun' | 'rifle' | 'marksman';

export interface WeaponDef {
  id: string;
  name: string;
  archetype: WeaponArchetype;
  /** Atlas frame (original art from Assets/Guns/Guns). */
  sprite: string;
  /** Hand position and muzzle tip, in the sprite's own pixel coords. */
  grip: { x: number; y: number };
  muzzle: { x: number; y: number };

  damage: number;
  /** Projectiles per trigger pull (shotguns > 1). */
  pellets: number;
  /** Shots per second. */
  fireRate: number;
  automatic: boolean;
  magSize: number;
  /** Seconds. */
  reloadTime: number;
  /** Seconds to raise the weapon after switching. */
  drawTime: number;

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

export const WEAPONS: Record<string, WeaponDef> = {
  pm9: {
    id: 'pm9', name: 'PM-9 Pistol', archetype: 'pistol', sprite: 'gun_1',
    grip: { x: 24, y: 15 }, muzzle: { x: 41, y: 11 },
    damage: 24, pellets: 1, fireRate: 6.5, automatic: false, magSize: 9, reloadTime: 1.2, drawTime: 0.2,
    spread: 1.2, moveSpread: 2.5, bloomPerShot: 2.2, bloomMax: 7, bloomRecovery: 18,
    bulletSpeed: 900, range: 460, knockback: 70,
    cameraKick: 2.5, shake: 0.14, gunKick: 3,
    noiseRadius: 380, moveSpeedMul: 1,
    tracerColor: 0xffe6a0, casingColor: BRASS, flashScale: 1,
    sound: { thump: 150, crack: 5200, decay: 0.09, tail: 0.35, gain: 0.8 },
  },
  ppd41: {
    id: 'ppd41', name: 'PPD-41 Drum SMG', archetype: 'smg', sprite: 'gun_11',
    grip: { x: 25, y: 17 }, muzzle: { x: 60, y: 11 },
    damage: 15, pellets: 1, fireRate: 13, automatic: true, magSize: 35, reloadTime: 2.1, drawTime: 0.3,
    spread: 2.5, moveSpread: 2, bloomPerShot: 0.9, bloomMax: 9, bloomRecovery: 14,
    bulletSpeed: 850, range: 420, knockback: 45,
    cameraKick: 1.6, shake: 0.08, gunKick: 2,
    noiseRadius: 420, moveSpeedMul: 0.97,
    tracerColor: 0xffd890, casingColor: BRASS, flashScale: 1,
    sound: { thump: 130, crack: 4200, decay: 0.07, tail: 0.3, gain: 0.6 },
  },
  toz12: {
    id: 'toz12', name: 'TOZ-12 Pump', archetype: 'shotgun', sprite: 'gun_23',
    grip: { x: 23, y: 16 }, muzzle: { x: 62, y: 12 },
    damage: 12, pellets: 9, fireRate: 1.4, automatic: false, magSize: 6, reloadTime: 2.6, drawTime: 0.4,
    spread: 7.5, moveSpread: 2, bloomPerShot: 0, bloomMax: 0, bloomRecovery: 10,
    bulletSpeed: 760, range: 270, knockback: 60,
    cameraKick: 7, shake: 0.42, gunKick: 6,
    noiseRadius: 520, moveSpeedMul: 0.93,
    tracerColor: 0xffc070, casingColor: SHELL, flashScale: 2,
    sound: { thump: 85, crack: 2600, decay: 0.2, tail: 0.7, gain: 1.1 },
  },
  akr74: {
    id: 'akr74', name: 'AKR-74 Rifle', archetype: 'rifle', sprite: 'gun_36',
    grip: { x: 20, y: 16 }, muzzle: { x: 60, y: 13 },
    damage: 31, pellets: 1, fireRate: 9.5, automatic: true, magSize: 30, reloadTime: 2.3, drawTime: 0.4,
    spread: 1.0, moveSpread: 4, bloomPerShot: 1.3, bloomMax: 8, bloomRecovery: 12,
    bulletSpeed: 1150, range: 680, knockback: 80,
    cameraKick: 3.2, shake: 0.17, gunKick: 3,
    noiseRadius: 560, moveSpeedMul: 0.92,
    tracerColor: 0xfff0b0, casingColor: BRASS, flashScale: 1,
    sound: { thump: 105, crack: 3600, decay: 0.12, tail: 0.6, gain: 0.95 },
  },
  svk: {
    id: 'svk', name: 'SVK Marksman', archetype: 'marksman', sprite: 'gun_49',
    grip: { x: 44, y: 18 }, muzzle: { x: 105, y: 13 },
    damage: 110, pellets: 1, fireRate: 1.1, automatic: false, magSize: 5, reloadTime: 2.8, drawTime: 0.6,
    spread: 0.15, moveSpread: 7, bloomPerShot: 4, bloomMax: 6, bloomRecovery: 6,
    bulletSpeed: 1900, range: 1100, knockback: 160,
    cameraKick: 9, shake: 0.5, gunKick: 7,
    noiseRadius: 700, moveSpeedMul: 0.85,
    tracerColor: 0xffffff, casingColor: BRASS, flashScale: 2,
    sound: { thump: 70, crack: 3000, decay: 0.24, tail: 1.1, gain: 1.2 },
  },

  // Enemy weapons
  scav_revolver: {
    id: 'scav_revolver', name: 'Rusted Pistol', archetype: 'pistol', sprite: 'gun_6',
    grip: { x: 23, y: 17 }, muzzle: { x: 37, y: 12 },
    damage: 13, pellets: 1, fireRate: 3, automatic: false, magSize: 7, reloadTime: 1.9, drawTime: 0.3,
    spread: 3.5, moveSpread: 3, bloomPerShot: 2, bloomMax: 8, bloomRecovery: 10,
    bulletSpeed: 620, range: 460, knockback: 40,
    cameraKick: 0, shake: 0, gunKick: 2,
    noiseRadius: 380, moveSpeedMul: 1,
    tracerColor: 0xff9a60, casingColor: BRASS, flashScale: 1,
    sound: { thump: 140, crack: 4200, decay: 0.1, tail: 0.35, gain: 0.75 },
  },
};

/** Loadout for the Phase 1 test range, in hotkey order. */
export const TEST_LOADOUT = ['pm9', 'ppd41', 'toz12', 'akr74', 'svk'];
