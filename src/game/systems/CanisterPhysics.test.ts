import { describe, expect, it } from 'vitest';
import { computeCanisterRest } from './CanisterPhysics';

function fixedRng(value: number): () => number {
  return () => value;
}

describe('computeCanisterRest', () => {
  const treeX = 400;
  const treeY = 360;
  const auraRadius = 220; // AURA_RADIUS_BASE
  const barrenRadius = auraRadius + 120; // + BARREN_MARGIN

  it('ejects toward the tree and never settles inside the barren radius', () => {
    const rest = computeCanisterRest(
      1200,
      360,
      treeX,
      treeY,
      auraRadius,
      fixedRng(0.99),
    );
    const restDist = Math.hypot(rest.x - treeX, rest.y - treeY);
    expect(restDist).toBeGreaterThanOrEqual(barrenRadius - 0.01);
  });

  it('clamps travel so a kill just outside the barren edge barely moves', () => {
    const killDist = barrenRadius + 10;
    const rest = computeCanisterRest(
      treeX + killDist,
      treeY,
      treeX,
      treeY,
      auraRadius,
      fixedRng(0.5),
    );
    expect(rest.travelPx).toBeCloseTo(10, 0);
  });

  it('travel distance is deterministic for a fixed rng value', () => {
    const a = computeCanisterRest(1200, 360, treeX, treeY, auraRadius, fixedRng(0.5));
    const b = computeCanisterRest(1200, 360, treeX, treeY, auraRadius, fixedRng(0.5));
    expect(a).toEqual(b);
  });

  it('ejects in a uniformly random direction when the kill is within 40px of the tree', () => {
    const rest = computeCanisterRest(
      treeX + 5,
      treeY,
      treeX,
      treeY,
      auraRadius,
      fixedRng(0.25),
    );
    expect(Number.isFinite(rest.x)).toBe(true);
    expect(Number.isFinite(rest.y)).toBe(true);
  });

  it('never divides by zero when the kill lands exactly on the tree', () => {
    const rest = computeCanisterRest(
      treeX,
      treeY,
      treeX,
      treeY,
      auraRadius,
      fixedRng(0.1),
    );
    expect(Number.isFinite(rest.x)).toBe(true);
    expect(Number.isFinite(rest.y)).toBe(true);
  });

  it('duration scales with travel distance and is always positive', () => {
    const near = computeCanisterRest(
      treeX + barrenRadius + 10,
      treeY,
      treeX,
      treeY,
      auraRadius,
      fixedRng(0.5),
    );
    const far = computeCanisterRest(1200, 360, treeX, treeY, auraRadius, fixedRng(0.5));
    expect(near.durationMs).toBeGreaterThan(0);
    expect(far.durationMs).toBeGreaterThan(near.durationMs);
  });

  it('moves the barren boundary outward when the live aura radius grows', () => {
    // Wider Canopy: +30px per delta spec's widerCanopyAuraRadiusPx.
    const widerAuraRadius = 250;
    const killDist = auraRadius + 120 + 10; // 10px past the OLD barren edge
    const rest = computeCanisterRest(
      treeX + killDist,
      treeY,
      treeX,
      treeY,
      widerAuraRadius,
      fixedRng(0.99),
    );
    const restDist = Math.hypot(rest.x - treeX, rest.y - treeY);
    // With the wider aura, the new barren radius (250 + 120 = 370) is
    // farther out than the kill point itself (220+120+10 = 350), so the
    // canister cannot travel toward the tree at all -- it must rest at
    // (or very near) its spawn point.
    expect(restDist).toBeGreaterThanOrEqual(killDist - 0.01);
  });
});
