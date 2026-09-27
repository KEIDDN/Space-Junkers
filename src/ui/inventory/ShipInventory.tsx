import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { itemDef } from '../../data/items';
import { findInGrid, gridValue, type ItemInstance } from '../../core/inventory';
import { audio } from '../../engine/audio';
import { useProfile } from '../../state/profileStore';
import { ship } from '../../state/shipOps';
import { DragLayer } from './DragLayer';
import { useDrag } from './dragStore';
import { GridPanel, InventoryHints, LoadoutPanel } from './InventoryScreen';
import { InventoryContext, type InventoryOps } from './ops';

interface Props {
  onClose: () => void;
  /** Vendor mode: selling hooks and an extra panel on the right. */
  sell?: (uid: string) => void;
  sellPrice?: (item: ItemInstance) => number | null;
  side?: ReactNode;
  title?: string;
}

/** Stash + loadout aboard the ship. Also the base of vendor screens. */
export function ShipInventory({ onClose, sell, sellPrice, side, title = 'SHIP STASH' }: Props) {
  const loadout = useProfile((s) => s.loadout);
  const stash = useProfile((s) => s.stash);
  const credits = useProfile((s) => s.credits);
  const [bag, setBag] = useState<string | null>(null);
  const openBag = bag && findInGrid(stash, bag) ? bag : null;

  const ops = useMemo<InventoryOps>(() => ({
    mode: 'ship',
    ws: { loadout, stash, external: null },
    move: ship.move,
    quick: ship.quick,
    activate: ship.activate,
    load: ship.load,
    unload: ship.unload,
    split: ship.split,
    bindQuick: ship.bindQuick,
    sell,
    sellPrice,
    openBag: (uid) => setBag(uid),
  }), [loadout, stash, sell, sellPrice]);

  const needsKit = !ship.hasAnyWeapon();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'Tab') return;
      e.preventDefault();
      if (useDrag.getState().menu) useDrag.setState({ menu: null });
      else if (bag) setBag(null);
      else {
        audio.ui('close');
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, bag]);

  return (
    <InventoryContext.Provider value={ops}>
      <div className="inv-root ship-inv" onContextMenu={(e) => e.preventDefault()} onPointerDown={(e) => {
        if (e.target === e.currentTarget) useDrag.setState({ menu: null });
      }}>
        <LoadoutPanel title="OPERATOR // LOADOUT" />
        <GridPanel
          gridKey="stash"
          title={title}
          meta={<span className="inv-meta">{gridValue(stash).toLocaleString()} CR STORED</span>}
          actions={
            <>
              <button className="btn" onClick={() => audio.ui(ship.sortStash() ? 'drop' : 'error')}>SORT</button>
              {needsKit && (
                <button className="btn accent" onClick={() => audio.ui(ship.takeCrewKit() ? 'equip' : 'error')}>
                  TAKE CREW-ISSUE KIT
                </button>
              )}
              <span className="grow" />
              <span className="credits">{credits.toLocaleString()} <small>CR</small></span>
              <button className="btn" onClick={() => { audio.ui('close'); onClose(); }}>CLOSE [ESC]</button>
            </>
          }
        />
        {openBag && (
          <GridPanel
            gridKey={`bag:${openBag}`}
            title={itemDef(findInGrid(stash, openBag)!.item.id).name.toUpperCase()}
            actions={<button className="btn" onClick={() => setBag(null)}>CLOSE BAG</button>}
          />
        )}
        {side}
        <InventoryHints extra="right-click a stored bag to OPEN it" />
        <DragLayer />
      </div>
    </InventoryContext.Provider>
  );
}
