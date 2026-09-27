import { raycast } from './collision';
import type { TileMap } from './tilemap';

/**
 * Visibility polygon by ray fan: what can be seen/lit from (x, y) within `radius`.
 * Rays are pushed `extend` px into whatever they hit so wall faces get lit.
 * Returns flat [x0, y0, x1, y1, ...] in world coordinates.
 */
export function visibilityPolygon(
  map: TileMap, x: number, y: number, radius: number, rays = 180, extend = 14,
  out: number[] = [],
): number[] {
  out.length = 0;
  for (let i = 0; i < rays; i++) {
    const a = (i / rays) * Math.PI * 2;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hit = raycast(map, x, y, x + dx * radius, y + dy * radius);
    const d = hit ? Math.min(radius, hit.t * radius + extend) : radius;
    out.push(x + dx * d, y + dy * d);
  }
  return out;
}
