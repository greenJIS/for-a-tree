import { beforeEach, describe, expect, it } from 'vitest';
import { TreeSystem } from './TreeSystem';

describe('TreeSystem', () => {
  let tree: TreeSystem;

  beforeEach(() => {
    tree = new TreeSystem();
  });

  it('starts at zero maturity, generation zero, phase one', () => {
    expect(tree.maturityPct).toBe(0);
    expect(tree.generation).toBe(0);
    expect(tree.phase).toBe(1);
  });

  it('grows at 1.2 %/s while tethered at generation zero', () => {
    tree.update(1.0, 'tethered');
    expect(tree.maturityPct).toBeCloseTo(1.2);
  });

  it('does not grow during grace', () => {
    tree.update(1.0, 'grace');
    expect(tree.maturityPct).toBe(0);
  });

  it('decays at 0.6 %/s while decaying', () => {
    tree.deliver(10);
    tree.update(1.0, 'decaying');
    expect(tree.maturityPct).toBeCloseTo(9.4);
  });

  it('floors maturity at zero', () => {
    tree.update(100, 'decaying');
    expect(tree.maturityPct).toBe(0);
  });

  it('stops growing at the 60% ceiling', () => {
    tree.update(1000, 'tethered');
    expect(tree.maturityPct).toBe(60);
    expect(tree.growthRatePerSec).toBe(0);
  });

  it('reaches the ceiling in 50 s at generation zero', () => {
    for (let i = 0; i < 500; i += 1) tree.update(0.1, 'tethered');
    expect(tree.maturityPct).toBeCloseTo(60);
  });

  it('reports an upward ceiling crossing exactly once per crossing', () => {
    let crossings = 0;
    for (let i = 0; i < 600; i += 1) {
      if (tree.update(0.1, 'tethered').stalledCrossing) crossings += 1;
    }
    expect(crossings).toBe(1);
  });

  it('reports a second crossing after decaying back below the ceiling', () => {
    while (tree.maturityPct < 60) tree.update(0.1, 'tethered');
    tree.update(5, 'decaying');
    expect(tree.maturityPct).toBeLessThan(60);
    let crossings = 0;
    for (let i = 0; i < 200; i += 1) {
      if (tree.update(0.1, 'tethered').stalledCrossing) crossings += 1;
    }
    expect(crossings).toBe(1);
  });

  it('only passes the ceiling through delivery', () => {
    tree.update(1000, 'tethered');
    tree.deliver(20);
    expect(tree.maturityPct).toBeCloseTo(80);
  });

  it('triggers a Generation at 100% and carries the remainder over', () => {
    tree.update(1000, 'tethered');
    const result = tree.deliver(50);
    expect(result.generationTriggered).toBe(true);
    expect(tree.generation).toBe(1);
    expect(tree.maturityPct).toBeCloseTo(10);
  });

  it('triggers at most one Generation per delivery', () => {
    tree.update(1000, 'tethered');
    const result = tree.deliver(150);
    expect(result.generationTriggered).toBe(true);
    expect(tree.generation).toBe(1);
    expect(tree.maturityPct).toBeCloseTo(110);
  });

  it('reports a fresh ceiling crossing when an overflowing delivery lands above it', () => {
    tree.update(1000, 'decaying');
    tree.deliver(40);
    expect(tree.maturityPct).toBeCloseTo(40);

    const result = tree.deliver(130);

    expect(result.generationTriggered).toBe(true);
    expect(tree.generation).toBe(1);
    expect(tree.maturityPct).toBeCloseTo(70);
    expect(result.stalledCrossing).toBe(true);
  });

  it('raises the growth rate 6% per generation', () => {
    tree.update(1000, 'tethered');
    tree.deliver(40);
    expect(tree.generation).toBe(1);
    expect(tree.growthRatePerSec).toBeCloseTo(1.272);
  });

  it('maps maturity to phase on half-open intervals', () => {
    expect(tree.phase).toBe(1);
    tree.deliver(25);
    expect(tree.phase).toBe(2);
    tree.deliver(40);
    expect(tree.phase).toBe(3);
    tree.deliver(35);
    // 100 exactly triggers a Generation and wraps to 0, so Phase 4 is
    // momentary and observed via generationTriggered, not via phase.
    expect(tree.generation).toBe(1);
    expect(tree.phase).toBe(1);
  });

  it('resets fully', () => {
    tree.update(1000, 'tethered');
    tree.deliver(50);
    tree.reset();
    expect(tree.maturityPct).toBe(0);
    expect(tree.generation).toBe(0);
    expect(tree.phase).toBe(1);
  });
});
