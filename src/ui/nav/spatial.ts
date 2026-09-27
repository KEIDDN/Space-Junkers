/**
 * Directional focus: given where focus is and a direction, which of the candidates is
 * "next". Pure geometry so it can be tested without a DOM.
 */

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

const cx = (b: Box) => (b.left + b.right) / 2;
const cy = (b: Box) => (b.top + b.bottom) / 2;

/**
 * Index of the best candidate in direction `dir`, or -1. Prefers things that line up
 * with the current box (same row for left/right, same column for up/down), then the
 * nearest edge, then the closest centre.
 */
export function pickNext(from: Box, cands: readonly Box[], dir: Dir): number {
  const horizontal = dir === 'left' || dir === 'right';
  const sign = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = -1;
  let bestScore = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const along = horizontal ? (cx(c) - cx(from)) * sign : (cy(c) - cy(from)) * sign;
    if (along <= 2) continue;
    // Gap between the facing edges (negative when they overlap along the axis).
    const gap = horizontal
      ? sign > 0 ? c.left - from.right : from.left - c.right
      : sign > 0 ? c.top - from.bottom : from.top - c.bottom;
    // Overlap on the other axis: positive when they share a row (or column).
    const overlap = horizontal
      ? Math.min(from.bottom, c.bottom) - Math.max(from.top, c.top)
      : Math.min(from.right, c.right) - Math.max(from.left, c.left);
    const off = overlap > 0 ? 0 : -overlap;
    const centreOff = horizontal ? Math.abs(cy(c) - cy(from)) : Math.abs(cx(c) - cx(from));
    const score = Math.max(0, gap) + off * 3 + (overlap > 0 ? 0 : 80) + centreOff * 0.15;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

/** Reading order (top to bottom, then left to right), for picking a first focus. */
export function readingOrder(a: Box, b: Box): number {
  const rowA = Math.round(a.top / 12);
  const rowB = Math.round(b.top / 12);
  return rowA !== rowB ? rowA - rowB : a.left - b.left;
}

/** Nearest box to a point (for re-homing focus when its element disappears). */
export function nearestTo(x: number, y: number, cands: readonly Box[]): number {
  let best = -1;
  let bd = Infinity;
  for (let i = 0; i < cands.length; i++) {
    const d = Math.hypot(cx(cands[i]) - x, cy(cands[i]) - y);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}
