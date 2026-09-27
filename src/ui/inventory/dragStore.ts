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
}

export const useDrag = create<DragState>(() => ({ drag: null, target: null, ok: false, hover: null, menu: null }));
