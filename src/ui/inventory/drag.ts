import { useCallback } from 'react';
import { audio } from '../../engine/audio';
import { itemDef } from '../../data/items';
import { WEAPONS } from '../../data/weapons';
import { findInGrid, footprint, loadoutCount, quickUsable, slotAccepts, type EquipSlot, type ItemInstance } from '../../core/inventory';
import { getGrid, loadWeapon, locate, moveItem, type GridKey } from '../../core/transfer';
import { useDrag, type DragInfo } from './dragStore';
import { CELL, type DropTarget, type InventoryOps } from './ops';

const DRAG_THRESHOLD = 4;

/** Figure out what's under the pointer while dragging. */
export function resolveTarget(drag: DragInfo, ops: InventoryOps): DropTarget | null {
  const el = document.elementFromPoint(drag.px, drag.py) as HTMLElement | null;
  if (!el) return ops.drop ? { kind: 'outside' } : null;
  const quickEl = el.closest<HTMLElement>('[data-quick]');
  if (quickEl) return { kind: 'quick', slot: Number(quickEl.dataset.quick) };
  if (el.closest('[data-sell]')) return { kind: 'sell' };
  const slotEl = el.closest<HTMLElement>('[data-slot]');
  if (slotEl) {
    // Ammo dropped on an equipped weapon loads it.
    const slot = slotEl.dataset.slot as EquipSlot;
    const occupant = ops.ws.loadout[slot];
    if (occupant && occupant.uid !== drag.uid && canLoad(drag.item, occupant)) return { kind: 'item', uid: occupant.uid };
    return { kind: 'slot', slot };
  }
  const gridEl = el.closest<HTMLElement>('[data-grid]');
  if (gridEl) {
    const key = gridEl.dataset.grid as GridKey;
    const itemEl = el.closest<HTMLElement>('[data-item]');
    if (itemEl && itemEl.dataset.item !== drag.uid) {
      const grid = getGrid(ops.ws, key);
      const under = grid && findInGrid(grid, itemEl.dataset.item!);
      if (under) {
        if (canLoad(drag.item, under.item)) return { kind: 'item', uid: under.item.uid };
        const d = itemDef(drag.item.id);
        if (under.item.id === drag.item.id && d.stack > 1) return { kind: 'grid', key, x: under.x, y: under.y };
      }
    }
    const r = gridEl.getBoundingClientRect();
    const f = footprint(drag.item, drag.rot);
    // Anchor the item's top-left cell under the ghost, clamped so near-edge drops still land.
    const gx = drag.px - grabOffset(drag).x - r.left;
    const gy = drag.py - grabOffset(drag).y - r.top;
    const cols = Math.round(r.width / CELL);
    const rows = Math.round(r.height / CELL);
    const x = Math.max(0, Math.min(cols - f.w, Math.round(gx / CELL)));
    const y = Math.max(0, Math.min(rows - f.h, Math.round(gy / CELL)));
    return { kind: 'grid', key, x, y };
  }
  // Over a panel but not a target: nothing. Over the backdrop or the world: drop it.
  if (el.closest('.inv-panel, .inv-menu, .inv-hints, .vendor-panel')) return null;
  return ops.drop ? { kind: 'outside' } : null;
}

function canLoad(ammo: ItemInstance, weapon: ItemInstance): boolean {
  const a = itemDef(ammo.id);
  const w = itemDef(weapon.id);
  return a.kind === 'ammo' && w.kind === 'weapon' && WEAPONS[w.weapon].caliber === a.caliber;
}

/** Grab point inside the ghost; rotation re-centres it so the item stays under the cursor. */
export function grabOffset(drag: DragInfo): { x: number; y: number } {
  const f = footprint(drag.item, drag.rot);
  return { x: Math.min(drag.grabX, f.w * CELL - 4), y: Math.min(drag.grabY, f.h * CELL - 4) };
}

/** Would this drop succeed? Pure checks against the workspace. */
export function validDrop(target: DropTarget | null, drag: DragInfo, ops: InventoryOps): boolean {
  if (!target) return false;
  switch (target.kind) {
    case 'grid':
      return !!moveItem(ops.ws, drag.uid, { grid: target.key, x: target.x, y: target.y, rot: drag.rot });
    case 'slot':
      return slotAccepts(target.slot, drag.item) && !!moveItem(ops.ws, drag.uid, { slot: target.slot });
    case 'item':
      return !!loadWeapon(ops.ws, target.uid, drag.uid, () => 'probe');
    case 'quick':
      // A key points at a type you carry; it never holds an item of its own.
      return quickUsable(drag.item.id) && loadoutCount(ops.ws.loadout, drag.item.id) > 0;
    case 'sell':
      return !!ops.sell && (ops.sellPrice?.(drag.item) ?? 0) > 0;
    case 'outside':
      return !!ops.drop && !!locate(ops.ws, drag.uid);
  }
}

export function commitDrop(target: DropTarget, drag: DragInfo, ops: InventoryOps): boolean {
  switch (target.kind) {
    case 'grid':
      return ops.move(drag.uid, { grid: target.key, x: target.x, y: target.y, rot: drag.rot });
    case 'slot':
      return ops.move(drag.uid, { slot: target.slot });
    case 'item':
      return ops.load(target.uid, drag.uid);
    case 'quick':
      return ops.bindQuick(target.slot, drag.item.id);
    case 'sell':
      ops.sell?.(drag.uid);
      return true;
    case 'outside':
      return ops.drop?.(drag.uid) ?? false;
  }
}

/**
 * Pointer handling for an item tile: click (with shift/ctrl modifiers), drag and drop,
 * right-click menu, hover tooltip.
 */
export function useItemPointer(ops: InventoryOps) {
  return useCallback(
    (e: React.PointerEvent, item: ItemInstance, rot: boolean) => {
      if (e.button === 2) {
        e.preventDefault();
        useDrag.setState({ menu: { uid: item.uid, x: e.clientX, y: e.clientY }, hover: null });
        audio.ui('click');
        return;
      }
      if (e.button !== 0) return;
      e.preventDefault();
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const grabX = e.clientX - rect.left;
      const grabY = e.clientY - rect.top;
      const sx = e.clientX;
      const sy = e.clientY;
      let dragging = false;
      useDrag.setState({ menu: null });

      const onMove = (ev: PointerEvent) => {
        if (!dragging && Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
        if (!dragging) {
          dragging = true;
          audio.ui('pickup');
        }
        const cur = useDrag.getState().drag;
        const drag: DragInfo = cur
          ? { ...cur, px: ev.clientX, py: ev.clientY }
          : { uid: item.uid, item, rot, grabX, grabY, px: ev.clientX, py: ev.clientY };
        const target = resolveTarget(drag, ops);
        useDrag.setState({ drag, target, ok: validDrop(target, drag, ops), hover: null });
      };
      const onKey = (ev: KeyboardEvent) => {
        if (ev.code !== 'KeyR' && ev.code !== 'Space') return;
        const cur = useDrag.getState().drag;
        if (!cur) return;
        ev.preventDefault();
        const d = itemDef(cur.item.id);
        if (d.w === d.h) return;
        const drag = { ...cur, rot: !cur.rot, grabX: (d.w * CELL) / 2, grabY: (d.h * CELL) / 2 };
        const target = resolveTarget(drag, ops);
        useDrag.setState({ drag, target, ok: validDrop(target, drag, ops) });
        audio.ui('tab');
      };
      const onUp = (ev: PointerEvent) => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('keydown', onKey, true);
        const st = useDrag.getState();
        useDrag.setState({ drag: null, target: null, ok: false });
        if (!dragging) {
          if (ev.shiftKey) {
            audio.ui(ops.quick(item.uid) ? 'drop' : 'error');
          } else if (ev.ctrlKey || ev.metaKey) {
            audio.ui(ops.activate(item.uid) ? 'equip' : 'error');
          }
          return;
        }
        if (st.drag && st.target && st.ok && commitDrop(st.target, st.drag, ops)) {
          audio.ui(st.target.kind === 'slot' ? 'equip' : 'drop');
        } else if (st.target) {
          audio.ui('error');
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('keydown', onKey, true);
    },
    [ops],
  );
}

/** Where an item currently sits, for rendering the source as "lifted". */
export function isDragging(uid: string): boolean {
  return useDrag.getState().drag?.uid === uid;
}
