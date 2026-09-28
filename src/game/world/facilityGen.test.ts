import { describe, expect, it } from 'vitest';
import { TILE } from '../../engine/config';
import { THEMES } from '../../data/themes';
import { generateFacility, zoneOf } from './facilityGen';
import { MARKS, RETRIEVALS, TASKS, siteOf } from '../../data/objectives';
import { Tile, type TileMap } from './tilemap';

/** Flood fill over walkable tiles. Doors count as passable; locked ones only with `keycard`. */
function reachable(map: TileMap, x: number, y: number, keycard = true): Set<number> {
  const pass = (tx: number, ty: number) => map.isPassable(tx, ty) || (keycard && map.get(tx, ty) === Tile.Door);
  const start = Math.floor(y / TILE) * map.width + Math.floor(x / TILE);
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const i = q.pop()!;
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (ty + dy) * map.width + tx + dx;
      if (!seen.has(n) && pass(tx + dx, ty + dy)) {
        seen.add(n);
        q.push(n);
      }
    }
  }
  return seen;
}

describe('generateFacility', () => {
  it('is deterministic for a seed', () => {
    const a = generateFacility(1234);
    const b = generateFacility(1234);
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawns).toEqual(b.spawns);
    expect(a.containers).toEqual(b.containers);
    const c = generateFacility(1235);
    expect(Array.from(c.tiles)).not.toEqual(Array.from(a.tiles));
  });

  it('produces playable layouts across many seeds', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const map = generateFacility(seed);
      const players = map.spawns.filter((s) => s.kind === 'player');
      expect(players, `seed ${seed}`).toHaveLength(1);
      const p = players[0];
      const reach = reachable(map, p.x, p.y);

      // Every room floor, extraction, container and enemy is reachable.
      for (const r of map.rooms) {
        for (let y = r.y; y < r.y + r.h; y++) {
          for (let x = r.x; x < r.x + r.w; x++) {
            if (map.get(x, y) === Tile.Floor) expect(reach.has(y * map.width + x), `seed ${seed} room tile`).toBe(true);
          }
        }
      }
      expect(map.extraction, `seed ${seed}`).not.toBeNull();
      const e = map.extraction!;
      expect(reach.has((e.y + 1) * map.width + e.x + 1), `seed ${seed} extraction`).toBe(true);
      for (let y = e.y; y < e.y + e.h; y++) for (let x = e.x; x < e.x + e.w; x++) expect(map.get(x, y)).toBe(Tile.Floor);
      for (const c of map.containers) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((c.ty + dy) * map.width + c.tx + dx));
        expect(adj, `seed ${seed} container`).toBe(true);
      }
      for (const s of map.spawns) {
        expect(reach.has(Math.floor(s.y / TILE) * map.width + Math.floor(s.x / TILE)), `seed ${seed} spawn`).toBe(true);
      }
      // Nobody spawns right on top of the player.
      for (const s of map.spawns.filter((q) => q.kind !== 'player')) {
        expect(Math.hypot(s.x - p.x, s.y - p.y), `seed ${seed} enemy too close`).toBeGreaterThan(TILE * 6);
      }
      // Roles
      const roles = map.rooms.map((r) => r.role);
      expect(roles.filter((r) => r === 'start')).toHaveLength(1);
      expect(roles.filter((r) => r === 'extraction')).toHaveLength(1);
      expect(roles.filter((r) => r === 'vault')).toHaveLength(1);
      // Doors sit in walls: both tiles are door tiles.
      for (const d of map.doors) for (const t of d.tiles) expect(map.get(t.tx, t.ty)).toBe(Tile.Door);

      // The vault is sealed: without a keycard its floor can't be reached, the pad still can.
      const vault = map.rooms.find((r) => r.role === 'vault')!;
      expect(map.doors.some((d) => d.locked), `seed ${seed} locked door`).toBe(true);
      const noKey = reachable(map, p.x, p.y, false);
      const vaultFloor = (vault.y + Math.floor(vault.h / 2)) * map.width + vault.x + Math.floor(vault.w / 2);
      expect(noKey.has(vaultFloor), `seed ${seed} vault sealed`).toBe(false);
      expect(noKey.has((e.y + 1) * map.width + e.x + 1), `seed ${seed} pad without key`).toBe(true);
      expect(map.spawns.some((s) => vault.x <= s.x / TILE && s.x / TILE < vault.x + vault.w && vault.y <= s.y / TILE && s.y / TILE < vault.y + vault.h), `seed ${seed} nobody sealed in`).toBe(false);

      // A lift, when there is one, stands on open floor and its breaker is reachable without a key.
      for (const x of map.exits.filter((q) => q.kind === 'lift')) {
        for (let y = x.y; y < x.y + x.h; y++) for (let tx = x.x; tx < x.x + x.w; tx++) expect(map.get(tx, y), `seed ${seed} lift floor`).toBe(Tile.Floor);
        expect(noKey.has((x.y + 1) * map.width + x.x), `seed ${seed} lift`).toBe(true);
        if (x.breaker) expect(noKey.has(x.breaker.ty * map.width + x.breaker.tx), `seed ${seed} breaker`).toBe(true);
      }
      // Terminals can be read from the floor.
      for (const t of map.terminals) {
        const adj = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => reach.has((t.ty + dy) * map.width + t.tx + dx));
        expect(adj, `seed ${seed} terminal`).toBe(true);
      }
    }
  });

  it('furnishes rooms by the destination theme', () => {
    for (const [id, theme] of Object.entries(THEMES)) {
      const map = generateFacility(77, { theme });
      expect(map.ambient).toBe(theme.ambient);
      const kinds = map.rooms.map((r) => r.kind);
      expect(kinds).toContain('entry');
      expect(kinds).toContain('exfil');
      expect(kinds).toContain('vault');
      for (const k of kinds) {
        if (k === 'entry' || k === 'exfil' || k === 'vault') continue;
        expect(Object.keys(theme.rooms), `${id} ${k}`).toContain(k);
      }
    }
  });

  it('usually offers a second exit', () => {
    let lifts = 0;
    let powered = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const lift = generateFacility(seed).exits.find((x) => x.kind === 'lift');
      if (lift) lifts++;
      if (lift?.breaker) powered++;
    }
    expect(lifts).toBeGreaterThan(40);
    expect(powered).toBe(lifts);
  });

  it('lets a learning operator find their feet: quiet entry, one lone scavenger next, then harder', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateFacility(seed, { theme: THEMES.tikhaya, enemies: { scavenger: 8, raider: 2 }, gentle: true });
      const roomOf = (x: number, y: number) => map.rooms.find((r) => x / TILE >= r.x && x / TILE < r.x + r.w && y / TILE >= r.y && y / TILE < r.y + r.h);
      const hostiles = map.spawns.filter((s) => s.kind !== 'player');
      const at = (d: number) => hostiles.filter((s) => roomOf(s.x, s.y)?.depth === d);
      expect(at(0).length + at(1).length, `seed ${seed}`).toBe(0);
      expect(at(2).every((s) => s.kind === 'scavenger'), `seed ${seed}`).toBe(true);
      for (const r of map.rooms.filter((q) => q.depth === 2)) {
        expect(at(2).filter((s) => roomOf(s.x, s.y) === r).length, `seed ${seed}`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('never routes a patrol through the entry room', () => {
    for (let seed = 1; seed <= 80; seed++) {
      const map = generateFacility(seed);
      const start = map.rooms.find((r) => r.role === 'start')!;
      for (const s of map.spawns) {
        for (const p of s.patrol ?? []) {
          const inside = p.x / TILE >= start.x && p.x / TILE < start.x + start.w && p.y / TILE >= start.y && p.y / TILE < start.y + start.h;
          expect(inside, `seed ${seed}`).toBe(false);
        }
      }
    }
  });

  it('has a spatial grammar: entry, then working rooms, then restricted, then deep', () => {
    const rank = { entry: 0, working: 1, restricted: 2, deep: 3, exit: 4 } as const;
    for (let seed = 1; seed <= 60; seed++) {
      const map = generateFacility(seed);
      for (const r of map.rooms) expect(r.zone, `seed ${seed}`).toBe(zoneOf(r, Math.max(...map.rooms.map((q) => q.depth))));
      const standard = map.rooms.filter((r) => r.role === 'standard' || r.role === 'loot').sort((a, b) => a.depth - b.depth);
      for (let i = 1; i < standard.length; i++) {
        expect(rank[standard[i].zone!], `seed ${seed}`).toBeGreaterThanOrEqual(rank[standard[i - 1].zone!]);
      }
      expect(map.rooms.find((r) => r.role === 'start')!.zone).toBe('entry');
    }
  });

  it('leans room purposes toward their zone: security and labs deep, canteens near the door', () => {
    let deepSecure = 0;
    let deepTotal = 0;
    let entryMess = 0;
    let entryTotal = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const r of generateFacility(seed, { theme: THEMES.kombinat }).rooms) {
        if (r.role !== 'standard' && r.role !== 'loot') continue;
        if (r.zone === 'deep' || r.zone === 'restricted') {
          deepTotal++;
          if (r.kind === 'security' || r.kind === 'lab' || r.kind === 'servers') deepSecure++;
        } else {
          entryTotal++;
          if (r.kind === 'mess' || r.kind === 'office' || r.kind === 'storage') entryMess++;
        }
      }
    }
    expect(deepSecure / deepTotal).toBeGreaterThan(entryMess / entryTotal - 0.2);
    expect(deepSecure / deepTotal).toBeGreaterThan(0.55);
  });

  it('fits every contract site where it belongs, reachable, and holds a named hostile in his room', () => {
    const plan = { items: Object.keys(RETRIEVALS).slice(0, 2), tasks: ['relay'], marks: ['boss'] };
    for (let seed = 1; seed <= 80; seed++) {
      const map = generateFacility(seed, { theme: THEMES.tikhaya, plan });
      const p = map.spawns.find((q) => q.kind === 'player')!;
      const reach = reachable(map, p.x, p.y);
      const want = plan.items.length + plan.tasks.length;
      expect(map.sites.length, `seed ${seed}`).toBe(want);
      for (const site of map.sites) {
        expect(map.get(site.tx, site.ty), `seed ${seed} site solid`).toBe(Tile.Prop);
        const adj = [[1, 0], [-1, 0], [0, 1]].some(([dx, dy]) => reach.has((site.ty + dy) * map.width + site.tx + dx));
        expect(adj, `seed ${seed} site reachable`).toBe(true);
        const room = map.rooms.find((r) => site.tx >= r.x && site.tx < r.x + r.w && site.ty >= r.y && site.ty < r.y + r.h)!;
        const def = siteOf(site.kind, site.id)!;
        expect(def.rooms, `seed ${seed} ${site.id}`).toContain(room.kind);
        expect(room.role === 'standard' || room.role === 'loot').toBe(true);
      }
      const boss = map.spawns.filter((q) => q.kind === 'boss');
      expect(boss, `seed ${seed}`).toHaveLength(1);
      expect(boss[0].post).toBe(true);
      const home = map.rooms.find((r) => boss[0].x / TILE >= r.x && boss[0].x / TILE < r.x + r.w && boss[0].y / TILE >= r.y && boss[0].y / TILE < r.y + r.h)!;
      const inHome = map.spawns.filter((q) => q.kind !== 'player' && q.x / TILE >= home.x && q.x / TILE < home.x + home.w && q.y / TILE >= home.y && q.y / TILE < home.y + home.h);
      expect(inHome.length, `seed ${seed} guards`).toBeGreaterThanOrEqual(Math.min(1 + MARKS.boss.guards, 2));
      expect(inHome.every((q) => q.post)).toBe(true);
    }
  });

  it('without open contracts, a seed makes the facility it always made', () => {
    const plain = generateFacility(4242, { theme: THEMES.tikhaya });
    const empty = generateFacility(4242, { theme: THEMES.tikhaya, plan: { items: [], tasks: [], marks: [] } });
    expect(Array.from(empty.tiles)).toEqual(Array.from(plain.tiles));
    expect(empty.spawns).toEqual(plain.spawns);
    expect(plain.sites).toHaveLength(0);
    expect(Object.keys(TASKS).length).toBeGreaterThan(0);
  });
});
