import { describe, expect, it } from 'vitest';
import { applyScaleTier, SCALE_TIERS } from './scale';

describe('applyScaleTier', () => {
  it('lists the four menu tiers in ascending order', () => {
    expect(SCALE_TIERS).toEqual([0.75, 1, 1.5, 2]);
  });

  it('reproduces the shipped value exactly at tier 2 (today\'s default)', () => {
    expect(applyScaleTier(100, 2)).toBe(100);
    expect(applyScaleTier(90, 2)).toBe(90);
  });

  it('halves the shipped value at tier 1', () => {
    expect(applyScaleTier(100, 1)).toBe(50);
  });

  it('scales proportionally at 0.75 and 1.5', () => {
    expect(applyScaleTier(100, 0.75)).toBe(37.5);
    expect(applyScaleTier(100, 1.5)).toBe(75);
  });

  it('scales the tree phase sizes from config', () => {
    expect(applyScaleTier(400, 2)).toBe(400);
    expect(applyScaleTier(400, 1)).toBe(200);
  });
});
