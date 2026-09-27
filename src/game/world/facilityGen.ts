import { TILE } from '../../engine/config';
import { Rng } from '../../engine/rng';
import { Tile, TileMap, type Room, type RoomRole, type Spawn } from './tilemap';

/**
 * Procedural facility generator.
 *
 * Layout: the map is split into a grid of cells; each cell holds one room. Rooms are
 * linked by a random spanning tree (every room reachable) plus a few extra links
 * (loops = flanking routes). Corridors are 2 tiles wide and run through the gaps
 * between cells, so they never cut through other rooms.
 *
 * Roles come from graph distance to the entrance: extraction is the deepest room,
 * the vault a remote dead end, other dead ends are loot rooms.
 *
 * Deterministic: the same seed always produces the same facility.
 */

export interface FacilityOptions {
  cellsX?: number;
  cellsY?: number;
  /** 0.5 = easy .. 1.5 = hard. Scales enemy counts. */
  danger?: number;
}

const CELL_W = 16;
const CELL_H = 13;
const MARGIN = 1;
const AMBIENT = 0.13;

interface Cell {
  cx: number;
  cy: number;
  room: Room;
  links: number[];
  /** Wall tiles of this room that became openings (doors or gaps). */
  openings: { tx: number; ty: number }[];
}

const COVER_SHAPES: [number, number][][] = [
  [[0, 0]],
  [[0, 0], [1, 0]],
  [[0, 0], [0, 1]],
  [[0, 0], [1, 0], [0, 1]],
  [[0, 0], [1, 0], [2, 0]],
];
const CRATES = ['crate_gray', 'crate_pale', 'crate_green', 'crate_orange'];
const BARRELS = ['barrel_gray', 'barrel_red', 'barrel_blue'];

const LIGHT_COLORS: Record<RoomRole, number> = {
  start: 0xcfe0ff,
  standard: 0xffb46b,
  loot: 0xffb46b,
  vault: 0xff3a2a,
  extraction: 0x7dff9a,
};

export function generateFacility(seed: number, opts: FacilityOptions = {}): TileMap {
  const rng = new Rng(seed);
  const cellsX = opts.cellsX ?? rng.int(4, 5);
  const cellsY = opts.cellsY ?? rng.int(3, 4);
  const danger = opts.danger ?? 1;

  const map = new TileMap(cellsX * CELL_W + MARGIN * 2, cellsY * CELL_H + MARGIN * 2);
  map.seed = seed;
  map.ambient = AMBIENT;

  // --- Rooms
  const cells: Cell[] = [];
  for (let cy = 0; cy < cellsY; cy++) {
    for (let cx = 0; cx < cellsX; cx++) {
      const ox = MARGIN + cx * CELL_W;
      const oy = MARGIN + cy * CELL_H;
      // Interior must stay within [o+2, o+size-3] so walls leave a 2-tile gap between cells.
      const w = rng.int(6, CELL_W - 4);
      const h = rng.int(5, CELL_H - 4);
      const x = ox + 2 + rng.int(0, CELL_W - 4 - w);
      const y = oy + 2 + rng.int(0, CELL_H - 4 - h);
      cells.push({ cx, cy, room: { x, y, w, h, role: 'standard', depth: 0 }, links: [], openings: [] });
    }
  }
  const idx = (cx: number, cy: number) => cy * cellsX + cx;

  // --- Connectivity: randomized DFS spanning tree from the entrance, then loops.
  const startIdx = idx(0, rng.int(0, cellsY - 1));
  const visited = new Set<number>([startIdx]);
  const stack = [startIdx];
  const edges: [number, number][] = [];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const { cx, cy } = cells[cur];
    const next = rng.shuffle(neighbours(cx, cy, cellsX, cellsY)).map(([x, y]) => idx(x, y)).filter((n) => !visited.has(n));
    if (!next.length) {
      stack.pop();
      continue;
    }
    const n = next[0];
    visited.add(n);
    edges.push([cur, n]);
    stack.push(n);
  }
  const loops = Math.max(1, Math.round(cells.length * 0.15));
  for (let k = 0, tries = 0; k < loops && tries < 50; tries++) {
    const a = rng.int(0, cells.length - 1);
    const [nx, ny] = rng.pick(neighbours(cells[a].cx, cells[a].cy, cellsX, cellsY));
    const b = idx(nx, ny);
    if (edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
    edges.push([a, b]);
    k++;
  }
  for (const [a, b] of edges) {
    cells[a].links.push(b);
    cells[b].links.push(a);
  }

  // --- Carve rooms
  for (const c of cells) {
    const r = c.room;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) map.set(x, y, Tile.Floor);
  }

  // --- Carve corridors (+ doors)
  for (const [ia, ib] of edges) {
    const [a, b] = cells[ia].cx < cells[ib].cx || cells[ia].cy < cells[ib].cy ? [cells[ia], cells[ib]] : [cells[ib], cells[ia]];
    carveCorridor(map, rng, a, b);
  }

  // --- Walls around everything walkable
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.get(x, y) !== Tile.Void) continue;
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const t = map.get(x + dx, y + dy);
          if (t === Tile.Floor || t === Tile.Door) {
            near = true;
            break;
          }
        }
      }
      if (near) map.set(x, y, Tile.Wall);
    }
  }

  // --- Roles from graph depth
  const depth = new Map<number, number>([[startIdx, 0]]);
  const queue = [startIdx];
  while (queue.length) {
    const cur = queue.shift()!;
    for (const n of cells[cur].links) {
      if (depth.has(n)) continue;
      depth.set(n, depth.get(cur)! + 1);
      queue.push(n);
    }
  }
  const maxDepth = Math.max(...depth.values());
  cells.forEach((c, i) => (c.room.depth = depth.get(i) ?? 0));
  cells[startIdx].room.role = 'start';
  const byDepth = cells.map((_, i) => i).filter((i) => i !== startIdx).sort((p, q) => cells[q].room.depth - cells[p].room.depth);
  const extractionIdx = byDepth[0];
  cells[extractionIdx].room.role = 'extraction';
  const deadEnds = byDepth.filter((i) => i !== extractionIdx && cells[i].links.length === 1);
  const vaultIdx = deadEnds[0] ?? byDepth[1];
  cells[vaultIdx].room.role = 'vault';
  for (const i of deadEnds.slice(1)) cells[i].room.role = 'loot';

  // --- Furnish
  for (const c of cells) furnishRoom(map, rng, c, maxDepth, danger, cells);

  for (const c of cells) map.rooms.push(c.room);
  return map;
}

function neighbours(cx: number, cy: number, w: number, h: number): [number, number][] {
  const out: [number, number][] = [];
  if (cx > 0) out.push([cx - 1, cy]);
  if (cx < w - 1) out.push([cx + 1, cy]);
  if (cy > 0) out.push([cx, cy - 1]);
  if (cy < h - 1) out.push([cx, cy + 1]);
  return out;
}

/** a is left of / above b. */
function carveCorridor(map: TileMap, rng: Rng, a: Cell, b: Cell): void {
  const A = a.room;
  const B = b.room;
  const doorAtA = rng.chance(0.5);
  const hasDoor = rng.chance(0.8);
  const floor = (x: number, y: number) => {
    if (map.get(x, y) !== Tile.Door) map.set(x, y, Tile.Floor);
  };

  if (a.cy === b.cy) {
    // Horizontal link through the vertical gap between the two cells.
    const gx = MARGIN + (a.cx + 1) * CELL_W - 1;
    const lo = Math.max(A.y, B.y);
    const hi = Math.min(A.y + A.h - 2, B.y + B.h - 2);
    let yA: number;
    let yB: number;
    if (hi >= lo && rng.chance(0.65)) yA = yB = rng.int(lo, hi);
    else {
      yA = rng.int(A.y, A.y + A.h - 2);
      yB = rng.int(B.y, B.y + B.h - 2);
    }
    const ax = A.x + A.w; // A's right wall column
    const bx = B.x - 1; // B's left wall column
    for (let x = ax; x <= gx + 1; x++) for (const y of [yA, yA + 1]) floor(x, y);
    for (let y = Math.min(yA, yB); y <= Math.max(yA, yB) + 1; y++) for (const x of [gx, gx + 1]) floor(x, y);
    for (let x = gx; x <= bx; x++) for (const y of [yB, yB + 1]) floor(x, y);
    a.openings.push({ tx: ax, ty: yA }, { tx: ax, ty: yA + 1 });
    b.openings.push({ tx: bx, ty: yB }, { tx: bx, ty: yB + 1 });
    if (hasDoor) {
      const dx = doorAtA ? ax : bx;
      const dy = doorAtA ? yA : yB;
      map.set(dx, dy, Tile.Door);
      map.set(dx, dy + 1, Tile.Door);
      map.doors.push({ tiles: [{ tx: dx, ty: dy }, { tx: dx, ty: dy + 1 }], vertical: true });
    }
  } else {
    // Vertical link through the horizontal gap between the two cells.
    const gy = MARGIN + (a.cy + 1) * CELL_H - 1;
    const lo = Math.max(A.x, B.x);
    const hi = Math.min(A.x + A.w - 2, B.x + B.w - 2);
    let xA: number;
    let xB: number;
    if (hi >= lo && rng.chance(0.65)) xA = xB = rng.int(lo, hi);
    else {
      xA = rng.int(A.x, A.x + A.w - 2);
      xB = rng.int(B.x, B.x + B.w - 2);
    }
    const ay = A.y + A.h; // A's bottom wall row
    const by = B.y - 1; // B's top wall row
    for (let y = ay; y <= gy + 1; y++) for (const x of [xA, xA + 1]) floor(x, y);
    for (let x = Math.min(xA, xB); x <= Math.max(xA, xB) + 1; x++) for (const y of [gy, gy + 1]) floor(x, y);
    for (let y = gy; y <= by; y++) for (const x of [xB, xB + 1]) floor(x, y);
    a.openings.push({ tx: xA, ty: ay }, { tx: xA + 1, ty: ay });
    b.openings.push({ tx: xB, ty: by }, { tx: xB + 1, ty: by });
    if (hasDoor) {
      const dx = doorAtA ? xA : xB;
      const dy = doorAtA ? ay : by;
      map.set(dx, dy, Tile.Door);
      map.set(dx + 1, dy, Tile.Door);
      map.doors.push({ tiles: [{ tx: dx, ty: dy }, { tx: dx + 1, ty: dy }], vertical: false });
    }
  }
}

function furnishRoom(map: TileMap, rng: Rng, cell: Cell, maxDepth: number, danger: number, cells: Cell[]): void {
  const r = cell.room;
  const inRoom = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const reserved = new Set<number>();
  const key = (x: number, y: number) => y * map.width + x;

  // Keep the approach to every opening clear (2 tiles deep).
  for (const o of cell.openings) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        if (inRoom(o.tx + dx, o.ty + dy)) reserved.add(key(o.tx + dx, o.ty + dy));
      }
    }
  }

  // Extraction zone: 3x3 in the middle, kept clear.
  if (r.role === 'extraction') {
    const ex = r.x + Math.floor((r.w - 3) / 2);
    const ey = r.y + Math.floor((r.h - 3) / 2);
    map.extraction = { x: ex, y: ey, w: 3, h: 3 };
    for (let y = ey - 1; y < ey + 4; y++) for (let x = ex - 1; x < ex + 4; x++) reserved.add(key(x, y));
  }

  if (r.role === 'start') {
    const sx = r.x + Math.floor(r.w / 2);
    const sy = r.y + Math.floor(r.h / 2);
    map.spawns.push({ kind: 'player', x: sx * TILE + TILE / 2, y: sy * TILE + TILE / 2 });
    reserved.add(key(sx, sy));
  }

  /** Tiles that must stay reachable from the room floor: openings and every container. */
  const mustTouch: { tx: number; ty: number }[] = [...cell.openings];

  /** Place a solid tile only if the room stays fully connected. */
  const tryBlock = (tiles: [number, number][], place: () => void, isContainer = false): boolean => {
    for (const [x, y] of tiles) {
      if (!inRoom(x, y) || reserved.has(key(x, y)) || map.get(x, y) !== Tile.Floor) return false;
    }
    for (const [x, y] of tiles) map.set(x, y, Tile.Prop);
    const extra = isContainer ? tiles.map(([tx, ty]) => ({ tx, ty })) : [];
    if (!roomConnected(map, r, [...mustTouch, ...extra])) {
      for (const [x, y] of tiles) map.set(x, y, Tile.Floor);
      return false;
    }
    for (const [x, y] of tiles) reserved.add(key(x, y));
    place();
    return true;
  };

  // --- Cover
  const area = r.w * r.h;
  const clusters = Math.min(4, Math.floor(area / 26) + rng.int(0, 1));
  for (let k = 0, tries = 0; k < clusters && tries < 30; tries++) {
    const shape = rng.pick(COVER_SHAPES);
    const bx = rng.int(r.x + 1, r.x + r.w - 2);
    const by = rng.int(r.y + 1, r.y + r.h - 2);
    const tiles = shape.map(([dx, dy]) => [bx + dx, by + dy] as [number, number]);
    // Stay off the walls so there's always an aisle.
    if (tiles.some(([x, y]) => x <= r.x || y <= r.y || x >= r.x + r.w - 1 || y >= r.y + r.h - 1)) continue;
    const barrel = shape.length === 1 && rng.chance(0.4);
    if (tryBlock(tiles, () => {
      for (const [x, y] of tiles) map.props.push({ sprite: barrel ? rng.pick(BARRELS) : rng.pick(CRATES), tx: x, ty: y });
    })) k++;
  }

  // --- Containers, against walls
  const risk = Math.min(1, r.depth / Math.max(1, maxDepth) + (r.role === 'vault' ? 0.5 : 0));
  const containerTypes: string[] = (() => {
    switch (r.role) {
      case 'start': return ['box_dark'];
      case 'loot': return Array.from({ length: rng.int(2, 3) }, () => rng.pick(['box_olive', 'box_red', 'case_green']));
      case 'vault': return ['case_red', 'case_red', 'case_green'];
      case 'extraction': return rng.chance(0.4) ? ['box_olive'] : [];
      default: return rng.chance(0.65) ? [rng.chance(0.25) ? 'box_red' : rng.pick(['box_dark', 'box_olive'])] : [];
    }
  })();
  const wallSpots: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      const touchesWall = map.get(x - 1, y) === Tile.Wall || map.get(x + 1, y) === Tile.Wall
        || map.get(x, y - 1) === Tile.Wall || map.get(x, y + 1) === Tile.Wall;
      if (touchesWall) wallSpots.push([x, y]);
    }
  }
  rng.shuffle(wallSpots);
  for (const type of containerTypes) {
    for (const spot of wallSpots) {
      const placed = tryBlock([spot], () => {
        map.containers.push({ type, tx: spot[0], ty: spot[1], risk });
        mustTouch.push({ tx: spot[0], ty: spot[1] });
      }, true);
      if (placed) break;
    }
  }

  // --- Lights
  const lit = r.role === 'standard' ? rng.chance(0.55) : r.role === 'loot' ? rng.chance(0.5) : true;
  if (lit) {
    const radius = Math.min(260, Math.max(150, Math.max(r.w, r.h) * TILE * 0.8));
    const count = r.w >= 10 ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const lx = (r.x + (r.w * (i + 1)) / (count + 1)) * TILE;
      map.lights.push({
        x: lx, y: r.y * TILE + 6, color: LIGHT_COLORS[r.role], radius,
        intensity: r.role === 'start' ? 0.85 : 0.75,
        flicker: r.role === 'vault' ? rng.chance(0.6) : rng.chance(0.25),
      });
    }
  }
  if (r.role === 'extraction' && map.extraction) {
    const e = map.extraction;
    map.lights.push({ x: (e.x + 1.5) * TILE, y: (e.y + 1.5) * TILE, color: 0x7dff9a, radius: 110, intensity: 0.6, flicker: false });
  }

  // --- Enemies
  const base = (() => {
    switch (r.role) {
      case 'start': return 0;
      case 'loot': return rng.int(1, 2);
      case 'vault': return rng.int(3, 4);
      case 'extraction': return rng.int(1, 2);
      default: return rng.int(0, 1) + (r.depth >= 3 && rng.chance(0.5) ? 1 : 0);
    }
  })();
  const count = r.depth === 1 ? Math.min(1, base) : Math.round(base * danger);
  const free: [number, number][] = [];
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (map.get(x, y) === Tile.Floor && !reserved.has(key(x, y))) free.push([x, y]);
    }
  }
  rng.shuffle(free);
  for (let i = 0; i < count && i < free.length; i++) {
    const [x, y] = free[i];
    const spawn: Spawn = {
      kind: 'scavenger', x: x * TILE + TILE / 2, y: y * TILE + TILE / 2,
    };
    // Some guards walk a route between this room and its neighbours.
    if (i === 0 && r.role === 'standard' && rng.chance(0.4)) {
      const other = cells[rng.pick(cell.links)].room;
      spawn.patrol = [
        { x: spawn.x, y: spawn.y },
        { x: (other.x + other.w / 2) * TILE, y: (other.y + other.h / 2) * TILE },
      ];
    }
    map.spawns.push(spawn);
  }
}

/** All room floor is one connected area and every `touch` tile borders it. */
function roomConnected(map: TileMap, r: Room, touch: { tx: number; ty: number }[]): boolean {
  const inRoom = (x: number, y: number) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  const open = (x: number, y: number) => inRoom(x, y) && map.get(x, y) === Tile.Floor;
  let total = 0;
  let sx = -1;
  let sy = -1;
  for (let y = r.y; y < r.y + r.h; y++) {
    for (let x = r.x; x < r.x + r.w; x++) {
      if (!open(x, y)) continue;
      total++;
      if (sx < 0) {
        sx = x;
        sy = y;
      }
    }
  }
  if (total === 0) return false;
  const seen = new Set<number>([sy * map.width + sx]);
  const q: [number, number][] = [[sx, sy]];
  while (q.length) {
    const [x, y] = q.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = ny * map.width + nx;
      if (!seen.has(k) && open(nx, ny)) {
        seen.add(k);
        q.push([nx, ny]);
      }
    }
  }
  if (seen.size !== total) return false;
  return touch.every((o) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => seen.has((o.ty + dy) * map.width + o.tx + dx)));
}
