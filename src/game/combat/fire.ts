import { GUN_HEIGHT } from '../../engine/config';
import { ITEMS, type AmmoDef } from '../../data/items';
import type { GameContext } from '../context';
import type { ActorView } from '../entities/ActorView';
import { hasLineOfSight } from '../world/collision';
import type { Faction } from './projectiles';
import type { WeaponState } from './weapon';

const DEG = Math.PI / 180;

/**
 * Everything that happens when a gun goes off (projectiles, flash, smoke, casing,
 * sound, noise). Shared by the player and enemies so both follow the same rules.
 */
export function discharge(
  ctx: GameContext,
  view: ActorView,
  weapon: WeaponState,
  x: number, y: number,
  aim: number,
  faction: Faction,
  moveFactor: number,
  extraSpreadDeg = 0,
): void {
  const def = weapon.def;
  const muzzle = view.muzzleWorld(x, y);
  // Bullets live in the ground plane; start under the muzzle unless a wall is in between.
  let sx = muzzle.x;
  let sy = muzzle.y + GUN_HEIGHT;
  if (!hasLineOfSight(ctx.map, x, y, sx, sy)) {
    sx = x;
    sy = y;
  }

  // The loaded round shapes the shot: damage, penetration, and slugs vs buckshot.
  const ammo = weapon.ammoId ? (ITEMS[weapon.ammoId] as AmmoDef | undefined) : undefined;
  const pellets = ammo?.pellets ?? def.pellets;
  const damage = def.damage * (ammo?.damageMul ?? 1);
  const pen = ammo?.pen ?? 2;
  // Spread is sampled per pellet; bloom was already added by tryFire, so undo one step
  // for the first shot to keep the first bullet accurate.
  const cone = Math.max(0, weapon.spread(moveFactor) - def.bloomPerShot + extraSpreadDeg) * (ammo?.spreadMul ?? 1) * DEG;
  // A slug from a shotgun carries much further than buckshot and hits like a truck.
  const slug = pellets === 1 && def.pellets > 1;
  for (let i = 0; i < pellets; i++) {
    const a = aim + triangular() * cone;
    const speed = def.bulletSpeed * (pellets > 1 ? 0.88 + Math.random() * 0.24 : 1);
    ctx.projectiles.fire(sx, sy, a, {
      speed, range: slug ? def.range * 1.7 : def.range, damage, pen,
      knockback: def.knockback * (slug ? 2 : 1), faction, color: def.tracerColor,
    });
  }

  ctx.effects.muzzleFlash(muzzle.x, muzzle.y, aim, def.flashScale);
  ctx.lightFlash(muzzle.x, muzzle.y + GUN_HEIGHT * 0.5, def.flashScale > 1 ? 150 : 110, 0xffc27a, 0.8);
  if (def.pellets > 1 || def.archetype === 'marksman') ctx.effects.smoke(muzzle.x, muzzle.y, 2);
  else if (Math.random() < 0.3) ctx.effects.smoke(muzzle.x, muzzle.y, 1);
  ctx.effects.casing(x, y, aim, def.casingColor, def.archetype === 'shotgun');
  view.kick(def.gunKick);
  ctx.audio.gunshot(def.sound, x, y);
  ctx.emitNoise(x, y, def.noiseRadius);
}

/** Triangular distribution in -1..1: most shots near the centre, some at the edge. */
function triangular(): number {
  return Math.random() - Math.random();
}
