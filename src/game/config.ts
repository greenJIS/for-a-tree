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
export const TREE_POS = { x: 640, y: 360 } as const;

/** Aura radius before draft cards. SRS 3.2. */
export const AURA_RADIUS_BASE = 220;

/** Barren zone extends this far past the aura. Delta spec 4. */
export const BARREN_MARGIN = 120;

/** Distance from player center to the gun muzzle, used for bullet spawn and muzzle-flash
 * placement so both originate from the same point. */
export const MUZZLE_OFFSET = 24;

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
  speed: 55,
  hp: 25,
  melee: 6,
  threat: 1,
  radius: 18,
} as const;

/** Universal per-enemy melee cadence. SRS 3.1 — applies to every mutant, not just the Swarmer. */
export const MELEE_COOLDOWN_MS = 800;

/** E-02 Carapace Brute. SRS 4.3. */
export const BRUTE = {
  speed: 25,
  hp: 120,
  melee: 20,
  threat: 4,
  ballisticReduction: 0.25,
  displaySize: 48,
} as const;

/** E-03 Bio-Detonator. SRS 4.3. */
export const DETONATOR = {
  speed: 40,
  hp: 35,
  melee: 40,
  threat: 2,
  lockRangePx: 45,
  telegraphMs: 600,
  explosionRadiusPx: 70,
  displaySize: 40,
} as const;

/** Spawn director. SRS 5.1. */
export const DIRECTOR = {
  baseThreat: 3,
  threatPerSec: 1 / 6,
  maxSpawnsPerSecond: 2,
  unlockAtSec: {
    swarmer: 0,
    detonator: 45,
    brute: 90,
  },
  hpRampPer60s: 0.1,
  dmgRampPer60s: 0.06,
} as const;

/** Pity-weighted drop system. SRS 3.5. */
export const PITY = {
  baseProbability: 0.2,
  probabilityPerMiss: 0.15,
  tierWeights: {
    silt: 60,
    nitrate: 30,
    phyto: 10,
  },
} as const;

/** Maturity granted per catalyst tier on delivery. SRS 4.4. */
export const CATALYST_VALUE = {
  silt: 5,
  nitrate: 10,
  phyto: 20,
} as const;

/** Canister ejection, magnet, and lifetime. SRS 3.6, clamped by delta spec 4's barren zone. */
export const CANISTER = {
  ejectSpeedMin: 450,
  ejectSpeedMax: 600,
  drag: 300,
  nearTreeThresholdPx: 40,
  nearTreeEjectSpeedMin: 150,
  nearTreeEjectSpeedMax: 250,
  lifetimeMs: 15000,
  despawnWarnMs: 4000,
  despawnFlashHz: 8,
  magnetRadius: 90,
  magnetPullSpeed: 500,
  displaySize: 24,
} as const;

/** High-frequency bus events emit at 10 Hz. SRS 2.2. */
export const TICK_INTERVAL_MS = 100;

export const SCATTER = {
  damage: 10,
  pelletCount: 6,
  spreadAngleRad: (28 * Math.PI) / 180,
  fireRatePerSec: 1.1,
  magSize: 6,
  reloadMs: 1600,
  reserveCap: 48,
  regenPerSec: 1.2,
  bulletSpeed: 750,
  knockback: 220,
} as const;

export const RAIL = {
  damage: 120,
  fireRatePerSec: 0.8,
  magSize: 3,
  reloadMs: 2000,
  reserveCap: 24,
  regenPerSec: 0.4,
  bulletSpeed: 1600,
  knockback: 0,
} as const;

export const AEGIS = {
  capacityBase: 1,
  capacitySecondWind: 2,
  durationMs: 8000,
  retaliationDps: 80,
  knockback: 250,
} as const;

export const SCORE = {
  perKill: 50,
  perHalfMinute: 250,
  perGeneration: 2500,
  perCatalystDelivered: 25,
  storageKey: 'foratree.highscore',
} as const;

export const UPGRADE_EFFECTS = {
  deepRootsTetherGrowthPerCopy: 0.15,
  heartwoodDecayFactorPerCopy: 0.6,
  widerCanopyAuraRadiusPx: 30,
  munitionsLoomRegenMultPerCopy: 1.4,
  hollowPointDamageMultPerCopy: 0.15,
  kineticDampersMaxHpBonus: 25,
  nanoSutureMoveSpeedBonus: 0.08,
  nanoSutureHealHp: 50,
  vacuumCoilsMagnetMult: 2,
  vacuumCoilsCarryCap: 5,
  rhizomeSpliceCatalystBonus: 0.25,
  secondWindAegisCap: 2,
  bioSurgeMaturityPct: 30,
} as const;

export type UpgradeCardDef = {
  id: string;
  name: string;
  body: string;
  effect: string;
  repeatable: boolean;
};

export const UPGRADE_CARDS: readonly UpgradeCardDef[] = [
  {
    id: 'bio-surge',
    name: 'Bio-Surge',
    body: '+30% tree maturity immediately.',
    effect: 'instant-maturity',
    repeatable: true,
  },
  {
    id: 'deep-roots',
    name: 'Deep Roots',
    body: 'Tethered growth rate +15%.',
    effect: 'tether-growth',
    repeatable: true,
  },
  {
    id: 'heartwood',
    name: 'Heartwood',
    body: 'Untethered decay rate -40%.',
    effect: 'decay-reduction',
    repeatable: true,
  },
  {
    id: 'wider-canopy',
    name: 'Wider Canopy',
    body: 'Aura radius +30 px.',
    effect: 'aura-radius',
    repeatable: true,
  },
  {
    id: 'munitions-loom',
    name: 'Munitions Loom',
    body: 'Ammunition regen rate x1.4.',
    effect: 'ammo-regen',
    repeatable: true,
  },
  {
    id: 'hollow-point',
    name: 'Hollow-Point',
    body: 'All weapon damage +15%.',
    effect: 'weapon-damage',
    repeatable: true,
  },
  {
    id: 'kinetic-dampers',
    name: 'Kinetic Dampers',
    body: 'Max HP +25 and heal to full.',
    effect: 'max-hp',
    repeatable: true,
  },
  {
    id: 'nano-suture-kit',
    name: 'Nano-Suture Kit',
    body: 'Restore 50 HP, move speed +8%.',
    effect: 'heal-speed',
    repeatable: true,
  },
  {
    id: 'vacuum-coils',
    name: 'Vacuum Coils',
    body: 'Magnet radius x2, carry capacity to 5.',
    effect: 'magnet-carry',
    repeatable: false,
  },
  {
    id: 'scatter-requisition',
    name: 'Scatter Requisition',
    body: 'Unlock Scatter Pulser, fill reserve.',
    effect: 'unlock-scatter',
    repeatable: false,
  },
  {
    id: 'rail-requisition',
    name: 'Rail Requisition',
    body: 'Unlock Mag-Rail Staker, fill reserve.',
    effect: 'unlock-rail',
    repeatable: false,
  },
  {
    id: 'second-wind',
    name: 'Second Wind',
    body: 'Aegis battery capacity to 2.',
    effect: 'aegis-capacity',
    repeatable: false,
  },
  {
    id: 'rhizome-splice',
    name: 'Rhizome Splice',
    body: 'Catalyst values +25%.',
    effect: 'catalyst-value',
    repeatable: true,
  },
] as const;
