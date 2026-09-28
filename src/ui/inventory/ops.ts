import { createContext, useContext } from 'react';
import type { EquipSlot, ItemInstance } from '../../core/inventory';
import type { GridKey, Target, Workspace } from '../../core/transfer';

/** Pixel size of one inventory cell. */
export const CELL = 40;

export type InventoryMode = 'raid' | 'ship';

/**
 * What an inventory screen can do. The raid and the ship implement it against their own
 * stores; the components only talk to this.
 */
export interface InventoryOps {
  mode: InventoryMode;
  ws: Workspace;
  /** Title for the external pane (the open container), if any. */
  externalLabel?: string;
  move(uid: string, to: Target): boolean;
  /** Shift-click: send the item to "the other side". */
  quick(uid: string): boolean;
  /** Double-click: equip, or use a consumable in a raid. */
  activate(uid: string): boolean;
  load(weaponUid: string, ammoUid: string): boolean;
  unload(uid: string): boolean;
  /** Split `qty` units off a stack into a new stack (first free spot). */
  split(uid: string, qty: number): boolean;
  /** Bind a carried med or grenade type to a quick-use key; null clears the key. */
  bindQuick(slot: number, itemId: string | null): boolean;
  /** Raid: let go of an item outside the panes to drop it on the ground. */
  drop?(uid: string): boolean;
  /** Ship: sell an item to the open vendor. */
  sell?(uid: string): void;
  /** Ship: what a vendor would pay, for tooltips. */
  sellPrice?(item: ItemInstance): number | null;
  /** Ship: show a stored backpack's contents. */
  openBag?(uid: string): void;
  /** Ship (Molot, with the bench): what fixing an item costs, and doing it. */
  repairPrice?(item: ItemInstance): number | null;
  repair?(uid: string): void;
}

export const InventoryContext = createContext<InventoryOps | null>(null);

/** The inventory currently on screen, for the controller navigator (set by the screen). */
export const activeInventory: { ops: InventoryOps | null } = { ops: null };

export function useOps(): InventoryOps {
  const ops = useContext(InventoryContext);
  if (!ops) throw new Error('InventoryContext missing');
  return ops;
}

export type DropTarget =
  | { kind: 'grid'; key: GridKey; x: number; y: number }
  | { kind: 'slot'; slot: EquipSlot }
  | { kind: 'item'; uid: string }
  | { kind: 'quick'; slot: number }
  | { kind: 'sell' }
  | { kind: 'outside' };
