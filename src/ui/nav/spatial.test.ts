import { describe, expect, it } from 'vitest';
import { nearestTo, pickNext, readingOrder, type Box } from './spatial';

const b = (left: number, top: number, w = 100, h = 30): Box => ({ left, top, right: left + w, bottom: top + h });

describe('spatial focus', () => {
  it('walks a vertical list', () => {
    const list = [b(0, 0), b(0, 40), b(0, 80)];
    expect(pickNext(list[0], list, 'down')).toBe(1);
    expect(pickNext(list[1], list, 'down')).toBe(2);
    expect(pickNext(list[2], list, 'down')).toBe(-1);
    expect(pickNext(list[2], list, 'up')).toBe(1);
  });

  it('stays in the row in a grid', () => {
    const grid: Box[] = [];
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) grid.push(b(x * 40, y * 40, 40, 40));
    // From (1,1): right is (2,1), down is (1,2).
    expect(pickNext(grid[5], grid, 'right')).toBe(6);
    expect(pickNext(grid[5], grid, 'down')).toBe(9);
    expect(pickNext(grid[5], grid, 'left')).toBe(4);
    expect(pickNext(grid[5], grid, 'up')).toBe(1);
  });

  it('crosses to the neighbouring panel at the same height', () => {
    const left = [b(0, 0, 100, 30), b(0, 200, 100, 30)];
    const right = [b(300, 10, 100, 30), b(300, 190, 100, 30)];
    const all = [...left, ...right];
    expect(pickNext(left[1], all, 'right')).toBe(3);
    expect(pickNext(left[0], all, 'right')).toBe(2);
  });

  it('prefers what lines up over what is merely close', () => {
    const from = b(0, 0, 100, 30);
    const offAxisClose = b(120, 60, 40, 30);
    const inRowFar = b(260, 0, 40, 30);
    expect(pickNext(from, [offAxisClose, inRowFar], 'right')).toBe(1);
  });

  it('orders by rows then columns, and finds the nearest', () => {
    const boxes = [b(200, 5), b(0, 0), b(0, 50)];
    expect([...boxes].sort(readingOrder)[0]).toBe(boxes[1]);
    expect(nearestTo(40, 70, boxes)).toBe(2);
    expect(nearestTo(240, 10, boxes)).toBe(0);
  });
});
