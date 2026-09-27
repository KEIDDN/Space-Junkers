import { describe, expect, it } from 'vitest';
import { TILE } from '../../engine/config';
import { generateFacility } from './facilityGen';
import { Tile, type TileMap } from './tilemap';

/** Flood fill over passable tiles (doors count as passable). */
function reachable(map: TileMap, x: number, y: number): Set<number> {
  const start = Math.floor(y / TILE) * map.width + Math.floor(x / TILE);
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const i = q.pop()!;
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (ty + dy) * map.width + tx + dx;
      if (!seen.has(n) && map.isPassable(tx + dx, ty + dy)) {
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
    }
  });
});
