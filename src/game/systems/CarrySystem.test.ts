import { beforeEach, describe, expect, it } from 'vitest';
import { CarrySystem } from './CarrySystem';

describe('CarrySystem', () => {
  let carry: CarrySystem;

  beforeEach(() => {
    carry = new CarrySystem();
  });

  it('starts empty with a full speed multiplier', () => {
    expect(carry.count).toBe(0);
    expect(carry.tiers).toEqual([]);
    expect(carry.speedMultiplier()).toBe(1);
  });

  it('adds catalysts up to the base capacity of 3', () => {
    expect(carry.add('silt')).toBe(true);
    expect(carry.add('nitrate')).toBe(true);
    expect(carry.add('phyto')).toBe(true);
    expect(carry.count).toBe(3);
    expect(carry.add('silt')).toBe(false);
    expect(carry.count).toBe(3);
  });

  it('allows adding up to custom capacity when provided', () => {
    expect(carry.add('silt', 5)).toBe(true);
    expect(carry.add('nitrate', 5)).toBe(true);
    expect(carry.add('phyto', 5)).toBe(true);
    expect(carry.add('silt', 5)).toBe(true);
    expect(carry.add('nitrate', 5)).toBe(true);
    expect(carry.count).toBe(5);
    expect(carry.add('phyto', 5)).toBe(false);
    expect(carry.count).toBe(5);
  });

  it('applies a 5% speed penalty per carried catalyst, capped at 15%', () => {
    carry.add('silt');
    expect(carry.speedMultiplier()).toBeCloseTo(0.95);
    carry.add('nitrate');
    expect(carry.speedMultiplier()).toBeCloseTo(0.9);
    carry.add('phyto');
    expect(carry.speedMultiplier()).toBeCloseTo(0.85);
  });

  it('deliverAll sums the correct maturity value and clears the stack', () => {
    carry.add('silt'); // 5
    carry.add('nitrate'); // 10
    carry.add('phyto'); // 20
    const result = carry.deliverAll();
    expect(result).toEqual({ totalPct: 35, count: 3 });
    expect(carry.count).toBe(0);
    expect(carry.speedMultiplier()).toBe(1);
  });

  it('deliverAll on an empty stack returns zero and is a no-op', () => {
    expect(carry.deliverAll()).toEqual({ totalPct: 0, count: 0 });
  });

  it('clear empties the stack without returning a delivery total', () => {
    carry.add('silt');
    carry.clear();
    expect(carry.count).toBe(0);
    expect(carry.speedMultiplier()).toBe(1);
  });
});
