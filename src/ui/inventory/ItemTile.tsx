import { memo, type CSSProperties } from 'react';
import { RARITY_COLOR, itemDef } from '../../data/items';
import { WEAPONS } from '../../data/weapons';
import { footprint, type ItemInstance } from '../../core/inventory';
import { AtlasSprite } from '../AtlasSprite';
import { CELL } from './ops';

/** Small corner readout: stack count, magazine, durability, uses. */
export function itemBadge(item: ItemInstance): { text: string; tone?: 'bad' | 'warn' } | null {
  const d = itemDef(item.id);
  switch (d.kind) {
    case 'ammo':
      return { text: String(item.qty) };
    case 'weapon': {
      const mag = WEAPONS[d.weapon].magSize;
      const n = item.loaded ?? 0;
      return { text: `${n}/${mag}`, tone: n === 0 ? 'bad' : undefined };
    }
    case 'armor':
    case 'helmet': {
      const dur = Math.round(item.dur ?? d.durability);
      return { text: `${dur}/${d.durability}`, tone: dur === 0 ? 'bad' : dur < d.durability * 0.35 ? 'warn' : undefined };
    }
    case 'med':
      return d.pooled ? { text: String(Math.round(item.dur ?? d.heal)) } : null;
    case 'key':
      return { text: `${item.dur ?? d.uses}×` };
    case 'backpack':
      return item.contents?.items.length ? { text: `${item.contents.items.length}▪` } : null;
    default:
      return item.qty > 1 ? { text: String(item.qty) } : null;
  }
}

interface Props {
  item: ItemInstance;
  rot: boolean;
  /** Override the footprint (equipment slots draw items at slot size). */
  box?: { w: number; h: number };
  style?: CSSProperties;
  dim?: boolean;
  className?: string;
}

/** The look of one item in any container: rarity-tinted plate, icon, name, readout. */
export const ItemTile = memo(function ItemTile({ item, rot, box, style, dim, className }: Props) {
  const d = itemDef(item.id);
  const f = footprint(item, rot);
  const w = box?.w ?? f.w * CELL;
  const h = box?.h ?? f.h * CELL;
  const color = RARITY_COLOR[d.rarity];
  const badge = itemBadge(item);
  // Icons keep their painted orientation unless the item itself is rotated in the grid.
  const iconRot = rot && !box;
  return (
    <div
      className={`item-tile rarity-${d.rarity} ${dim ? 'dim-tile' : ''} ${className ?? ''}`}
      style={{ width: w, height: h, ['--rarity' as string]: color, ...style }}
    >
      <div className="item-icon">
        <AtlasSprite name={d.icon} fit={{ w: w - 8, h: h - (h > CELL ? 14 : 10) }} rotate={iconRot} />
      </div>
      <span className="item-short">{d.short}</span>
      {badge && <span className={`item-badge ${badge.tone ?? ''}`}>{badge.text}</span>}
      {item.crew && <span className="item-crew">CREW</span>}
    </div>
  );
});
