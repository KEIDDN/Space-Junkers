import { GUN_HEIGHT } from '../../engine/config';
import { ITEMS, type AmmoDef } from '../../data/items';
import { reloadStyleOf, type WeaponArchetype } from '../../data/weapons';
import type { GameContext } from '../context';
import type { ActorView } from '../entities/ActorView';
import { hasLineOfSight } from '../world/collision';
import type { Falloff, Faction } from './projectiles';
import type { WeaponState } from './weapon';

/**
 * Range falloff by weapon family. Pellets fade fast past a third of their reach, pistol and
 * SMG rounds tire past half; rifles and marksman rifles carry their damage all the way.
 */
export const FALLOFF: Partial<Record<WeaponArchetype | 'pellet', Falloff>> = {
  pellet: { from: 0.3, min: 0.3 },
  pistol: { from: 0.5, min: 0.65 },
  smg: { from: 0.45, min: 0.6 },
};

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
  /** Holding the aim steady tightens the cone. */
  spreadMul = 1,
  /** Who's shooting, for the after-action report. */
  source?: string,
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
  const cone = Math.max(0, weapon.spread(moveFactor) - def.bloomPerShot + extraSpreadDeg) * (ammo?.spreadMul ?? 1) * spreadMul * DEG;
  // A slug from a shotgun carries much further than buckshot and hits like a truck.
  const slug = pellets === 1 && def.pellets > 1;
  for (let i = 0; i < pellets; i++) {
    const a = aim + triangular() * cone;
    const speed = def.bulletSpeed * (pellets > 1 ? 0.88 + Math.random() * 0.24 : 1);
    ctx.projectiles.fire(sx, sy, a, {
      speed, range: slug ? def.range * 1.7 : def.range, damage, pen,
      knockback: def.knockback * (slug ? 2 : 1), faction, color: def.tracerColor, pellet: pellets > 1,
      falloff: pellets > 1 ? FALLOFF.pellet : FALLOFF[def.archetype], source,
    });
  }

  // The flash rides the muzzle through the recoil instead of hanging where the shot left.
  const follow = () => {
    const m = view.muzzleWorld(view.container.x, view.container.y);
    return { x: m.x, y: m.y, angle: view.muzzleAngle };
  };
  ctx.effects.muzzleFlash(muzzle.x, muzzle.y, aim, def.archetype, follow);
  ctx.lightFlash(muzzle.x, muzzle.y + GUN_HEIGHT * 0.5, def.flashScale > 1 ? 150 : 110, 0xffc27a, 0.8);
  // Smoke: shotguns and big rifles belch it; automatics build a haze; pistols a wisp.
  const heavy = def.archetype === 'shotgun' || def.archetype === 'marksman';
  if (heavy) ctx.effects.smoke(muzzle.x, muzzle.y, 3, aim, 55);
  else if (Math.random() < (def.automatic ? 0.45 : 0.6)) ctx.effects.smoke(muzzle.x, muzzle.y, 1, aim, 25);
  // Bolt and pump guns eject when worked; a break-action keeps its shells until opened.
  if (!def.cycled && reloadStyleOf(def) !== 'break') {
    const port = view.ejectWorld(x, y);
    ctx.effects.casing(port.x, port.y + GUN_HEIGHT, aim, def.casingColor, def.archetype === 'shotgun');
  }
  view.kick(def.gunKick);
  ctx.audio.gunshot(def.sound, x, y);
  ctx.emitNoise(x, y, def.noiseRadius, faction);
}

/** Triangular distribution in -1..1: most shots near the centre, some at the edge. */
function triangular(): number {
  return Math.random() - Math.random();
}
