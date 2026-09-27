import { useEffect, useMemo, type ReactNode } from 'react';
import { itemDef } from '../../data/items';
import { EQUIP_SLOTS, findInGrid, findSpot, loadoutCount, loadoutValue, loadoutWeight, slotAccepts } from '../../core/inventory';
import { getGrid, locate, type GridKey } from '../../core/transfer';
import { audio } from '../../engine/audio';
import { raid, useRaid } from '../../state/raidStore';
import { DragLayer } from './DragLayer';
import { useDrag } from './dragStore';
import { GridView, QuickBar, SlotView } from './GridView';
import { CELL, InventoryContext, activeInventory, useOps, type InventoryOps } from './ops';
import { ByDevice, Key } from '../Glyph';
import { useDevice } from '../../state/deviceStore';

/** The operator: equipment slots, quick bar, pockets, backpack. */
export function LoadoutPanel({ title }: { title: string }) {
  const ops = useOps();
  const l = ops.ws.loadout;
  const weight = loadoutWeight(l);
  const value = loadoutValue(l);
  const bag = l.backpack;
  return (
    <section className="inv-panel loadout-panel" data-nav-group>
      <header className="inv-head">
        <span className="inv-title">{title}</span>
        <span className={`inv-meta ${weight > 34 ? 'bad' : weight > 22 ? 'warn' : ''}`}>{weight.toFixed(1)} KG</span>
        <span className="inv-meta">{value.toLocaleString()} KR</span>
      </header>
      <div className="equip-layout">
        <div className="equip-col">
          <SlotView slot="helmet" w={CELL * 2} h={CELL * 2} />
          <SlotView slot="armor" w={CELL * 2} h={CELL * 2} />
        </div>
        <div className="equip-col">
          <SlotView slot="primary" w={CELL * 5} h={CELL * 2} />
          <div className="equip-row">
            <SlotView slot="secondary" w={CELL * 3} h={CELL * 2 - 8} />
            <SlotView slot="backpack" w={CELL * 2} h={CELL * 2 - 8} />
          </div>
        </div>
      </div>
      <div className="inv-sub">
        <span>QUICK USE</span>
        <span className="dim"><ByDevice kbm={<>drag a med or grenade on a key</>} pad={<>meds · grenades · <Key a="alt" /> clears</>} /></span>
      </div>
      <QuickBar counts={(id) => loadoutCount(l, id)} />
      <div className="inv-sub"><span>POCKETS</span></div>
      <GridView grid={l.pockets} gridKey="pockets" />
      <div className="inv-sub">
        <span>{bag ? itemDef(bag.id).name.toUpperCase() : 'NO BACKPACK'}</span>
        {bag?.contents && <span className="dim">{bag.contents.w}×{bag.contents.h}</span>}
      </div>
      {bag?.contents ? <GridView grid={bag.contents} gridKey="backpack" /> : <div className="inv-empty-note">Equip a backpack to carry more.</div>}
    </section>
  );
}

/** A grid pane with a title: a container, a corpse, the stash. */
export function GridPanel({ gridKey, title, meta, actions, children, prefer }: {
  gridKey: GridKey; title: string; meta?: ReactNode; actions?: ReactNode; children?: ReactNode;
  /** The controller starts here (an opened container). */
  prefer?: boolean;
}) {
  const ops = useOps();
  const grid = getGrid(ops.ws, gridKey);
  if (!grid) return null;
  return (
    <section className="inv-panel grid-panel" data-nav-group data-nav-prefer={prefer ? '' : undefined}>
      <header className="inv-head">
        <span className="inv-title">{title}</span>
        {meta}
      </header>
      <div className="grid-scroll"><GridView grid={grid} gridKey={gridKey} /></div>
      {grid.items.length === 0 && <div className="inv-empty-note">Nothing left.</div>}
      {actions && <div className="inv-actions">{actions}</div>}
      {children}
    </section>
  );
}

export function InventoryHints({ extra, padExtra }: { extra?: string; padExtra?: ReactNode }) {
  const carrying = useDrag((s) => !!s.drag);
  const device = useDevice((s) => s.device);
  if (carrying && device === 'pad') {
    return (
      <div className="inv-hints carrying">
        <span className="warn">CARRYING</span> · <Key a="navigate" /> move · <Key a="confirm" /> put down · <Key a="more" /> rotate · <Key a="prevTab" /><Key a="nextTab" /> jump panel · <Key a="back" /> cancel
      </div>
    );
  }
  return (
    <div className="inv-hints">
      <ByDevice
        kbm={<>DRAG move · <b>R</b> rotate · <b>SHIFT</b>+click quick move · <b>CTRL</b>+click equip/use · <b>RIGHT</b>-click actions{extra ? ` · ${extra}` : ''}</>}
        pad={<><Key a="confirm" /> pick up · put down · <Key a="alt" /> quick move · <Key a="more" /> actions / rotate · <Key a="prevTab" /><Key a="nextTab" /> panels · <Key a="back" /> back{padExtra}</>}
      />
    </div>
  );
}

/** Tell the controller navigator which inventory is on screen. */
export function useRegisterInventory(ops: InventoryOps | null): void {
  useEffect(() => {
    if (!ops) return;
    activeInventory.ops = ops;
    return () => {
      if (activeInventory.ops === ops) activeInventory.ops = null;
    };
  }, [ops]);
}

// ---------------------------------------------------------------------------
// Raid

function useRaidOps(): InventoryOps {
  const loadout = useRaid((s) => s.loadout);
  const open = useRaid((s) => s.open);
  const containers = useRaid((s) => s.containers);
  return useMemo<InventoryOps>(() => {
    const ws = { loadout, stash: null, external: open ? containers[open.id] ?? null : null };
    const carry: GridKey[] = ['backpack', 'pockets'];
    const ops: InventoryOps = {
      mode: 'raid',
      ws,
      externalLabel: open?.label,
      move: (uid, to) => raid.move(uid, to),
      quick: (uid) => {
        const loc = locate(ws, uid);
        if (!loc) return false;
        if ('slot' in loc.where) return raid.quickMove(uid, carry);
        if (loc.where.grid === 'external') return raid.quickMove(uid, carry, true);
        if (ws.external) return raid.quickMove(uid, ['external']);
        return raid.quickMove(uid, [], true);
      },
      activate: (uid) => {
        const loc = locate(ws, uid);
        if (!loc) return false;
        const d = itemDef(loc.item.id);
        if (d.kind === 'med') {
          raid.use(uid);
          return true;
        }
        if ('slot' in loc.where) return raid.quickMove(uid, carry);
        // Equip into the matching slot, swapping out whatever is there.
        const slot = EQUIP_SLOTS.find((s) => !ws.loadout[s] && slotAccepts(s, loc.item)) ?? EQUIP_SLOTS.find((s) => slotAccepts(s, loc.item));
        return slot ? raid.move(uid, { slot }) : false;
      },
      load: (w, a) => raid.load(w, a),
      unload: (uid) => raid.unload(uid),
      split: (uid) => {
        const loc = locate(ws, uid);
        if (!loc || 'slot' in loc.where || loc.item.qty < 2) return false;
        const g = getGrid(ws, loc.where.grid)!;
        const half = Math.floor(loc.item.qty / 2);
        const spot = findSpot(g, { ...loc.item, qty: half });
        return spot ? raid.split(uid, half, { grid: loc.where.grid, x: spot.x, y: spot.y }) : false;
      },
      bindQuick: (slot, id) => raid.bindQuick(slot, id),
      drop: (uid) => raid.drop(uid),
    };
    return ops;
  }, [loadout, open, containers]);
}

function takeAll(ops: InventoryOps): void {
  const ext = ops.ws.external;
  if (!ext) return;
  let moved = 0;
  // Most valuable first: if space runs out, the good stuff is already in the bag.
  const order = [...ext.items].sort((a, b) => itemDef(b.item.id).value * b.item.qty - itemDef(a.item.id).value * a.item.qty);
  for (const p of order) {
    const cur = useRaid.getState();
    const g = cur.open ? cur.containers[cur.open.id] : null;
    if (!g || !findInGrid(g, p.item.uid)) continue;
    if (raid.quickMove(p.item.uid, ['backpack', 'pockets'])) moved++;
  }
  audio.ui(moved ? 'drop' : 'error');
  if (moved < ext.items.length) raid.notice('NO ROOM FOR EVERYTHING', 'warn');
}

/** In-raid inventory. The world keeps running behind it. */
export function RaidInventory() {
  const ops = useRaidOps();
  const inventoryOpen = useRaid((s) => s.inventoryOpen);
  useRegisterInventory(inventoryOpen ? ops : null);
  if (!inventoryOpen) return null;
  return (
    <InventoryContext.Provider value={ops}>
      <div
        className="inv-root raid-inv"
        data-nav-scope="inventory"
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) useDrag.setState({ menu: null });
        }}
      >
        <LoadoutPanel title="OPERATOR // CARRIED" />
        {ops.ws.external && (
          <GridPanel
            gridKey="external"
            title={ops.externalLabel ?? 'CONTAINER'}
            prefer
            actions={
              <button className="btn" data-pad-shortcut="RT" onClick={() => takeAll(ops)}>
                TAKE ALL <ByDevice kbm={<>[SHIFT-CLICK ITEMS]</>} pad={<Key a="fire" />} />
              </button>
            }
          />
        )}
        <InventoryHints extra="drag outside to DROP · TAB / E close" padExtra={ops.ws.external ? <> · <Key a="fire" /> take all</> : null} />
        <DragLayer />
      </div>
    </InventoryContext.Provider>
  );
}
