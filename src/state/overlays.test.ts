import { beforeEach, describe, expect, it } from 'vitest';
import { createItem, emptyGrid, emptyLoadout } from '../core/inventory';
import { closeInventoryPopup, useDrag } from '../ui/inventory/dragStore';
import { raid, useRaid } from './raidStore';

/**
 * Input ownership in a raid: TAB toggles the bag, M the map (with the job sheet), ESC backs
 * out one layer at a time (split picker / action menu, then the overlay, then pause).
 */
describe('raid overlays', () => {
  beforeEach(() => {
    raid.start('facility', 1, 'tikhaya', emptyLoadout());
    useDrag.setState({ menu: null, split: null });
  });

  it('TAB opens the inventory and TAB closes it', () => {
    raid.toggleInventory();
    expect(useRaid.getState().inventoryOpen).toBe(true);
    raid.toggleInventory();
    expect(useRaid.getState().inventoryOpen).toBe(false);
  });

  it('TAB closes an opened container along with the bag', () => {
    raid.setContainer('c0', emptyGrid(3, 3));
    raid.openContainer('c0', 'BOX');
    raid.toggleInventory();
    expect(useRaid.getState()).toMatchObject({ inventoryOpen: false, open: null });
  });

  it('the map and the bag replace each other rather than stacking', () => {
    raid.toggleInventory();
    raid.toggleMap();
    expect(useRaid.getState()).toMatchObject({ mapOpen: true, inventoryOpen: false });
    raid.toggleInventory();
    expect(useRaid.getState()).toMatchObject({ mapOpen: false, inventoryOpen: true });
  });

  it('ESC closes the overlay first; with nothing open it falls through to pause', () => {
    raid.toggleMap();
    expect(raid.closeOverlay()).toBe(true);
    expect(raid.overlayOpen()).toBe(false);
    expect(raid.closeOverlay()).toBe(false); // → the caller pauses
  });

  it('ESC inside the bag closes the split picker, then the menu, then the bag', () => {
    raid.toggleInventory();
    useDrag.setState({ split: { uid: 'x' }, menu: { uid: 'x', x: 0, y: 0 } });
    expect(closeInventoryPopup()).toBe(true);
    expect(useDrag.getState().split).toBeNull();
    expect(useDrag.getState().menu).not.toBeNull();
    expect(closeInventoryPopup()).toBe(true);
    expect(useDrag.getState().menu).toBeNull();
    expect(closeInventoryPopup()).toBe(false);
    expect(raid.closeOverlay()).toBe(true);
  });

  it('a terminal closes like any other overlay', () => {
    useRaid.setState({ terminal: { id: 't', title: 'LOG', lines: [] } as never });
    expect(raid.overlayOpen()).toBe(true);
    raid.toggleInventory(); // TAB while reading swaps to the bag
    expect(useRaid.getState()).toMatchObject({ terminal: null, inventoryOpen: true });
  });

  it('an item picked up while the bag is open does not change what is open', () => {
    raid.toggleInventory();
    raid.give(createItem('bandage'));
    expect(useRaid.getState().inventoryOpen).toBe(true);
  });
});
