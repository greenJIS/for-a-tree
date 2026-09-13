import { describe, expect, it } from 'vitest';
import { computeCanisterRest } from './CanisterPhysics';

function fixedRng(value: number): () => number {
  return () => value;
}

describe('computeCanisterRest', () => {
  const treeX = 400;
  const treeY = 360;
  const barrenRadius = 220 + 120; // AURA_RADIUS_BASE + BARREN_MARGIN

  it('ejects toward the tree and never settles inside the barren radius', () => {
    // A kill far out at (1200, 360): homeDist = 800, well past the barren
    // radius of 340. Even at max ejection speed the rest point must not
    // cross into the barren circle.
    const rest = computeCanisterRest(1200, 360, treeX, treeY, fixedRng(0.99));
    const restDist = Math.hypot(rest.x - treeX, rest.y - treeY);
    expect(restDist).toBeGreaterThanOrEqual(barrenRadius - 0.01);
  });

  it('clamps travel so a kill just outside the barren edge barely moves', () => {
    // Kill at exactly barrenRadius + 10 px from the tree: max allowed
    // travel toward the tree is only 10 px, far less than the natural
    // drag-stopping distance at any ejection speed in range.
    const killDist = barrenRadius + 10;
    const rest = computeCanisterRest(
      treeX + killDist,
      treeY,
      treeX,
      treeY,
      fixedRng(0.5),
    );
    expect(rest.travelPx).toBeCloseTo(10, 0);
  });

  it('travel distance is deterministic for a fixed rng value', () => {
    const a = computeCanisterRest(1200, 360, treeX, treeY, fixedRng(0.5));
    const b = computeCanisterRest(1200, 360, treeX, treeY, fixedRng(0.5));
    expect(a).toEqual(b);
  });

  it('ejects in a uniformly random direction when the kill is within 40px of the tree', () => {
    // This branch is unreachable in live play today (the barren zone
    // already excludes kills this close), but is kept for defensiveness
    // per delta spec 4 -- and it avoids a normalize(0,0) NaN.
    const rest = computeCanisterRest(
      treeX + 5,
      treeY,
      treeX,
      treeY,
      fixedRng(0.25),
    );
    expect(Number.isFinite(rest.x)).toBe(true);
    expect(Number.isFinite(rest.y)).toBe(true);
  });

  it('never divides by zero when the kill lands exactly on the tree', () => {
    const rest = computeCanisterRest(treeX, treeY, treeX, treeY, fixedRng(0.1));
    expect(Number.isFinite(rest.x)).toBe(true);
    expect(Number.isFinite(rest.y)).toBe(true);
  });

  it('duration scales with travel distance and is always positive', () => {
    const near = computeCanisterRest(
      treeX + barrenRadius + 10,
      treeY,
      treeX,
      treeY,
      fixedRng(0.5),
    );
    const far = computeCanisterRest(1200, 360, treeX, treeY, fixedRng(0.5));
    expect(near.durationMs).toBeGreaterThan(0);
    expect(far.durationMs).toBeGreaterThan(near.durationMs);
  });
});
