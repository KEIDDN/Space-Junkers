import { create } from 'zustand';
import {
  createItem, emptyLoadout, loadoutAdd, loadoutCount, loadoutItems, loadoutTake, loadoutUpdate, newUid,
  type Grid, type ItemInstance, type Loadout,
} from '../core/inventory';
import {
  loadWeapon, moveItem, quickMove, removeItem, splitStack, unloadWeapon, updateItem,
  type GridKey, type Target, type Workspace,
} from '../core/transfer';

export type RaidStatus = 'active' | 'extracted' | 'dead';
export type RaidMode = 'range' | 'facility';

export type FeedTone = 'ok' | 'warn' | 'bad' | 'loot';

/** A short line in the HUD feed (loot, armor broke, bleeding...). */
export interface FeedEntry {
  id: number;
  text: string;
  tone: FeedTone;
  itemId?: string;
}

/** Requests from the UI that the simulation carries out on its next tick. */
export type RaidCommand =
  | { type: 'drop'; item: ItemInstance }
  | { type: 'use'; uid: string };

const commands: RaidCommand[] = [];

export interface OpenContainer {
  id: string;
  label: string;
}

/**
 * The current raid, shared between the simulation and the UI. Everything here is at risk:
 * the loadout is lost on death and only banked on extraction.
 * The game writes on events (shots, reloads, pickups), never per frame.
 */
export interface RaidState {
  mode: RaidMode;
  seed: number;
  destination: string;
  status: RaidStatus;
  loadout: Loadout;
  /** Item uids the player deployed with. Anything else carried out was found in the raid. */
  brought: string[];
  /** Contents of searched containers, corpses and ground piles, by container id. */
  containers: Record<string, Grid>;
  /** Container currently shown next to the inventory. */
  open: OpenContainer | null;
  inventoryOpen: boolean;
  kills: number;
  startedAt: number;
  endedAt: number;
  feed: FeedEntry[];
  prompt: string | null;
  extractCountdown: number | null;
  extractInZone: boolean;
  flashlight: boolean;
}

let feedId = 0;

export const useRaid = create<RaidState>(() => ({
  mode: 'range',
  seed: 0,
  destination: '',
  status: 'active',
  loadout: emptyLoadout(),
  brought: [],
  containers: {},
  open: null,
  inventoryOpen: false,
  kills: 0,
  startedAt: 0,
  endedAt: 0,
  feed: [],
  prompt: null,
  extractCountdown: null,
  extractInZone: false,
  flashlight: true,
}));

function workspace(s: RaidState): Workspace {
  return { loadout: s.loadout, stash: null, external: s.open ? s.containers[s.open.id] ?? null : null };
}

function commit(ws: Workspace | null): boolean {
  if (!ws) return false;
  const s = useRaid.getState();
  const containers = s.open && ws.external ? { ...s.containers, [s.open.id]: ws.external } : s.containers;
  useRaid.setState({ loadout: ws.loadout, containers });
  return true;
}

export const raid = {
  start(mode: RaidMode, seed: number, destination: string, loadout: Loadout): void {
    commands.length = 0;
    useRaid.setState({
      mode, seed, destination, status: 'active', loadout,
      brought: loadoutItems(loadout).map((i) => i.uid),
      containers: {}, open: null, inventoryOpen: false, kills: 0,
      startedAt: performance.now(), endedAt: 0, feed: [], prompt: null,
      extractCountdown: null, extractInZone: false, flashlight: true,
    });
  },

  end(status: RaidStatus): void {
    useRaid.setState({ status, endedAt: performance.now(), prompt: null, extractCountdown: null, open: null, inventoryOpen: false });
  },

  kill(): void {
    useRaid.setState((s) => ({ kills: s.kills + 1 }));
  },

  /** Set only if changed, to avoid needless React renders. */
  patch(p: Partial<RaidState>): void {
    const s = useRaid.getState();
    for (const k in p) {
      if (p[k as keyof RaidState] !== s[k as keyof RaidState]) {
        useRaid.setState(p);
        return;
      }
    }
  },

  // --- Containers ------------------------------------------------------------

  hasContainer(id: string): boolean {
    return id in useRaid.getState().containers;
  },

  setContainer(id: string, grid: Grid): void {
    useRaid.setState((s) => ({ containers: { ...s.containers, [id]: grid } }));
  },

  openContainer(id: string, label: string): void {
    useRaid.setState({ open: { id, label }, inventoryOpen: true });
  },

  closeInventory(): void {
    useRaid.setState({ open: null, inventoryOpen: false });
  },

  toggleInventory(): void {
    const s = useRaid.getState();
    if (s.inventoryOpen) raid.closeInventory();
    else useRaid.setState({ inventoryOpen: true });
  },

  // --- Inventory operations (UI) --------------------------------------------

  move(uid: string, to: Target): boolean {
    return commit(moveItem(workspace(useRaid.getState()), uid, to));
  },

  quickMove(uid: string, order: GridKey[], equip = false): boolean {
    return commit(quickMove(workspace(useRaid.getState()), uid, order, equip));
  },

  split(uid: string, qty: number, to: { grid: GridKey; x: number; y: number }): boolean {
    return commit(splitStack(workspace(useRaid.getState()), uid, qty, to, newUid()));
  },

  load(weaponUid: string, ammoUid: string): boolean {
    return commit(loadWeapon(workspace(useRaid.getState()), weaponUid, ammoUid, newUid));
  },

  unload(uid: string): boolean {
    return commit(unloadWeapon(workspace(useRaid.getState()), uid, ['pockets', 'backpack'], newUid));
  },

  /** Take an item out of the inventory entirely (dropping it on the ground). */
  remove(uid: string): ItemInstance | null {
    const r = removeItem(workspace(useRaid.getState()), uid);
    if (!r) return null;
    commit(r.ws);
    return r.item;
  },

  bindQuick(slot: number, itemId: string | null): void {
    useRaid.setState((s) => {
      const quick = s.loadout.quick.map((q) => (q === itemId ? null : q));
      quick[slot] = itemId;
      return { loadout: { ...s.loadout, quick } };
    });
  },

  // --- Simulation hooks --------------------------------------------------------

  updateItem(item: ItemInstance): void {
    const s = useRaid.getState();
    const ws = updateItem(workspace(s), item);
    commit(ws);
  },

  count(id: string): number {
    return loadoutCount(useRaid.getState().loadout, id);
  },

  take(id: string, qty: number): number {
    const s = useRaid.getState();
    const r = loadoutTake(s.loadout, id, qty);
    if (r.taken) useRaid.setState({ loadout: r.loadout });
    return r.taken;
  },

  /** Put rounds/items into carried grids. Returns whatever didn't fit. */
  give(item: ItemInstance): ItemInstance | null {
    const s = useRaid.getState();
    const r = loadoutAdd(s.loadout, item);
    useRaid.setState({ loadout: r.loadout });
    return r.rest;
  },

  /** Consume one charge/instance of a consumable. Pooled kits lose `drain` points instead. */
  consume(uid: string, drain = 0): void {
    const s = useRaid.getState();
    const it = loadoutItems(s.loadout).find((i) => i.uid === uid);
    if (!it) return;
    if (drain > 0 && it.dur !== undefined && it.dur - drain > 0.5) {
      useRaid.setState({ loadout: loadoutUpdate(s.loadout, { ...it, dur: it.dur - drain }) });
      return;
    }
    if (it.qty > 1) {
      useRaid.setState({ loadout: loadoutUpdate(s.loadout, { ...it, qty: it.qty - 1 }) });
      return;
    }
    const r = removeItem(workspace(s), uid);
    if (r) commit(r.ws);
  },

  notice(text: string, tone: FeedTone, itemId?: string): void {
    useRaid.setState((s) => ({ feed: [...s.feed, { id: ++feedId, text, tone, itemId }].slice(-6) }));
  },

  // --- Commands for the simulation ------------------------------------------

  /** Take an item out of the inventory and leave it on the ground at the player's feet. */
  drop(uid: string): boolean {
    const it = raid.remove(uid);
    if (!it) return false;
    commands.push({ type: 'drop', item: it });
    return true;
  },

  /** Use a consumable from the inventory. */
  use(uid: string): void {
    commands.push({ type: 'use', uid });
  },

  takeCommands(): RaidCommand[] {
    return commands.splice(0, commands.length);
  },
};

/** Test-range kit: every gun, loaded, with plenty of ammo. Never touches the save. */
export function rangeLoadout(): Loadout {
  let l = emptyLoadout();
  l.primary = createItem('akr74', { loaded: 30 });
  l.secondary = createItem('pm9', { loaded: 9 });
  l.backpack = createItem('raidpack');
  l.armor = createItem('vest_zhuk');
  l.helmet = createItem('k6helmet');
  for (const [id, qty] of [['ammo_545', 60], ['ammo_545', 60], ['ammo_9x18', 60], ['ammo_12buck', 20], ['ammo_762', 40], ['ammo_12slug', 20], ['ammo_545_ap', 60]] as const) {
    l = loadoutAdd(l, createItem(id, { qty })).loadout;
  }
  for (const id of ['toz12', 'svk', 'ppd41']) l = loadoutAdd(l, createItem(id, { loaded: 99 })).loadout;
  l = loadoutAdd(l, createItem('medkit')).loadout;
  l = loadoutAdd(l, createItem('bandage')).loadout;
  l.quick = ['bandage', 'medkit', null, null];
  return l;
}
