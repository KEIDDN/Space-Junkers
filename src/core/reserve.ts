import { ITEMS, itemDef, type AmmoDef, type WeaponItemDef } from '../data/items';
import { WEAPONS } from '../data/weapons';
import {
  addToGrid, createItem, gridItems, loadoutAdd, loadoutItems, removeUid,
  type Grid, type ItemInstance, type Loadout,
} from './inventory';

/**
 * The ship's reserve. Whatever happens down there, the Lastochka keeps a rusty sidearm,
 * a box of rounds, a canvas sack and a dressing in the locker, so the operator can always
 * go back out. It looks at what the operator actually carries: come back aboard with no gun
 * that can fire, or no pack, and the gap is filled on you, not somewhere in the stash.
 * It never replaces anything. Crew issue already in the locker is handed back before
 * anything new is issued, and crew issue is worth nothing to traders, so the reserve can't
 * be farmed or pile up.
 */
export const RESERVE_GUN = 'sp5';
export const RESERVE_PACK = 'sack';
const RESERVE_ROUNDS = 28;
const RESERVE_AMMO = 'ammo_9x18';

/** Everything the operator owns: what they carry and what is in the stash, bags opened. */
function everything(loadout: Loadout, stash: Grid): ItemInstance[] {
  const out = [...loadoutItems(loadout)];
  for (const it of gridItems(stash)) {
    out.push(it);
    if (it.contents) out.push(...gridItems(it.contents));
  }
  return out;
}

function calibresOf(items: ItemInstance[]): Set<string> {
  return new Set(items.filter((i) => itemDef(i.id).kind === 'ammo').map((i) => (itemDef(i.id) as AmmoDef).caliber));
}

function canFire(it: ItemInstance | null | undefined, calibres: Set<string>): boolean {
  if (!it) return false;
  const d = itemDef(it.id);
  if (d.kind !== 'weapon') return false;
  return (it.loaded ?? 0) > 0 || calibres.has(WEAPONS[(d as WeaponItemDef).weapon].caliber);
}

/** A gun that can fire: loaded, or with rounds of its calibre somewhere aboard. */
export function hasUsableGun(loadout: Loadout, stash: Grid): boolean {
  const all = everything(loadout, stash);
  const calibres = calibresOf(all);
  return all.some((i) => canFire(i, calibres));
}

/** Is the operator going out armed: a gun on them, with rounds for it on them or aboard? */
export function armed(loadout: Loadout, stash: Grid): boolean {
  const calibres = calibresOf(everything(loadout, stash));
  return loadoutItems(loadout).some((i) => canFire(i, calibres));
}

export function hasPack(loadout: Loadout, stash: Grid): boolean {
  return everything(loadout, stash).some((i) => itemDef(i.id).kind === 'backpack');
}
/** Where an issued item ended up, so the operator can be told exactly where to find it. */
export type IssuedWhere = 'primary' | 'secondary' | 'backpack' | 'carried' | 'stash';

export interface Issued {
  id: string;
  qty: number;
  where: IssuedWhere;
}

export interface Issue {
  loadout: Loadout;
  stash: Grid;
  /** What was handed out (item ids), empty when nothing was needed. */
  issued: string[];
  /** Every item handed out (rounds and bandage included) and where it went. */
  items: Issued[];
}

/**
 * Fill the gaps from the reserve: a sidearm with rounds if nothing on the operator can
 * shoot, a sack if they have no pack, and a field dressing with either when they carry no
 * medical kit.
 */
export function issueReserve(loadout: Loadout, stash: Grid): Issue {
  const issued: string[] = [];
  const items: Issued[] = [];
  /** A crew-issue item of this kind from the locker, or a fresh one. */
  const fetch = (id: string, make: () => ItemInstance): ItemInstance => {
    const old = gridItems(stash).find((i) => i.id === id && i.crew);
    if (!old) return make();
    stash = removeUid(stash, old.uid);
    return old;
  };
  const put = (item: ItemInstance, slot?: 'secondary' | 'primary' | 'backpack') => {
    if (slot && !loadout[slot]) {
      loadout = { ...loadout, [slot]: item };
      items.push({ id: item.id, qty: item.qty, where: slot });
      return;
    }
    const r = loadoutAdd(loadout, item);
    loadout = r.loadout;
    if (r.rest) stash = addToGrid(stash, r.rest).grid;
    items.push({ id: item.id, qty: item.qty, where: r.rest ? 'stash' : 'carried' });
  };
  if (!loadout.backpack) {
    put(fetch(RESERVE_PACK, () => createItem(RESERVE_PACK, { crew: true })), 'backpack');
    issued.push(RESERVE_PACK);
  }
  if (!armed(loadout, stash)) {
    const mag = WEAPONS[(ITEMS[RESERVE_GUN] as WeaponItemDef).weapon].magSize;
    const gun = fetch(RESERVE_GUN, () => createItem(RESERVE_GUN, { loaded: mag, crew: true }));
    put({ ...gun, loaded: Math.max(gun.loaded ?? 0, mag) }, !loadout.secondary ? 'secondary' : 'primary');
    if (!loadoutItems(loadout).some((i) => i.id === RESERVE_AMMO)) {
      put(fetch(RESERVE_AMMO, () => createItem(RESERVE_AMMO, { qty: RESERVE_ROUNDS, crew: true })));
    }
    issued.push(RESERVE_GUN);
  }
  if (issued.length && !loadoutItems(loadout).some((i) => itemDef(i.id).kind === 'med')) {
    put(fetch('bandage', () => createItem('bandage', { crew: true })));
    if (!loadout.quick.includes('bandage')) loadout = { ...loadout, quick: ['bandage', ...loadout.quick.slice(1)] };
  }
  return { loadout, stash, issued, items };
}
