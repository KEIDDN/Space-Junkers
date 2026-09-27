import { TILE } from '../../engine/config';
import type { TileMap } from './tilemap';

const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
] as const;

/**
 * A* over the tile grid (8-way, no corner cutting). Returns world-space waypoints
 * at tile centres, excluding the start tile. Empty array if unreachable.
 */
export function findPath(map: TileMap, sx: number, sy: number, gx: number, gy: number, maxNodes = 8000): { x: number; y: number }[] {
  const w = map.width;
  const start = Math.floor(sy / TILE) * w + Math.floor(sx / TILE);
  const gtx = Math.floor(gx / TILE);
  const gty = Math.floor(gy / TILE);
  const goal = gty * w + gtx;
  if (!map.isPassable(gtx, gty)) return [];
  if (start === goal) return [];

  const g = new Map<number, number>([[start, 0]]);
  const came = new Map<number, number>();
  const open = new MinHeap();
  open.push(start, 0);
  const closed = new Set<number>();
  const h = (i: number) => {
    const dx = Math.abs((i % w) - gtx);
    const dy = Math.abs(Math.floor(i / w) - gty);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };

  while (open.size && closed.size < maxNodes) {
    const i = open.pop();
    if (i === goal) return reconstruct(came, i, w);
    if (closed.has(i)) continue;
    closed.add(i);
    const x = i % w;
    const y = Math.floor(i / w);
    for (const [dx, dy, cost] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.isPassable(nx, ny)) continue;
      if (dx !== 0 && dy !== 0 && (!map.isPassable(x + dx, y) || !map.isPassable(x, y + dy))) continue;
      const ni = ny * w + nx;
      const ng = (g.get(i) ?? 0) + cost;
      if (ng < (g.get(ni) ?? Infinity)) {
        g.set(ni, ng);
        came.set(ni, i);
        open.push(ni, ng + h(ni));
      }
    }
  }
  return [];
}

function reconstruct(came: Map<number, number>, end: number, w: number) {
  const out: { x: number; y: number }[] = [];
  let cur: number | undefined = end;
  while (cur !== undefined && came.has(cur)) {
    out.push({ x: (cur % w) * TILE + TILE / 2, y: Math.floor(cur / w) * TILE + TILE / 2 });
    cur = came.get(cur);
  }
  return out.reverse();
}

/** Binary min-heap of node indices keyed by f-score. */
class MinHeap {
  private ids: number[] = [];
  private keys: number[] = [];

  get size(): number {
    return this.ids.length;
  }

  push(id: number, key: number): void {
    const ids = this.ids;
    const keys = this.keys;
    let i = ids.length;
    ids.push(id);
    keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p];
      keys[i] = keys[p];
      i = p;
    }
    ids[i] = id;
    keys[i] = key;
  }

  pop(): number {
    const ids = this.ids;
    const keys = this.keys;
    const top = ids[0];
    const lastId = ids.pop()!;
    const lastKey = keys.pop()!;
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && keys[r] < keys[l] ? r : l;
        if (keys[c] >= lastKey) break;
        ids[i] = ids[c];
        keys[i] = keys[c];
        i = c;
      }
      ids[i] = lastId;
      keys[i] = lastKey;
    }
    return top;
  }
}
