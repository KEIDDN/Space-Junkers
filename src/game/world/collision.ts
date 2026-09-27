import { TILE } from '../../engine/config';
import type { TileMap } from './tilemap';

/**
 * Move a circle through the tile map, sliding along walls.
 * Resolves X then Y so diagonal movement against a wall keeps its parallel component.
 */
export function moveCircle(
  map: TileMap,
  pos: { x: number; y: number },
  r: number,
  dx: number,
  dy: number,
): void {
  // Sub-step large moves (knockback, frame spikes) so nothing tunnels through walls.
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / (r * 0.9)));
  for (let i = 0; i < steps; i++) {
    pos.x += dx / steps;
    resolve(map, pos, r, true);
    pos.y += dy / steps;
    resolve(map, pos, r, false);
  }
}

function resolve(map: TileMap, pos: { x: number; y: number }, r: number, horizontal: boolean): void {
  const minTx = Math.floor((pos.x - r) / TILE);
  const maxTx = Math.floor((pos.x + r) / TILE);
  const minTy = Math.floor((pos.y - r) / TILE);
  const maxTy = Math.floor((pos.y + r) / TILE);
  for (let ty = minTy; ty <= maxTy; ty++) {
    for (let tx = minTx; tx <= maxTx; tx++) {
      if (!map.isSolid(tx, ty)) continue;
      const left = tx * TILE;
      const top = ty * TILE;
      // Closest point on the tile rect to the circle centre
      const cx = Math.max(left, Math.min(pos.x, left + TILE));
      const cy = Math.max(top, Math.min(pos.y, top + TILE));
      const ox = pos.x - cx;
      const oy = pos.y - cy;
      const d2 = ox * ox + oy * oy;
      if (d2 >= r * r) continue;
      if (d2 > 1e-9) {
        // Push out along the contact normal, restricted to the axis being resolved
        // (keeps sliding along walls smooth, and corners are rounded).
        const d = Math.sqrt(d2);
        const push = r - d;
        if (horizontal) pos.x += (ox / d) * push;
        else pos.y += (oy / d) * push;
      } else if (horizontal) {
        // Centre inside the tile: push out on the shallow side.
        pos.x = pos.x - left < TILE / 2 ? left - r : left + TILE + r;
      } else {
        pos.y = pos.y - top < TILE / 2 ? top - r : top + TILE + r;
      }
    }
  }
}

export interface RayHit {
  /** 0..1 along the segment where the first solid tile was entered. */
  t: number;
  x: number;
  y: number;
  /** Surface normal of the face that was hit. */
  nx: number;
  ny: number;
}

/**
 * Tile-grid raycast (DDA). Returns the first solid tile hit along the segment, or null.
 */
export function raycast(map: TileMap, x0: number, y0: number, x1: number, y1: number): RayHit | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let tx = Math.floor(x0 / TILE);
  let ty = Math.floor(y0 / TILE);
  if (map.isSolid(tx, ty)) return { t: 0, x: x0, y: y0, nx: -Math.sign(dx), ny: -Math.sign(dy) };

  const stepX = dx > 0 ? 1 : -1;
  const stepY = dy > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(TILE / dx) : Infinity;
  const tDeltaY = dy !== 0 ? Math.abs(TILE / dy) : Infinity;
  let tMaxX = dx !== 0 ? ((dx > 0 ? (tx + 1) * TILE : tx * TILE) - x0) / dx : Infinity;
  let tMaxY = dy !== 0 ? ((dy > 0 ? (ty + 1) * TILE : ty * TILE) - y0) / dy : Infinity;

  for (;;) {
    let t: number;
    let nx = 0;
    let ny = 0;
    if (tMaxX < tMaxY) {
      t = tMaxX;
      tMaxX += tDeltaX;
      tx += stepX;
      nx = -stepX;
    } else {
      t = tMaxY;
      tMaxY += tDeltaY;
      ty += stepY;
      ny = -stepY;
    }
    if (t > 1) return null;
    if (map.isSolid(tx, ty)) return { t, x: x0 + dx * t, y: y0 + dy * t, nx, ny };
  }
}

export function hasLineOfSight(map: TileMap, x0: number, y0: number, x1: number, y1: number): boolean {
  return raycast(map, x0, y0, x1, y1) === null;
}

/**
 * Segment vs circle. Returns the entry t (0..1) or -1 if no hit.
 */
export function segmentCircle(
  x0: number, y0: number, x1: number, y1: number,
  cx: number, cy: number, r: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // starts inside
  if (a === 0) return -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
