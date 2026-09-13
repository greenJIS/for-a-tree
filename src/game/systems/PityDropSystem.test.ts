import { describe, expect, it } from 'vitest';
import { PityDropSystem } from './PityDropSystem';

function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('PityDropSystem', () => {
  it('drops at the base 20% rate on the first kill', () => {
    // Two rng calls per roll: one for the drop check, one for the tier
    // roll (only consumed if the drop check succeeds).
    const dropsAt19 = new PityDropSystem(scriptedRng([0.19, 0]));
    expect(dropsAt19.rollOnKill()).not.toBeNull();

    const missesAt20 = new PityDropSystem(scriptedRng([0.2]));
    expect(missesAt20.rollOnKill()).toBeNull();
  });

  it('increases drop probability by 15% per consecutive miss', () => {
    const system = new PityDropSystem(scriptedRng([0.99]));
    expect(system.rollOnKill()).toBeNull(); // n=0 -> P=0.20, misses
    expect(system.missStreak).toBe(1);

    // n=1 -> P=0.35. A roll of 0.34 should now drop where it wouldn't at n=0.
    const system2 = new PityDropSystem(scriptedRng([0.99, 0.34, 0]));
    system2.rollOnKill(); // miss, n -> 1
    expect(system2.rollOnKill()).not.toBeNull();
  });

  it('guarantees a drop on the 7th consecutive miss', () => {
    // P(6) = min(1, 0.20 + 0.15*6) = 1.10 -> clamped to 1.0, so even a
    // roll of 0.999999 must drop on the 7th kill after 6 misses.
    const rolls = [0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.999999, 0];
    const system = new PityDropSystem(scriptedRng(rolls));
    for (let i = 0; i < 6; i += 1) expect(system.rollOnKill()).toBeNull();
    expect(system.missStreak).toBe(6);
    expect(system.rollOnKill()).not.toBeNull();
  });

  it('resets the miss streak to 0 on any drop', () => {
    const system = new PityDropSystem(scriptedRng([0.99, 0, 0]));
    system.rollOnKill(); // miss, n -> 1
    system.rollOnKill(); // drop, n -> 0
    expect(system.missStreak).toBe(0);
  });

  it('rolls tiers by weight: 60 silt, 30 nitrate, 10 phyto', () => {
    // Tier roll consumes a [0,1) value against cumulative weights
    // silt [0, 0.6), nitrate [0.6, 0.9), phyto [0.9, 1.0).
    const silt = new PityDropSystem(scriptedRng([0, 0.1]));
    expect(silt.rollOnKill()).toBe('silt');

    const nitrate = new PityDropSystem(scriptedRng([0, 0.65]));
    expect(nitrate.rollOnKill()).toBe('nitrate');

    const phyto = new PityDropSystem(scriptedRng([0, 0.95]));
    expect(phyto.rollOnKill()).toBe('phyto');
  });
});
