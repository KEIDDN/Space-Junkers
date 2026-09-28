import { CREW, type CrewId } from '../data/crew';
import { ITEMS, itemDef } from '../data/items';
import { QUEST, QUESTS, type Objective, type QuestDef } from '../data/quests';
import { crewLevel } from './economy';
import {
  addToGrid, createItem, takeFromGrid, type Grid, type ItemInstance, type Loadout,
} from './inventory';
import type { Profile } from './profile';

/**
 * Contract logic. Pure: takes a profile, returns a new one.
 */

export interface RaidReport {
  destination: string;
  extracted: boolean;
  kills: { enemy: string; headshot: boolean }[];
  searched: number;
  /** Room roles the player entered (vault, extraction...). */
  visited: string[];
  /** Items carried out that the player didn't bring in (only meaningful when extracted). */
  found: ItemInstance[];
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'turnedIn';

function isRaidObjective(o: Objective): boolean {
  return o.kind !== 'handIn' && o.kind !== 'handInCategory';
}

export function needOf(o: Objective): number {
  return o.kind === 'visit' ? 1 : o.count;
}

// ---------------------------------------------------------------------------
// Counting what's aboard (stash, stored bags, carried grids) for hand-ins.

function aboardGrids(p: Profile): Grid[] {
  const grids: Grid[] = [p.stash];
  for (const q of p.stash.items) if (q.item.contents) grids.push(q.item.contents);
  grids.push(p.loadout.pockets);
  if (p.loadout.backpack?.contents) grids.push(p.loadout.backpack.contents);
  return grids;
}

function matches(o: Objective, id: string): boolean {
  if (o.kind === 'handIn') return id === o.item;
  if (o.kind === 'handInCategory') return itemDef(id).category === o.category && itemDef(id).kind === 'loot';
  return false;
}

export function countAboard(p: Profile, o: Objective): number {
  let n = 0;
  for (const g of aboardGrids(p)) for (const q of g.items) if (!q.item.crew && matches(o, q.item.id)) n += q.item.qty;
  return n;
}

/** Remove hand-in items, cheapest first, stash before loadout. */
function takeAboard(p: Profile, o: Objective, count: number): Profile {
  let left = count;
  const ids = new Set<string>();
  for (const g of aboardGrids(p)) for (const q of g.items) if (!q.item.crew && matches(o, q.item.id)) ids.add(q.item.id);
  const order = [...ids].sort((a, b) => ITEMS[a].value - ITEMS[b].value);
  let stash = p.stash;
  let loadout: Loadout = p.loadout;
  for (const id of order) {
    if (left <= 0) break;
    const a = takeFromGrid(stash, id, left);
    stash = a.grid;
    left -= a.taken;
    if (left > 0) {
      stash = {
        ...stash,
        items: stash.items.map((q) => {
          if (left <= 0 || !q.item.contents) return q;
          const r = takeFromGrid(q.item.contents, id, left);
          left -= r.taken;
          return { ...q, item: { ...q.item, contents: r.grid } };
        }),
      };
    }
    if (left > 0) {
      const r = takeFromGrid(loadout.pockets, id, left);
      loadout = { ...loadout, pockets: r.grid };
      left -= r.taken;
    }
    if (left > 0 && loadout.backpack?.contents) {
      const r = takeFromGrid(loadout.backpack.contents, id, left);
      loadout = { ...loadout, backpack: { ...loadout.backpack, contents: r.grid } };
      left -= r.taken;
    }
  }
  return { ...p, stash, loadout };
}

// ---------------------------------------------------------------------------

export function questStatus(p: Profile, id: string): QuestStatus {
  const q = QUEST[id];
  const st = p.quests[id];
  if (st?.status === 'turnedIn') return 'turnedIn';
  if (st) return questReady(p, q) ? 'ready' : 'active';
  const req = q.requires;
  if (req?.quests?.some((r) => p.quests[r]?.status !== 'turnedIn')) return 'locked';
  if ((req?.trust ?? 0) > crewLevel(p, q.giver)) return 'locked';
  return 'available';
}

/** Progress on one objective: raid objectives from the log, hand-ins from what's aboard. */
export function objectiveProgress(p: Profile, q: QuestDef, i: number): { have: number; need: number } {
  const o = q.objectives[i];
  const need = needOf(o);
  if (!isRaidObjective(o)) return { have: Math.min(need, countAboard(p, o)), need };
  return { have: Math.min(need, p.quests[q.id]?.progress[i] ?? 0), need };
}

export function questReady(p: Profile, q: QuestDef): boolean {
  return q.objectives.every((_, i) => {
    const { have, need } = objectiveProgress(p, q, i);
    return have >= need;
  });
}

export function questsFor(p: Profile, crew?: CrewId): { def: QuestDef; status: QuestStatus }[] {
  return QUESTS.filter((q) => !crew || q.giver === crew).map((def) => ({ def, status: questStatus(p, def.id) }));
}

export function accept(p: Profile, id: string): Profile {
  if (questStatus(p, id) !== 'available') return p;
  const q = QUEST[id];
  return { ...p, quests: { ...p.quests, [id]: { status: 'active', progress: q.objectives.map(() => 0) } } };
}

/** Count a finished raid against every active contract. */
export function applyRaid(p: Profile, r: RaidReport): { profile: Profile; progressed: string[] } {
  const quests = { ...p.quests };
  const progressed: string[] = [];
  for (const [id, st] of Object.entries(p.quests)) {
    if (st.status !== 'active') continue;
    const q = QUEST[id];
    if (!q) continue;
    const progress = [...st.progress];
    let changed = false;
    q.objectives.forEach((o, i) => {
      if ('destination' in o && o.destination && o.destination !== r.destination) return;
      let add = 0;
      switch (o.kind) {
        case 'kill':
          add = r.kills.filter((k) => (!o.enemy || k.enemy === o.enemy) && (!o.headshot || k.headshot)).length;
          break;
        case 'search':
          add = r.searched;
          break;
        case 'visit':
          add = r.visited.includes(o.room) ? 1 : 0;
          break;
        case 'extract':
          add = r.extracted ? 1 : 0;
          break;
        case 'extractWith':
          add = r.extracted ? r.found.filter((it) => it.id === o.item).reduce((n, it) => n + it.qty, 0) : 0;
          break;
        default:
          return;
      }
      const next = Math.min(needOf(o), progress[i] + add);
      if (next !== progress[i]) {
        progress[i] = next;
        changed = true;
      }
    });
    if (changed) {
      quests[id] = { ...st, progress };
      progressed.push(id);
    }
  }
  return { profile: { ...p, quests }, progressed };
}

export type TurnInResult = { ok: true; profile: Profile; lines: string[] } | { ok: false; error: string };

export function turnIn(p: Profile, id: string): TurnInResult {
  const q = QUEST[id];
  if (!q || questStatus(p, id) !== 'ready') return { ok: false, error: 'Not done yet.' };
  let next = p;
  for (const o of q.objectives) if (!isRaidObjective(o)) next = takeAboard(next, o, needOf(o));
  const r = q.reward;
  let credits = next.credits + (r.credits ?? 0);
  let stash = next.stash;
  for (const [itemId, qty] of r.items ?? []) {
    const def = itemDef(itemId);
    // Ammo comes as one stack; everything else one by one.
    const units = def.stack > 1 ? [qty] : Array.from({ length: qty }, () => 1);
    for (const u of units) {
      const res = addToGrid(stash, createItem(itemId, { qty: u, loaded: def.kind === 'weapon' ? 999 : undefined }));
      stash = res.grid;
      if (res.rest) credits += def.value * res.rest.qty; // no room: paid out instead
    }
  }
  const cur = next.crew[q.giver] ?? { trust: 0, met: true };
  return {
    ok: true,
    lines: q.done,
    profile: {
      ...next,
      credits,
      stash,
      crew: { ...next.crew, [q.giver]: { ...cur, trust: cur.trust + (r.trust ?? 0) } },
      destinations: r.destination && !next.destinations.includes(r.destination) ? [...next.destinations, r.destination] : next.destinations,
      quests: { ...next.quests, [id]: { ...next.quests[id], status: 'turnedIn' } },
      stats: { ...next.stats, creditsEarned: next.stats.creditsEarned + (r.credits ?? 0) },
    },
  };
}

/** Human-readable objective line. */
export function objectiveText(o: Objective): string {
  const where = 'destination' in o && o.destination ? ` on ${o.destination[0].toUpperCase()}${o.destination.slice(1)}` : '';
  switch (o.kind) {
    case 'kill': {
      const who = o.enemy ? `${o.enemy}s` : 'hostiles';
      return `Kill ${o.count} ${who}${o.headshot ? ' with headshots' : ''}${where}`;
    }
    case 'search':
      return `Search ${o.count} containers${where}`;
    case 'visit':
      return `Enter a facility ${o.room}${where}`;
    case 'extract':
      return `Extract ${o.count > 1 ? `${o.count} times` : 'alive'}${where}`;
    case 'extractWith':
      return `Extract with ${o.count} × ${ITEMS[o.item].name} found in raid${where}`;
    case 'handIn':
      return `Hand in ${o.count} × ${ITEMS[o.item].name}`;
    case 'handInCategory':
      return `Hand in ${o.count} × any ${o.category}`;
  }
}

export function giverName(q: QuestDef): string {
  return CREW[q.giver].callsign;
}

export interface LiveObjective {
  text: string;
  have: number;
  need: number;
  /** A short reminder of what still has to happen for it to count (or null). */
  note: string | null;
  /** Can be progressed in this raid (right world, raid objective). */
  here: boolean;
}

export interface LiveContract {
  id: string;
  title: string;
  giver: CrewId;
  reward: QuestDef['reward'];
  objectives: LiveObjective[];
}

/**
 * Every active contract as it stands right now, mid-raid: saved progress plus what this
 * raid has done so far (kills, searches, rooms), and what is in the bag that would count
 * once it's out. The same data the ship shows, nothing invented.
 * @param found items carried right now that were found in this raid
 */
export function liveContracts(
  p: Profile, log: { kills: RaidReport['kills']; searched: number; visited: string[] }, destination: string,
  found: ItemInstance[] = [],
): LiveContract[] {
  const out: LiveContract[] = [];
  const carried = (id: string) => found.filter((it) => it.id === id).reduce((n, it) => n + it.qty, 0);
  for (const [id, st] of Object.entries(p.quests)) {
    if (st.status !== 'active') continue;
    const q = QUEST[id];
    if (!q) continue;
    const live = applyRaid({ ...p, quests: { [id]: st } }, {
      destination, extracted: false, kills: log.kills, searched: log.searched, visited: log.visited, found: [],
    }).profile.quests[id];
    const objectives = q.objectives.map((o, i): LiveObjective => {
      const need = needOf(o);
      const here = isRaidObjective(o) && !('destination' in o && o.destination && o.destination !== destination);
      if (!isRaidObjective(o)) {
        const bag = o.kind === 'handIn' ? carried(o.item) : found.filter((it) => matches(o, it.id)).reduce((n, it) => n + it.qty, 0);
        const have = Math.min(need, countAboard(p, o) + bag);
        return { text: objectiveText(o), have, need, here: false, note: have < need ? 'BRING IT ABOARD, HAND IN ON THE SHIP' : bag > 0 ? 'GET IT HOME' : null };
      }
      const have = Math.min(need, live.progress[i] ?? 0);
      let note: string | null = null;
      if (o.kind === 'extractWith' && here) {
        const bag = carried(o.item);
        if (have < need && bag > 0) note = `${Math.min(bag, need - have)} IN YOUR BAG · EXTRACT TO COUNT`;
      } else if (o.kind === 'extract' && here && have < need) note = 'COUNTS WHEN YOU GET OUT';
      else if (!here && 'destination' in o && o.destination) note = `ON ${o.destination.toUpperCase()}`;
      return { text: objectiveText(o), have, need, note, here };
    });
    out.push({ id, title: q.title, giver: q.giver, reward: q.reward, objectives });
  }
  return out;
}

/**
 * Raid objectives of active contracts with progress including what's happened so far in
 * the current raid (for the always-on tracker). Only what can move on this world.
 */
export function liveTracker(p: Profile, log: { kills: RaidReport['kills']; searched: number; visited: string[] }, destination: string, found: ItemInstance[] = []):
  { title: string; text: string; have: number; need: number; note: string | null }[] {
  return liveContracts(p, log, destination, found).flatMap((c) => c.objectives
    .filter((o) => o.here)
    .map((o) => ({ title: c.title, text: o.text, have: o.have, need: o.need, note: o.note })));
}
