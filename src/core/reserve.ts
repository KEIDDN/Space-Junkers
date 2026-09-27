import { ITEMS, itemDef, type AmmoDef, type WeaponItemDef } from '../data/items';
import { WEAPONS } from '../data/weapons';
import { addToGrid, createItem, gridItems, loadoutAdd, loadoutItems, type Grid, type ItemInstance, type Loadout } from './inventory';

/**
 * The ship's reserve. Whatever happens down there, the Lastochka keeps a rusty sidearm,
 * a box of rounds and a canvas sack in the locker, so the operator can always go back
 * out. It never replaces anything: it only fills what is missing. Crew issue is worth
 * nothing to traders, so the reserve can't be farmed.
 */
export const RESERVE_GUN = 'sp5';
export const RESERVE_PACK = 'sack';
const RESERVE_ROUNDS = 28;

/** Everything the operator owns: what they carry and what is in the stash, bags opened. */
function everything(loadout: Loadout, stash: Grid): ItemInstance[] {
  const out = [...loadoutItems(loadout)];
  for (const it of gridItems(stash)) {
    out.push(it);
    if (it.contents) out.push(...gridItems(it.contents));
  }
  return out;
}

/** A gun that can fire: loaded, or with rounds of its calibre somewhere aboard. */
export function hasUsableGun(loadout: Loadout, stash: Grid): boolean {
  const all = everything(loadout, stash);
  const calibres = new Set(all.filter((i) => itemDef(i.id).kind === 'ammo').map((i) => (itemDef(i.id) as AmmoDef).caliber));
  return all.some((i) => {
    const d = itemDef(i.id);
    if (d.kind !== 'weapon') return false;
    return (i.loaded ?? 0) > 0 || calibres.has(WEAPONS[(d as WeaponItemDef).weapon].caliber);
  });
}

export function hasPack(loadout: Loadout, stash: Grid): boolean {
  return everything(loadout, stash).some((i) => itemDef(i.id).kind === 'backpack');
}

export interface Issue {
  loadout: Loadout;
  stash: Grid;
  /** What was handed out (item ids), empty when nothing was needed. */
  issued: string[];
}

/** Fill the gaps from the reserve: a sidearm with rounds if nothing can shoot, a sack if there's no pack. */
export function issueReserve(loadout: Loadout, stash: Grid): Issue {
  const issued: string[] = [];
  const put = (item: ItemInstance, slot?: 'secondary' | 'primary' | 'backpack') => {
    if (slot && !loadout[slot]) {
      loadout = { ...loadout, [slot]: item };
      return;
    }
    const r = loadoutAdd(loadout, item);
    loadout = r.loadout;
    if (r.rest) stash = addToGrid(stash, r.rest).grid;
  };
  if (!hasPack(loadout, stash)) {
    put(createItem(RESERVE_PACK, { crew: true }), 'backpack');
    issued.push(RESERVE_PACK);
  }
  if (!hasUsableGun(loadout, stash)) {
    const mag = WEAPONS[(ITEMS[RESERVE_GUN] as WeaponItemDef).weapon].magSize;
    put(createItem(RESERVE_GUN, { loaded: mag, crew: true }), loadout.secondary ? 'primary' : 'secondary');
    put(createItem('ammo_9x18', { qty: RESERVE_ROUNDS, crew: true }));
    issued.push(RESERVE_GUN);
    if (!everything(loadout, stash).some((i) => i.id === 'bandage')) {
      put(createItem('bandage', { crew: true }));
      if (!loadout.quick.includes('bandage')) loadout = { ...loadout, quick: ['bandage', ...loadout.quick.slice(1)] };
    }
  }
  return { loadout, stash, issued };
}
