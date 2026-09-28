import { itemDef } from '../../data/items';
import { footprint, type EquipSlot, type Grid } from '../../core/inventory';
import type { GridKey } from '../../core/transfer';
import { AtlasSprite } from '../AtlasSprite';
import { useItemPointer } from './drag';
import { useDrag } from './dragStore';
import { ItemTile } from './ItemTile';
import { CELL, useOps } from './ops';
import { ByDevice } from '../Glyph';

/** D-pad direction for each quick slot (matches the controller binding). */
export const QUICK_PAD = ['←', '↑', '→', '↓'];

function Hover({ gridKey }: { gridKey: GridKey }) {
  const target = useDrag((s) => s.target);
  const drag = useDrag((s) => s.drag);
  const ok = useDrag((s) => s.ok);
  if (!drag || !target || target.kind !== 'grid' || target.key !== gridKey) return null;
  const f = footprint(drag.item, drag.rot);
  return (
    <div
      className={`grid-hover ${ok ? 'ok' : 'bad'}`}
      style={{ left: target.x * CELL, top: target.y * CELL, width: f.w * CELL, height: f.h * CELL }}
    />
  );
}

/** One inventory grid: cells, items, and drop highlighting. */
export function GridView({ grid, gridKey }: { grid: Grid; gridKey: GridKey }) {
  const ops = useOps();
  const onPointer = useItemPointer(ops);
  const dragUid = useDrag((s) => s.drag?.uid);
  const itemTarget = useDrag((s) => (s.target?.kind === 'item' ? s.target.uid : null));
  return (
    <div
      className="inv-grid"
      data-grid={gridKey}
      style={{ width: grid.w * CELL, height: grid.h * CELL }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {grid.items.map((p) => {
        const f = footprint(p.item, p.rot);
        return (
          <div
            key={p.item.uid}
            data-item={p.item.uid}
            data-rot={p.rot ? 1 : 0}
            className={`inv-item ${itemTarget === p.item.uid ? 'load-target' : ''}`}
            style={{ left: p.x * CELL, top: p.y * CELL, width: f.w * CELL, height: f.h * CELL }}
            onPointerDown={(e) => onPointer(e, p.item, p.rot)}
            onDoubleClick={() => ops.activate(p.item.uid)}
            onPointerEnter={(e) => useDrag.setState({ hover: { item: p.item, x: e.clientX, y: e.clientY } })}
            onPointerMove={(e) => !useDrag.getState().drag && useDrag.setState({ hover: { item: p.item, x: e.clientX, y: e.clientY } })}
            onPointerLeave={() => useDrag.setState({ hover: null })}
          >
            <ItemTile item={p.item} rot={p.rot} dim={dragUid === p.item.uid} />
          </div>
        );
      })}
      <Hover gridKey={gridKey} />
    </div>
  );
}

const SLOT_LABEL: Record<EquipSlot, string> = {
  primary: 'PRIMARY', secondary: 'HOLSTER', helmet: 'HEAD', armor: 'BODY ARMOR', backpack: 'BACKPACK',
};

/** An equipment slot. */
export function SlotView({ slot, w, h }: { slot: EquipSlot; w: number; h: number }) {
  const ops = useOps();
  const onPointer = useItemPointer(ops);
  const item = ops.ws.loadout[slot];
  const dragging = useDrag((s) => !!s.drag && s.drag.uid === item?.uid);
  const isTarget = useDrag((s) => (s.target?.kind === 'slot' && s.target.slot === slot) || (s.target?.kind === 'item' && s.target.uid === item?.uid));
  const ok = useDrag((s) => s.ok);
  return (
    <div className="inv-slot-wrap">
      <div className="inv-slot-label">{SLOT_LABEL[slot]}</div>
      <div
        className={`inv-slot ${isTarget ? (ok ? 'ok' : 'bad') : ''} ${item ? 'filled' : ''}`}
        data-slot={slot}
        style={{ width: w, height: h }}
        onContextMenu={(e) => e.preventDefault()}
      >
        {item ? (
          <div
            data-item={item.uid}
            className="inv-item slotted"
            onPointerDown={(e) => onPointer(e, item, false)}
            onDoubleClick={() => ops.activate(item.uid)}
            onPointerEnter={(e) => useDrag.setState({ hover: { item, x: e.clientX, y: e.clientY } })}
            onPointerLeave={() => useDrag.setState({ hover: null })}
          >
            <ItemTile item={item} rot={false} box={{ w, h }} dim={dragging} />
          </div>
        ) : (
          <span className="inv-slot-empty">EMPTY</span>
        )}
      </div>
    </div>
  );
}

/**
 * Quick-use bindings (keys 3-6). Each shows the type it points at and how many of it you
 * carry: the count is of the real stacks in pockets and pack, not of anything held here.
 */
export function QuickBar({ counts }: { counts: (id: string) => number }) {
  const ops = useOps();
  const quick = ops.ws.loadout.quick;
  const target = useDrag((s) => (s.target?.kind === 'quick' ? s.target.slot : -1));
  const ok = useDrag((s) => s.ok);
  return (
    <div className="quickbar">
      {quick.map((id, i) => (
        <div
          key={i}
          data-quick={i}
          data-nav={id ? '' : undefined}
          className={`quick-slot ${target === i ? (ok ? 'ok' : 'bad') : ''}`}
          onContextMenu={(e) => {
            e.preventDefault();
            ops.bindQuick(i, null);
          }}
          title={id ? `${itemDef(id).name}: uses one from your pockets or pack. Right-click to clear` : 'Drag a carried med or grenade here'}
        >
          <span className="quick-key"><ByDevice kbm={<>{i + 3}</>} pad={<>{QUICK_PAD[i]}</>} /></span>
          {id && (
            <>
              <AtlasSprite name={itemDef(id).icon} fit={{ w: 30, h: 26 }} />
              <span className={`quick-count ${counts(id) ? '' : 'bad'}`}>×{counts(id)}</span>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
