import { describe, expect, it } from 'vitest';
import { TILE } from '../../engine/config';
import { THEMES } from '../../data/themes';
import { DESTINATION } from '../../data/destinations';
import { generateFacility } from './facilityGen';
import type { DoorDef, TileMap } from './tilemap';

/** Walking distance (tiles) from a point to every tile; locked doors are walls unless listed in `open`. */
function distances(map: TileMap, x: number, y: number, open: Set<number> = new Set()): Int32Array {
  const d = new Int32Array(map.width * map.height).fill(-1);
  const s = Math.floor(y / TILE) * map.width + Math.floor(x / TILE);
  d[s] = 0;
  const q = [s];
  for (let h = 0; h < q.length; h++) {
    const i = q[h];
    const tx = i % map.width;
    const ty = Math.floor(i / map.width);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = (ty + dy) * map.width + tx + dx;
      if (d[n] < 0 && (map.isPassable(tx + dx, ty + dy) || open.has(n))) {
        d[n] = d[i] + 1;
        q.push(n);
      }
    }
  }
  return d;
}

/** The floor tiles either side of a door. */
function sides(map: TileMap, door: DoorDef): number[] {
  return door.tiles.flatMap((t) => (door.vertical ? [[t.tx - 1, t.ty], [t.tx + 1, t.ty]] : [[t.tx, t.ty - 1], [t.tx, t.ty + 1]]))
    .map(([x, y]) => y * map.width + x);
}

/** The room a tile is in, or in the wall of. */
const roomAt = (map: TileMap, i: number) => {
  const tx = i % map.width;
  const ty = Math.floor(i / map.width);
  return map.rooms.find((r) => tx >= r.x - 1 && tx <= r.x + r.w && ty >= r.y - 1 && ty <= r.y + r.h);
};

describe('jammed shutters: the loud short way', () => {
  it('most facilities have one; it saves real walking; the long way always exists', () => {
    let with1 = 0;
    for (let seed = 1; seed <= 150; seed++) {
      const map = generateFacility(seed, { theme: THEMES.tikhaya });
      const shutters = map.doors.filter((d) => d.jammed);
      expect(shutters.length, `seed ${seed}`).toBeLessThanOrEqual(1);
      if (!shutters.length) continue;
      with1++;
      const sh = shutters[0];
      expect(sh.locked, `seed ${seed} starts shut`).toBe(true);
      const p = map.spawns.find((s) => s.kind === 'player')!;
      const shut = distances(map, p.x, p.y);
      const forced = distances(map, p.x, p.y, new Set(sh.tiles.map((t) => t.ty * map.width + t.tx)));
      // Both sides are reachable without forcing it...
      for (const i of sides(map, sh)) expect(shut[i], `seed ${seed} long way round`).toBeGreaterThan(0);
      // ...and forcing it is a real shortcut to the far side.
      const gain = Math.max(...sides(map, sh).map((i) => shut[i] - forced[i]));
      expect(gain, `seed ${seed} gain`).toBeGreaterThanOrEqual(12);
    }
    expect(with1).toBeGreaterThan(50);
    expect(with1).toBeLessThan(140);
  });

  it('never opens onto the landing or the pad, never into the vault', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const map = generateFacility(seed);
      const sh = map.doors.find((d) => d.jammed);
      if (!sh) continue;
      for (const i of sides(map, sh)) {
        const r = roomAt(map, i);
        if (!r) continue; // a corridor end
        expect(['start', 'extraction', 'vault'], `seed ${seed}`).not.toContain(r.role);
      }
    }
  });

  it('an operator still learning never meets one', () => {
    for (let seed = 1; seed <= 80; seed++) expect(generateFacility(seed, { gentle: true }).doors.some((d) => d.jammed)).toBe(false);
  });
});

describe('each world builds its own way', () => {
  const avgRoom = (site: typeof DESTINATION.merzlota.site) => {
    let area = 0;
    let n = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const r of generateFacility(seed, { site }).rooms) {
        area += r.w * r.h;
        n++;
      }
    }
    return area / n;
  };

  it('Merzlota is cramped, Krasnaya is open', () => {
    const base = avgRoom(undefined);
    expect(avgRoom(DESTINATION.merzlota.site)).toBeLessThan(base * 0.75);
    expect(avgRoom(DESTINATION.krasnaya.site)).toBeGreaterThan(base * 1.1);
  });

  it('Merzlota is darker than Kombinat', () => {
    const lit = (site: typeof DESTINATION.merzlota.site) => {
      let lamps = 0;
      for (let seed = 1; seed <= 60; seed++) lamps += generateFacility(seed, { site }).lights.filter((l) => l.area).length;
      return lamps;
    };
    expect(lit(DESTINATION.merzlota.site)).toBeLessThan(lit(DESTINATION.kombinat.site));
  });

  it('where a world keeps a watch, the deep rooms are held', () => {
    const posted = (site: typeof DESTINATION.merzlota.site) => {
      let n = 0;
      for (let seed = 1; seed <= 60; seed++) n += generateFacility(seed, { site, enemies: { soldier: 1 } }).spawns.filter((s) => s.post).length;
      return n;
    };
    expect(posted(DESTINATION.krasnaya.site)).toBeGreaterThan(posted(undefined) + 30);
  });

  it('Tikhaya has no rules: its facilities (and the first job) are exactly as before', () => {
    expect(DESTINATION.tikhaya.site).toBeUndefined();
    const a = generateFacility(4242, { theme: THEMES.tikhaya });
    const b = generateFacility(4242, { theme: THEMES.tikhaya, site: {} });
    expect(Array.from(a.tiles)).toEqual(Array.from(b.tiles));
    expect(a.spawns).toEqual(b.spawns);
  });
});
