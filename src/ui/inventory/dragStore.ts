import { create } from 'zustand';
import type { ItemInstance } from '../../core/inventory';
import type { DropTarget } from './ops';

export interface DragInfo {
  uid: string;
  item: ItemInstance;
  rot: boolean;
  /** Pointer offset inside the item tile when grabbed (px, unrotated). */
  grabX: number;
  grabY: number;
  /** Pointer position (client px). */
  px: number;
  py: number;
}

interface DragState {
  drag: DragInfo | null;
  target: DropTarget | null;
  /** Whether the current target would accept the drop. */
  ok: boolean;
  /** Item under the pointer (for the tooltip), with pointer position. */
  hover: { item: ItemInstance; x: number; y: number } | null;
  menu: { uid: string; x: number; y: number } | null;
  /** The SPLIT STACK quantity picker, for this stack. */
  split: { uid: string } | null;
}

export const useDrag = create<DragState>(() => ({ drag: null, target: null, ok: false, hover: null, menu: null, split: null }));

/**
 * Back / Esc inside an inventory closes the innermost thing first: the split picker, then
 * the action menu. Returns true if it closed something (so the inventory itself stays open).
 */
export function closeInventoryPopup(): boolean {
  const s = useDrag.getState();
  if (s.split) {
    useDrag.setState({ split: null });
    return true;
  }
  if (s.menu) {
    useDrag.setState({ menu: null });
    return true;
  }
  return false;
}

/** Everything transient about an inventory screen, reset when it closes. */
export function resetInventoryUi(): void {
  useDrag.setState({ drag: null, target: null, ok: false, hover: null, menu: null, split: null });
}
