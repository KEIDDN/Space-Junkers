import { describe, expect, it } from 'vitest';
import { createItem } from '../../core/inventory';
import { effectText, itemCondition, itemCount } from './readout';

describe('item tile readout: the count is units, never power', () => {
  it('Medkit ×2 reads ×2, and says HEALS 60 HP elsewhere', () => {
    const kit = createItem('carkit', { qty: 2 });
    expect(itemCount(kit)).toBe('×2');
    expect(itemCondition(kit)).toBeNull();
    expect(effectText('carkit')).toContain('HEALS 60 HP');
  });

  it('using one leaves ×1, not ×59', () => {
    const kit = createItem('carkit', { qty: 2 });
    expect(itemCount({ ...kit, qty: kit.qty - 1 })).toBe('×1');
  });

  it('bandages and ammunition count units too', () => {
    expect(itemCount(createItem('bandage', { qty: 5 }))).toBe('×5');
    expect(itemCount(createItem('ammo_545', { qty: 40 }))).toBe('×40');
  });

  it('non-stacking things show condition, never a count', () => {
    const gun = createItem('pm9', { loaded: 4 });
    expect(itemCount(gun)).toBeNull();
    expect(itemCondition(gun)!.text).toBe('4/9');
    const vest = createItem('vest_ps2', { dur: 25 });
    expect(itemCount(vest)).toBeNull();
    expect(itemCondition(vest)!.frac).toBeCloseTo(0.5);
    expect(itemCondition(vest)!.text).toBeUndefined();
    // Keycard uses are pips, so "3" can't be read as three keycards.
    const card = createItem('keycard', { dur: 2 });
    expect(itemCount(card)).toBeNull();
    expect(itemCondition(card)!.text).toBe('▮▮▯');
  });
});
