import { memo, type CSSProperties } from 'react';
import { RARITY_COLOR, itemDef } from '../../data/items';
import { footprint, type ItemInstance } from '../../core/inventory';
import { itemCondition, itemCount } from './readout';
import { AtlasSprite } from '../AtlasSprite';
import { CELL } from './ops';

interface Props {
  item: ItemInstance;
  rot: boolean;
  /** Override the footprint (equipment slots draw items at slot size). */
  box?: { w: number; h: number };
  style?: CSSProperties;
  dim?: boolean;
  className?: string;
}

/**
 * The look of one item in any container: rarity-tinted plate, icon, name, and bottom-right
 * either its unit count (×N, stacks) or its condition (fraction, pips, bar). See readout.ts.
 */
export const ItemTile = memo(function ItemTile({ item, rot, box, style, dim, className }: Props) {
  const d = itemDef(item.id);
  const f = footprint(item, rot);
  const w = box?.w ?? f.w * CELL;
  const h = box?.h ?? f.h * CELL;
  const color = RARITY_COLOR[d.rarity];
  const count = itemCount(item);
  const cond = itemCondition(item);
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
      {count && <span className="item-badge item-count">{count}</span>}
      {cond?.text && <span className={`item-badge item-cond ${cond.tone ?? ''}`}>{cond.text}</span>}
      {cond?.frac !== undefined && (
        <span className="item-condbar"><span className={cond.tone ?? ''} style={{ width: `${Math.round(cond.frac * 100)}%` }} /></span>
      )}
      {item.crew && <span className="item-crew">CREW</span>}
    </div>
  );
});
