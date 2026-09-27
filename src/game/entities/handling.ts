import { GUN_HEIGHT } from '../../engine/config';
import { reloadStyleOf, type WeaponDef } from '../../data/weapons';
import type { WeaponState } from '../combat/weapon';
import type { GameContext } from '../context';
import type { ActorView, HandAction } from './ActorView';

/**
 * Glue between weapon state and body animation, shared by the player and enemies:
 * what the hands are doing, and what the world hears and sees when they do it.
 */

/** The hand action a weapon's state implies (reload, unjam, draw), or null. */
export function weaponAction(w: WeaponState | null): HandAction | null {
  if (!w) return null;
  if (w.unjamming) return { kind: 'unjam', t: w.unjamProgress };
  if (w.reloading) {
    const style = reloadStyleOf(w.def);
    // Round-by-round loading holds one pose; each round is a pulse.
    const t = style === 'tube' || style === 'clip' ? 0.5 : w.reloadProgress;
    return { kind: 'reload', t, style, tactical: w.tactical };
  }
  if (w.drawing) return { kind: 'draw', t: w.drawProgress };
  return null;
}

/** Sounds and effects for the key moments the body animation reached this frame. */
export function playAnimEvents(ctx: GameContext, view: ActorView, x: number, y: number, aim: number, def: WeaponDef | null, own = false): void {
  // Your own hands you also feel: the magazine seating, the action slamming home.
  const feel = own ? ctx.haptics : undefined;
  for (const e of view.events) {
    switch (e) {
      case 'magout': {
        ctx.audio.sfx('magout', x, y);
        const p = view.ejectWorld(x, y);
        // The empty (or half-empty) magazine falls out of the gun and clatters on the floor.
        if (def) ctx.effects.dropMag(p.x, p.y + GUN_HEIGHT, aim, def.archetype === 'rifle' || def.archetype === 'marksman' ? 4 : 3);
        break;
      }
      case 'magin':
        ctx.audio.sfx('magin', x, y);
        feel?.pulse(0.1, 0.35, 50);
        break;
      case 'rack':
        ctx.audio.sfx('rack', x, y);
        feel?.pulse(0.3, 0.25, 70);
        break;
      case 'breakopen': {
        ctx.audio.sfx('breakopen', x, y);
        const p = view.ejectWorld(x, y);
        // Two spent shells tumble out of the breech.
        if (def) for (let i = 0; i < 2; i++) ctx.effects.casing(p.x, p.y + GUN_HEIGHT, aim + Math.PI, def.casingColor, true, 0.4);
        break;
      }
      case 'breakclose':
        ctx.audio.sfx('breakclose', x, y);
        feel?.pulse(0.35, 0.3, 70);
        break;
      default:
        break;
    }
  }
}
