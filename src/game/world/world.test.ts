import { describe, expect, it } from 'vitest';
import { TILE } from '../../engine/config';
import { TEST_RANGE } from '../../data/testRange';
import { hasLineOfSight, moveCircle, raycast, segmentCircle } from './collision';
import { findPath } from './pathfinding';
import { mapFromAscii } from './tilemap';

const room = mapFromAscii([
  '#######',
  '#.....#',
  '#..#..#',
  '#.....#',
  '#######',
]);
const c = (t: number) => t * TILE + TILE / 2;

describe('collision', () => {
  it('stops a circle at a wall and lets it slide along', () => {
    const p = { x: c(1), y: c(1) };
    moveCircle(room, p, 6, -100, 0);
    expect(p.x).toBeCloseTo(TILE + 6);
    moveCircle(room, p, 6, -5, 20);
    expect(p.x).toBeCloseTo(TILE + 6);
    expect(p.y).toBeCloseTo(c(1) + 20);
  });

  it('never ends up inside a solid tile after big moves', () => {
    const p = { x: c(2), y: c(2) };
    for (let i = 0; i < 200; i++) {
      moveCircle(room, p, 6, Math.cos(i) * 25, Math.sin(i * 1.3) * 25);
      expect(room.isSolidAt(p.x, p.y)).toBe(false);
    }
  });

  it('raycast hits the pillar and reports a normal', () => {
    const hit = raycast(room, c(1), c(2), c(5), c(2));
    expect(hit).not.toBeNull();
    expect(hit!.x).toBeCloseTo(3 * TILE);
    expect(hit!.nx).toBe(-1);
    expect(hasLineOfSight(room, c(1), c(1), c(5), c(1))).toBe(true);
  });

  it('segment/circle intersection', () => {
    expect(segmentCircle(0, 0, 100, 0, 50, 0, 5)).toBeCloseTo(0.45);
    expect(segmentCircle(0, 0, 100, 0, 50, 20, 5)).toBe(-1);
  });
});

describe('pathfinding', () => {
  it('routes around obstacles', () => {
    const path = findPath(room, c(1), c(2), c(5), c(2));
    expect(path.length).toBeGreaterThan(0);
    const last = path[path.length - 1];
    expect(last).toEqual({ x: c(5), y: c(2) });
    for (const p of path) expect(room.isSolidAt(p.x, p.y)).toBe(false);
  });

  it('returns empty for unreachable goals', () => {
    expect(findPath(room, c(1), c(1), c(3), c(2))).toEqual([]);
  });
});

describe('test range map', () => {
  const map = mapFromAscii(TEST_RANGE);
  it('has one player spawn and several enemies', () => {
    expect(map.spawns.filter((s) => s.kind === 'player')).toHaveLength(1);
    expect(map.spawns.filter((s) => s.kind === 'scavenger').length).toBeGreaterThanOrEqual(3);
  });
  it('every enemy is reachable from the player spawn', () => {
    const p = map.spawns.find((s) => s.kind === 'player')!;
    for (const e of map.spawns.filter((s) => s.kind !== 'player')) {
      expect(findPath(map, p.x, p.y, e.x, e.y).length).toBeGreaterThan(0);
    }
  });
});
