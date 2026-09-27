import { hasAnim } from '../../engine/assets';
import type { Loadout } from '../../core/inventory';
import type { Operator } from '../../core/profile';

/**
 * What a character looks like: which character sheets to stack, bottom to top.
 * Equipment is drawn from its own sheet (`g_<item id>_<m|f>`), so putting on a helmet or
 * a pack changes the silhouette in every animation. Sheets are built by
 * tools/build_characters.py.
 */
export interface Wearing {
  helmet?: string | null;
  armor?: string | null;
  backpack?: string | null;
}

/** Headgear that covers the hair (nothing pokes out from under a steel helmet). */
const HIDES_HAIR = new Set(['respcap', 'k6helmet', 'zaslon']);

function gear(id: string | null | undefined, body: 'm' | 'f'): string | null {
  if (!id) return null;
  const set = `g_${id}_${body}`;
  return hasAnim(`c:${set}:hold:2`) ? set : null;
}

/** Layer order: body, armour, pack, hair, headgear. */
export function dress(base: string, body: 'm' | 'f', wearing: Wearing, hair?: string): string[] {
  const out = [base];
  const armor = gear(wearing.armor, body);
  const pack = gear(wearing.backpack, body);
  const helmet = gear(wearing.helmet, body);
  if (armor) out.push(armor);
  if (pack) out.push(pack);
  if (hair && !(wearing.helmet && HIDES_HAIR.has(wearing.helmet))) out.push(hair);
  if (helmet) out.push(helmet);
  return out;
}

export function operatorLook(op: Operator, loadout: Pick<Loadout, 'helmet' | 'armor' | 'backpack'>): string[] {
  return dress(`op_${op}`, op, {
    helmet: loadout.helmet?.id,
    armor: loadout.armor?.id,
    backpack: loadout.backpack?.id,
  }, `hair_op_${op}`);
}

/** Enemy faction clothing looks (two per faction) and the body each is drawn on. */
const ENEMY_LOOKS: Record<string, { base: string; body: 'm' | 'f' }[]> = {
  scav: [{ base: 'en_scav_a', body: 'm' }, { base: 'en_scav_b', body: 'f' }],
  raider: [{ base: 'en_raider_a', body: 'm' }, { base: 'en_raider_b', body: 'f' }],
  soldier: [{ base: 'en_soldier_a', body: 'm' }, { base: 'en_soldier_b', body: 'm' }],
  security: [{ base: 'en_security_a', body: 'm' }, { base: 'en_security_b', body: 'f' }],
};

export function enemyLook(faction: string, variant: number, wearing: Wearing): string[] {
  const looks = ENEMY_LOOKS[faction] ?? ENEMY_LOOKS.scav;
  const l = looks[variant % looks.length];
  return dress(l.base, l.body, wearing, `${l.base}_h`);
}

export function crewLook(sprite: string): string[] {
  return [`crew_${sprite}`];
}
