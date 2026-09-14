/**
 * Display-scale tiers for the secret debug menu. Shipped `displaySize` /
 * `TREE.phaseSizes` values in config.ts are the reference point and
 * correspond to tier 2 -- see
 * docs/superpowers/specs/2026-09-14-secret-debug-menu-design.md.
 */

export const SCALE_TIERS = [0.75, 1, 1.5, 2] as const;
export type ScaleTier = (typeof SCALE_TIERS)[number];

export function applyScaleTier(shippedValue: number, tier: ScaleTier): number {
  return shippedValue * (tier / 2);
}
