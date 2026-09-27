import { describe, expect, it } from 'vitest';
import { gridValue } from '../core/inventory';
import { Rng } from '../engine/rng';
import { CONTAINERS, rollContainer } from './loot';

/** Average value of a container type over many rolls. */
function avg(type: string, risk: number, rich = 0): number {
  let v = 0;
  for (let i = 0; i < 400; i++) v += gridValue(rollContainer(new Rng(1000 + i), CONTAINERS[type], risk, {}, rich));
  return v / 400;
}

describe('loot scaling', () => {
  it('deeper rooms pay better than the landing zone', () => {
    expect(avg('box_olive', 1)).toBeGreaterThan(avg('box_olive', 0) * 1.2);
  });
  it('richer worlds pay better for the same container', () => {
    expect(avg('box_olive', 0.5, 0.9)).toBeGreaterThan(avg('box_olive', 0.5) * 1.4);
  });
  it('never rolls keycards (they are placed, bought or earned)', () => {
    for (let i = 0; i < 300; i++) {
      const g = rollContainer(new Rng(i), CONTAINERS.case_red, 1.5, {}, 1);
      expect(g.items.some((p) => p.item.id === 'keycard')).toBe(false);
    }
  });
});
