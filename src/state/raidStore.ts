import { create } from 'zustand';
import {
  createItem, emptyLoadout, loadoutAdd, loadoutCount, loadoutItems, loadoutTake, loadoutUpdate, newUid,
  type Grid, type ItemInstance, type Loadout,
} from '../core/inventory';
import type { LoreEntry } from '../data/lore';
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

/** What happened this raid, for contracts. */
export interface RaidLog {
  kills: { enemy: string; headshot: boolean }[];
  searched: number;
  visited: string[];
}

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
  log: RaidLog;
  /** Contracts that moved forward (set when the raid is settled). */
  progressed: string[];
  startedAt: number;
  endedAt: number;
  feed: FeedEntry[];
  prompt: string | null;
  extractCountdown: number | null;
  extractInZone: boolean;
  /** Which exit the countdown is for. */
  extractKind: 'pad' | 'lift' | null;
  flashlight: boolean;
  /** Terminal being read. */
  terminal: LoreEntry | null;
  /** Tactical map overlay [M]. */
  mapOpen: boolean;
  /** Lost without a body: the orbit window closed, or the raid was abandoned. */
  mia: boolean;
  /** The last beat of a raid (for the ending overlay), before the report. */
  ending: 'extracted' | 'dead' | 'mia' | null;
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
  log: { kills: [], searched: 0, visited: [] },
  progressed: [],
  startedAt: 0,
  endedAt: 0,
  feed: [],
  prompt: null,
  extractCountdown: null,
  extractInZone: false,
  extractKind: null,
  flashlight: true,
  terminal: null,
  mapOpen: false,
  mia: false,
  ending: null,
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

/** Every instance the raid knows about: carried, in containers, on the ground. */
function allItems(s: RaidState): ItemInstance[] {
  const out = loadoutItems(s.loadout);
  for (const g of Object.values(s.containers)) {
    for (const p of g.items) {
      out.push(p.item);
      for (const q of p.item.contents?.items ?? []) out.push(q.item);
    }
  }
  return out;
}

/**
 * Run an inventory operation without laundering provenance: when something you brought is
 * split, unloaded or merged, the resulting stacks count as brought too (never "found in raid").
 */
function keepProvenance(sources: (string | null)[], op: () => boolean): boolean {
  const before = useRaid.getState();
  if (!sources.some((u) => u && before.brought.includes(u))) return op();
  const prev = new Map(allItems(before).map((i) => [i.uid, i.qty]));
  const ok = op();
  if (!ok) return ok;
  const after = useRaid.getState();
  const brought = new Set(after.brought);
  let changed = false;
  for (const it of allItems(after)) {
    const q = prev.get(it.uid);
    if (brought.has(it.uid) || (q !== undefined && it.qty <= q)) continue;
    brought.add(it.uid);
    changed = true;
  }
  if (changed) useRaid.setState({ brought: [...brought] });
  return ok;
}

export const raid = {
  start(mode: RaidMode, seed: number, destination: string, loadout: Loadout): void {
    commands.length = 0;
    useRaid.setState({
      mode, seed, destination, status: 'active', loadout,
      brought: loadoutItems(loadout).map((i) => i.uid),
      containers: {}, open: null, inventoryOpen: false, kills: 0,
      log: { kills: [], searched: 0, visited: [] }, progressed: [],
      startedAt: performance.now(), endedAt: 0, feed: [], prompt: null,
      extractCountdown: null, extractInZone: false, extractKind: null, flashlight: true,
      terminal: null, mapOpen: false, mia: false, ending: null,
    });
  },

  end(status: RaidStatus, mia = false): void {
    useRaid.setState({
      status, mia, endedAt: performance.now(), prompt: null, extractCountdown: null, open: null, inventoryOpen: false,
      terminal: null, mapOpen: false,
    });
  },

  kill(enemy: string, headshot: boolean): void {
    useRaid.setState((s) => ({ kills: s.kills + 1, log: { ...s.log, kills: [...s.log.kills, { enemy, headshot }] } }));
  },

  searched(): void {
    useRaid.setState((s) => ({ log: { ...s.log, searched: s.log.searched + 1 } }));
  },

  visit(role: string): void {
    const s = useRaid.getState();
    if (s.log.visited.includes(role)) return;
    useRaid.setState({ log: { ...s.log, visited: [...s.log.visited, role] } });
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
    useRaid.setState({ open: { id, label }, inventoryOpen: true, mapOpen: false, terminal: null });
  },

  closeInventory(): void {
    useRaid.setState({ open: null, inventoryOpen: false });
  },

  toggleInventory(): void {
    const s = useRaid.getState();
    if (s.inventoryOpen) raid.closeInventory();
    else useRaid.setState({ inventoryOpen: true, mapOpen: false, terminal: null });
  },

  toggleMap(): void {
    const s = useRaid.getState();
    useRaid.setState({ mapOpen: !s.mapOpen, inventoryOpen: false, open: null, terminal: null });
  },

  /** Any overlay that takes the mouse away from the gun. */
  overlayOpen(): boolean {
    const s = useRaid.getState();
    return s.inventoryOpen || s.mapOpen || s.terminal !== null;
  },

  /** Close whatever overlay is up. Returns false if none was. */
  closeOverlay(): boolean {
    const s = useRaid.getState();
    if (!s.inventoryOpen && !s.mapOpen && !s.terminal) return false;
    useRaid.setState({ open: null, inventoryOpen: false, mapOpen: false, terminal: null });
    return true;
  },

  // --- Inventory operations (UI) --------------------------------------------

  move(uid: string, to: Target): boolean {
    return keepProvenance([uid], () => commit(moveItem(workspace(useRaid.getState()), uid, to)));
  },

  quickMove(uid: string, order: GridKey[], equip = false): boolean {
    return keepProvenance([uid], () => commit(quickMove(workspace(useRaid.getState()), uid, order, equip)));
  },

  split(uid: string, qty: number, to: { grid: GridKey; x: number; y: number }): boolean {
    return keepProvenance([uid], () => commit(splitStack(workspace(useRaid.getState()), uid, qty, to, newUid())));
  },

  load(weaponUid: string, ammoUid: string): boolean {
    return keepProvenance([weaponUid, ammoUid], () => commit(loadWeapon(workspace(useRaid.getState()), weaponUid, ammoUid, newUid)));
  },

  unload(uid: string): boolean {
    return keepProvenance([uid], () => commit(unloadWeapon(workspace(useRaid.getState()), uid, ['pockets', 'backpack'], newUid)));
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

  /**
   * Put rounds/items into carried grids. Returns whatever didn't fit.
   * @param from the item they came out of (a weapon), whose provenance they keep.
   */
  give(item: ItemInstance, from: string | null = null): ItemInstance | null {
    let rest: ItemInstance | null = null;
    keepProvenance([from], () => {
      const r = loadoutAdd(useRaid.getState().loadout, item);
      useRaid.setState({ loadout: r.loadout });
      rest = r.rest;
      return true;
    });
    return rest;
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

  /** Leave an item that isn't in the inventory (overflow) on the ground at the player's feet. */
  dropItem(item: ItemInstance): void {
    commands.push({ type: 'drop', item });
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
  for (const id of ['frag', 'frag', 'smoke']) l = loadoutAdd(l, createItem(id)).loadout;
  l.quick = ['bandage', 'medkit', 'frag', 'smoke'];
  return l;
}
