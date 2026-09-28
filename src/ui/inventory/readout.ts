import { itemDef } from '../../data/items';
import { WEAPONS } from '../../data/weapons';
import { footprint, type ItemInstance } from '../../core/inventory';

/**
 * What an item tile says, and in what order of importance. One strict rule:
 *
 *   the COUNT (bottom-right, "×N") is always how many units you own, and only that.
 *
 * Everything else a number could mean (rounds in a magazine, armour left, keycard uses,
 * how much a kit heals) is CONDITION or EFFECT: drawn differently on the tile (a fraction,
 * a bar, pips) or kept for the tooltip and the action menu. A medkit that heals 60 reads
 * "×2" on its tile and "HEALS 60 HP" when you look at it, never "60".
 */

/** The unit count, for anything that stacks. Null for things that don't. */
export function itemCount(item: ItemInstance): string | null {
  return itemDef(item.id).stack > 1 ? `×${item.qty}` : null;
}

export interface Condition {
  /** A fraction ("12/30") or pips ("▮▮▯"); never a bare number. */
  text?: string;
  /** 0..1 for a thin bar along the bottom edge. */
  frac?: number;
  tone?: 'bad' | 'warn';
}

/** State of a single, non-stacking thing: magazine, durability, uses, how full a bag is. */
export function itemCondition(item: ItemInstance): Condition | null {
  const d = itemDef(item.id);
  switch (d.kind) {
    case 'weapon': {
      const mag = WEAPONS[d.weapon].magSize;
      const n = item.loaded ?? 0;
      return { text: `${n}/${mag}`, tone: n === 0 ? 'bad' : undefined };
    }
    case 'armor':
    case 'helmet': {
      const frac = Math.max(0, Math.min(1, (item.dur ?? d.durability) / d.durability));
      return { frac, tone: frac === 0 ? 'bad' : frac < 0.35 ? 'warn' : undefined };
    }
    case 'key': {
      const left = Math.max(0, Math.min(d.uses, item.dur ?? d.uses));
      return { text: '▮'.repeat(left) + '▯'.repeat(d.uses - left), tone: left <= 1 ? 'warn' : undefined };
    }
    case 'backpack': {
      const g = item.contents;
      if (!g?.items.length) return null;
      let used = 0;
      for (const p of g.items) {
        const f = footprint(p.item, p.rot);
        used += f.w * f.h;
      }
      return { frac: Math.min(1, used / (g.w * g.h)) };
    }
    default:
      return null;
  }
}

/** What one unit of a consumable does, in a few words (menus, tooltips, quick-use). */
export function effectText(id: string): string | null {
  const d = itemDef(id);
  if (d.kind === 'grenade') return d.effect === 'frag' ? 'FRAG · THROW' : 'SMOKE · THROW';
  if (d.kind !== 'med') return null;
  const parts: string[] = [];
  if (d.heal) parts.push(`HEALS ${d.heal} HP`);
  if (d.regen) parts.push(`+${d.regen.hp} HP OVER ${d.regen.seconds}s`);
  if (d.stopsBleed) parts.push('STOPS BLEEDING');
  if (d.boost) parts.push(`+${Math.round((d.boost.speedMul - 1) * 100)}% SPEED`);
  return parts.join(' · ') || null;
}
