/**
 * Every balance constant for "For a Tree".
 *
 * Sources: docs/For_a_Tree_SRS.md v2.0, and
 * docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md,
 * which is a delta against it and wins where the two disagree.
 *
 * No other module may contain a balance literal.
 */

/** Fixed design resolution. SRS 2.3. */
export const ARENA = { width: 1280, height: 720 } as const;

/** Tree anchor and player spawn. SRS 2.3. */
export const TREE_POS = { x: 400, y: 360 } as const;

/** Aura radius before draft cards. SRS 3.2. */
export const AURA_RADIUS_BASE = 220;

/** Barren zone extends this far past the aura. Delta spec 4. */
export const BARREN_MARGIN = 120;

/** Tethered growth stops here; catalysts only past it. Delta spec 2. */
export const GROWTH_CEILING = 60;

/** Percent per second of tethered growth at generation 0. SRS 3.2. */
export const GROWTH_RATE_BASE = 1.2;

/** Additive growth multiplier gained per Generation. SRS 3.2. */
export const GROWTH_PER_GENERATION = 0.06;

/** Percent per second lost while decaying. Flat, never scales. SRS 3.2. */
export const DECAY_RATE = 0.6;

/** Grace budget in seconds, and its tethered refill rate. Delta spec 5. */
export const GRACE_MAX = 1.0;
export const GRACE_REFILL_RATE = 0.5;

/** Player entity. SRS 3.1. */
export const PLAYER = {
  maxHp: 100,
  moveSpeed: 220,
  invulnMs: 500,
  flickerHz: 12,
  radius: 20,
} as const;

/** Dash. Delta spec 3. */
export const DASH = {
  distance: 180,
  durationMs: 150,
  cooldownMs: 1600,
} as const;

/** Catalyst carry. SRS 3.3. */
export const CARRY = {
  capacityBase: 3,
  speedPenaltyPer: 0.05,
  speedPenaltyMax: 0.15,
} as const;

/** W-01 Kinetic Carbine. SRS 4.1, 4.2. */
export const CARBINE = {
  damage: 22,
  fireRatePerSec: 4.0,
  magSize: 24,
  reloadMs: 1100,
  reserveCap: 240,
  regenPerSec: 8.0,
  bulletSpeed: 900,
  knockback: 60,
  bulletRadius: 6,
} as const;

/** E-01 Dune Swarmer. SRS 4.3. */
export const SWARMER = {
  speed: 180,
  hp: 25,
  melee: 6,
  threat: 1,
  meleeCooldownMs: 800,
  radius: 18,
} as const;

/** High-frequency bus events emit at 10 Hz. SRS 2.2. */
export const TICK_INTERVAL_MS = 100;
