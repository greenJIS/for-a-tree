# For a Tree — Sortie Economy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Make the sortie loop real: a spawn director that escalates threat over time, two new enemy
types, pity-weighted catalyst drops that respect the barren zone, canisters that eject, get magnet-pulled,
carried, and delivered into the tree — closing the loop the vertical slice left open (nothing yet calls
`TreeSystem.deliver()`) — plus the ammo economy that makes returning to the tree matter for more than
maturity.

**Architecture:** Same split as Plan 1. Every system with real decision logic (spawn timing/weighting,
pity odds, ammo/reload state, carried-catalyst bookkeeping, canister rest-position math) is a
framework-free class under `src/game/systems/`, unit-tested under Vitest. Phaser-specific code is a thin
adapter that calls into those classes and renders the result. `EnemyPool` is generalized from a
single-kind pool into a multi-kind pool (Swarmer, Carapace Brute, Bio-Detonator) driven by per-instance
data, following the same `getFirstDead`/`isArcadeImage`/`disableBody` pattern already established.

**Tech Stack:** Vite 8, React 19, TypeScript 6 (`strict`), Tailwind CSS v4, Phaser 4, mitt, Vitest.

## Source documents

- `docs/For_a_Tree_SRS.md` v2.0 — authoritative for all numbers not overridden by the delta spec.
- `docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md` — a delta against the SRS,
  wins where the two disagree. Section 4 (the barren zone) governs every canister/pity decision in this
  plan.
- `docs/superpowers/plans/2026-09-13-vertical-slice.md` — Plan 1, already merged into `main`. This plan
  builds directly on its shipped code; file paths and interfaces below reflect what actually exists on
  `main` today, not the plan text.

## What already exists (read before starting Task 1)

- `src/game/config.ts` — `ARENA`, `TREE_POS`, `AURA_RADIUS_BASE=220`, `BARREN_MARGIN=120`,
  `GROWTH_CEILING=60`, `GROWTH_RATE_BASE=1.2`, `GROWTH_PER_GENERATION=0.06`, `DECAY_RATE=0.6`,
  `GRACE_MAX=1.0`, `GRACE_REFILL_RATE=0.5`, `PLAYER` (`maxHp`, `moveSpeed`, `invulnMs=500`, `flickerHz=12`,
  `radius=20`), `DASH`, `CARRY` (`capacityBase=3`, `speedPenaltyPer=0.05`, `speedPenaltyMax=0.15`),
  `CARBINE` (`damage=22`, `fireRatePerSec=4.0`, `magSize=24`, `reloadMs=1100`, `reserveCap=240`,
  `regenPerSec=8.0`, `bulletSpeed=900`, `knockback=60`, `bulletRadius=6`), `SWARMER` (`speed=180`, `hp=25`,
  `melee=6`, `threat=1`, `meleeCooldownMs=800`, `radius=18`), `TICK_INTERVAL_MS=100`.
- `src/game/frames.ts` — `FRAME.brute = 5`, `FRAME.detonator = 6`, `FRAME.canister = 11` already declared
  and pointing at real art; no frame changes needed in this plan.
- `src/game/eventBus.ts` — `AMMO_UPDATED`, `CATALYSTS_CARRIED`, `CATALYSTS_DELIVERED`, `DIFFICULTY_TICK`
  are already declared in `GameEvents` with the exact shapes this plan uses; do not modify this file.
  `GENERATION_REACHED` is also declared but this plan does **not** emit it — see "What this plan
  deliberately leaves out."
- `src/game/systems/TetherSystem.ts` / `TreeSystem.ts` — pure classes, 25 tests, unmodified by this plan
  except that `TreeSystem.deliver(pct: number): TreeUpdate` finally gets a real caller (Task 11).
- `src/game/entities/EnemyPool.ts` — currently Swarmer-only: `spawn(x, y)`, `pursue(targetX, targetY)`,
  static `hp`/`setHp`/`nextMeleeAtMs`/`setNextMeleeAtMs`/`kill` accessors over Phaser `setData`. Task 7
  generalizes this to carry a `kind` per instance.
- `src/game/entities/BulletPool.ts` — pre-allocated pool, `fire(x, y, rotation)`, `cull()`, static `kill`.
  Pattern to follow for `CanisterPool`.
- `src/game/entities/Player.ts` — `sprite`, `x`/`y` getters, `isDashing`, `tryDash`, `update()`. Task 11
  adds a `setSpeedMultiplier(mult: number): void` method and a `#speedMultiplier` field consulted inside
  `update()`'s existing non-dashing velocity branch.
- `src/game/guards.ts` — `isArcadeImage(obj): obj is Phaser.Physics.Arcade.Image`, the only sanctioned
  narrowing for Phaser pool/group values. Reuse it; do not add a second guard.
- `src/game/scenes/ArenaScene.ts` — owns `#player`, `#tether`, `#tree`, `#bullets`, `#enemies`, combat
  state (`#hp`, `#invulnUntilMs`, `#kills`), the fixed 1.5 s spawn timer (`#spawnTimer`,
  `#spawnAtEdge()`), and `#takeMeleeFrom`/`#endRun`. Every task below that touches this file gives the
  implementer the exact surrounding code to change.
- `src/hud/Hud.tsx` composes `DecayVignette`, `HealthBar`, `MaturityGauge`, `TetherBeacon`,
  `GameOverCard` inside a `pointer-events-none` root at `z-20`. New HUD pieces slot into the same file.

## Assumption flagged for explicit confirmation

SRS 5.1 says the spawn director should "pick an unlocked mutant type, **weighted**" but states no
weights. This plan uses **uniform random selection among currently-unlocked types** as the simplest
faithful reading — it is a genuine spec gap, not a judgement call being made silently, and is called out
here rather than buried in a task. If real playtesting later shows this needs biasing (e.g. toward
Swarmers for volume), that is a balance-pass change, not a rework of `SpawnDirector`'s shape.

## Global Constraints

(Unchanged from Plan 1 — repeated here because every task's requirements implicitly include this
section.)

- **No `any`.** `strict: true`. Prefer `unknown` and narrow with type guards. Avoid `as` — the sole
  sanctioned exception is `as const`, and the sole sanctioned narrowing pattern for Phaser objects is
  `isArcadeImage` from `src/game/guards.ts`.
- **Tailwind utilities only.** No CSS files, modules, or CSS-in-JS. Shared tokens go in `@theme` in
  `src/index.css`.
- **React never reads Phaser state directly; Phaser never touches the DOM.** All traffic crosses the bus.
- **`TREE_GROWTH_TICK`, `DIFFICULTY_TICK`, `SCORE_UPDATED` emit at 10 Hz**, not per frame. Every other
  event is edge-triggered — emitted only on actual change. This plan adds emitters for
  `AMMO_UPDATED`, `CATALYSTS_CARRIED`, `CATALYSTS_DELIVERED`, and `DIFFICULTY_TICK`; the first three are
  edge-triggered, the fourth is 10 Hz.
- **Pooling is a requirement, not an optimisation.** Bullets, enemies, and canisters are pooled; target
  zero allocation inside `update` at 60 enemies and 200 projectiles.
- **Prettier defaults** (`printWidth` 80, 2-space, single quotes, trailing commas `all`). Format only the
  files a task touches — never run Prettier on the whole repo; a Plan 1 task found this corrupts other
  files' embedded Markdown code fences.
- **Commit format:** `type(scope): short summary`, blank line, body explaining why. Types: `feat`, `fix`,
  `chore`, `refactor`, `docs`, `test`, `ci`, `build`, `perf`, `style`, `revert`. Never add a
  Claude/Anthropic co-author trailer.
- **Balance literals live only in `config.ts`.** Plan 1's final review found several magic numbers that
  leaked into scene code; every new constant this plan introduces goes into `config.ts`, including
  display sizes for the two new enemy kinds.

## A note on testing strategy

Six new systems in this plan are pure TypeScript with no Phaser dependency: `SpawnDirector`,
`PityDropSystem`, `AmmoSystem`, `CarrySystem`, and `CanisterPhysics`. Each gets real TDD — write the
failing test, watch it fail, make it pass — following the pattern `TetherSystem`/`TreeSystem` already
established. Two of these (`SpawnDirector`, `PityDropSystem`) depend on randomness; both take an injected
`rng: () => number` returning `[0, 1)`, defaulting to `Math.random` in production and a scripted sequence
in tests, so their behaviour is fully deterministic under test.

Phaser wiring tasks (7 through 11) are verified the same way Plan 1's were: a typed build, a lint pass,
and either a hand-trace of the exact logic or a headless-Chrome screenshot with an explicit statement of
what it can and cannot prove — Plan 1's reviews established that `--virtual-time-budget` does not
reliably advance Phaser's scene clock, so anything timing-dependent (spawns, regen, canister lifetime) is
verified by hand-trace, not by screenshot.

## File structure

| File | Responsibility |
| :--- | :------------- |
| `src/game/config.ts` | Modified: adds `BRUTE`, `DETONATOR`, `MELEE_COOLDOWN_MS`, `DIRECTOR`, `PITY`, `CATALYST_VALUE`, `CANISTER`. |
| `src/game/systems/SpawnDirector.ts` | Pure. Threat-budget spawn timing and unlock gating. |
| `src/game/systems/PityDropSystem.ts` | Pure. Drop probability and tier roll. |
| `src/game/systems/AmmoSystem.ts` | Pure. Clip/reserve/reload state for the Carbine. |
| `src/game/systems/CarrySystem.ts` | Pure. Carried-catalyst stack, capacity, speed penalty, delivery total. |
| `src/game/systems/CanisterPhysics.ts` | Pure. Ejection-vector and rest-position math, respecting the barren zone. |
| `src/game/entities/EnemyPool.ts` | Modified: generalized to a `kind`-tagged multi-enemy pool. |
| `src/game/entities/CanisterPool.ts` | New. Pooled canister sprites: eject, magnet-pull, lifetime, despawn flash. |
| `src/game/entities/Player.ts` | Modified: adds `setSpeedMultiplier`. |
| `src/game/scenes/ArenaScene.ts` | Modified: wires all of the above into the frame loop. |
| `src/hud/AmmoReadout.tsx` | New. Bottom-right weapon/magazine/reserve/reload indicator. SRS 6.1. |
| `src/hud/CarriedCatalystPips.tsx` | New. Carried-catalyst pips near the maturity gauge. SRS 6.1. |
| `src/hud/Hud.tsx` | Modified: composes the two new HUD pieces. |

---

### Task 1: Config constants for the sortie economy

**Files:**

- Modify: `src/game/config.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: `BRUTE`, `DETONATOR`, `MELEE_COOLDOWN_MS`, `DIRECTOR`, `PITY`, `CATALYST_VALUE`, `CANISTER` —
  every later task in this plan imports from these.

- [ ] **Step 1: Add the new constants**

Open `src/game/config.ts`. Immediately after the existing `SWARMER` block, insert:

```typescript
/** Universal per-enemy melee cadence. SRS 3.1 — applies to every mutant, not just the Swarmer. */
export const MELEE_COOLDOWN_MS = 800;

/** E-02 Carapace Brute. SRS 4.3. */
export const BRUTE = {
  speed: 75,
  hp: 120,
  melee: 20,
  threat: 4,
  ballisticReduction: 0.25,
  displaySize: 48,
} as const;

/** E-03 Bio-Detonator. SRS 4.3. */
export const DETONATOR = {
  speed: 130,
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/game/config.ts
git add src/game/config.ts
git commit -m "feat(config): add sortie-economy balance constants

Enemy stats, spawn director thresholds, pity odds, catalyst values, and
canister physics -- every number the next ten tasks read from one place."
```

---

### Task 2: SpawnDirector

**Files:**

- Create: `src/game/systems/SpawnDirector.ts`
- Test: `src/game/systems/SpawnDirector.test.ts`

**Interfaces:**

- Consumes: `DIRECTOR` from `src/game/config.ts`.
- Produces: `type MutantKind = 'swarmer' | 'brute' | 'detonator'`; `class SpawnDirector` with
  constructor `(rng?: () => number)`, `update(dtSec: number, aliveThreat: number): MutantKind[]`. Later
  tasks call `update` once per frame and spawn one enemy per returned kind.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/SpawnDirector.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { SpawnDirector } from './SpawnDirector';

/** A scripted RNG: returns values from a fixed queue, in order. */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('SpawnDirector', () => {
  it('spawns nothing when alive threat already meets the target', () => {
    const director = new SpawnDirector(scriptedRng([0]));
    // targetThreat(0) = 3. aliveThreat already at 3 -> no spawn.
    expect(director.update(0.016, 3)).toEqual([]);
  });

  it('spawns Swarmers to close the gap to the initial threat target', () => {
    const director = new SpawnDirector(scriptedRng([0, 0, 0]));
    // targetThreat(0) = 3. aliveThreat 0, Swarmer threat 1 -> spawns until
    // the 2/sec cap or the threat gap closes, whichever comes first.
    const spawned = director.update(0.016, 0);
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every((k) => k === 'swarmer')).toBe(true);
  });

  it('never spawns more than 2 per second', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    const spawned = director.update(0.016, 0);
    expect(spawned.length).toBeLessThanOrEqual(2);
  });

  it('resets the per-second spawn budget on the next second', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    director.update(0.9, 0);
    const secondBatch = director.update(0.2, 0);
    // Crossing from t=0.9 to t=1.1 enters a new whole second, so the
    // 2-per-second cap resets and more spawns become available.
    expect(secondBatch.length).toBeGreaterThan(0);
  });

  it('does not unlock the Bio-Detonator before 45 seconds', () => {
    // rng pinned near 1 so the director always picks the LAST unlocked
    // kind -- before 45s that's still 'swarmer' (only kind unlocked), so
    // this only proves something once the 45s test below flips it to
    // 'detonator' with the identical rng script.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 44; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).not.toContain('detonator');
  });

  it('unlocks the Bio-Detonator at 45 seconds', () => {
    // Two kinds unlocked (swarmer, detonator); rng near 1 selects index 1
    // = 'detonator', the last entry in the unlocked list.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 45; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).toContain('detonator');
  });

  it('does not unlock the Carapace Brute before 90 seconds', () => {
    // Two kinds unlocked (swarmer, detonator) for the whole loop; rng near
    // 1 selects 'detonator', never 'brute'.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 89; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).not.toContain('brute');
  });

  it('unlocks the Carapace Brute at 90 seconds', () => {
    // Three kinds unlocked; rng near 1 selects index 2 = 'brute'.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 90; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).toContain('brute');
  });

  it('threat target grows linearly at 1/6 per second', () => {
    // targetThreat(60) = 3 + 60/6 = 13. With aliveThreat pinned at 12, a
    // single point of threat is missing, so exactly one Swarmer spawns
    // (assuming an uncapped per-second budget). dtSec is 0 on the final
    // call so targetThreat lands on exactly 13 -- a nonzero fractional dt
    // here (e.g. 0.016) nudges the target to ~13.003, which is still above
    // 13 after one spawn and triggers an unwanted second one.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    for (let t = 0; t < 60; t += 1) director.update(1, 100);
    const spawned = director.update(0, 12);
    expect(spawned.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- SpawnDirector`
Expected: FAIL — `Failed to resolve import "./SpawnDirector"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/SpawnDirector.ts`:

```typescript
/**
 * Continuous threat-budget spawn director. SRS 5.1.
 *
 * No wave state machine: targetThreat(t) climbs linearly with elapsed run
 * time, and the director tops up alive threat toward that target, capped at
 * two spawns per second so a difficulty spike cannot dump a crowd at once.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { DIRECTOR } from '../config';

export type MutantKind = 'swarmer' | 'brute' | 'detonator';

const UNLOCK_ORDER: MutantKind[] = ['swarmer', 'detonator', 'brute'];

export class SpawnDirector {
  readonly #rng: () => number;
  #elapsedSec = 0;
  #currentSecond = 0;
  #spawnedThisSecond = 0;

  constructor(rng: () => number = Math.random) {
    this.#rng = rng;
  }

  /**
   * Advance the director by one frame and return the kinds to spawn.
   *
   * @param dtSec Delta time in seconds.
   * @param aliveThreat The sum of `threat` for every currently-alive enemy,
   *   as tracked by the caller.
   */
  update(dtSec: number, aliveThreat: number): MutantKind[] {
    // targetThreat is computed from elapsedSec BEFORE this frame's dtSec is
    // added: adding it first makes targetThreat(0) land fractionally above
    // baseThreat on any nonzero dt, which spuriously spawns on the very
    // first frame even when aliveThreat already meets the target.
    const targetThreat =
      DIRECTOR.baseThreat + this.#elapsedSec * DIRECTOR.threatPerSec;

    this.#elapsedSec += dtSec;

    const wholeSecond = Math.floor(this.#elapsedSec);
    if (wholeSecond !== this.#currentSecond) {
      this.#currentSecond = wholeSecond;
      this.#spawnedThisSecond = 0;
    }

    const unlocked = this.#unlockedKinds();

    const spawned: MutantKind[] = [];
    let projectedThreat = aliveThreat;

    while (
      projectedThreat < targetThreat &&
      this.#spawnedThisSecond + spawned.length <
        DIRECTOR.maxSpawnsPerSecond
    ) {
      const kind = unlocked[Math.floor(this.#rng() * unlocked.length)];
      spawned.push(kind);
      projectedThreat += SpawnDirector.threatOf(kind);
    }

    this.#spawnedThisSecond += spawned.length;
    return spawned;
  }

  #unlockedKinds(): MutantKind[] {
    // Strictly greater-than: elapsedSec is read post-increment above, so at
    // the exact boundary tick (e.g. elapsedSec===45) the kind must not yet
    // count as unlocked -- unlocking happens the tick AFTER the threshold.
    return UNLOCK_ORDER.filter(
      (kind) => this.#elapsedSec > DIRECTOR.unlockAtSec[kind],
    );
  }

  static threatOf(kind: MutantKind): number {
    if (kind === 'swarmer') return 1;
    if (kind === 'detonator') return 2;
    return 4;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- SpawnDirector`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/systems/SpawnDirector.ts src/game/systems/SpawnDirector.test.ts
git add src/game/systems/SpawnDirector.ts src/game/systems/SpawnDirector.test.ts
git commit -m "feat(director): add threat-budget spawn director

SRS 5.1. Replaces the vertical slice's fixed 1.5s timer with continuous
pressure scaled to elapsed run time, capped at 2 spawns/sec."
```

---

### Task 3: PityDropSystem

**Files:**

- Create: `src/game/systems/PityDropSystem.ts`
- Test: `src/game/systems/PityDropSystem.test.ts`

**Interfaces:**

- Consumes: `PITY` from `src/game/config.ts`; type `CatalystTier` from `src/game/eventBus.ts`.
- Produces: `class PityDropSystem` with constructor `(rng?: () => number)`, `rollOnKill(): CatalystTier |
  null` (returns a tier if a drop occurs, `null` if it doesn't, and internally advances/resets the pity
  counter), getter `missStreak: number`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/PityDropSystem.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- PityDropSystem`
Expected: FAIL — `Failed to resolve import "./PityDropSystem"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/PityDropSystem.ts`:

```typescript
/**
 * Pity-weighted catalyst drop system. SRS 3.5.
 *
 * P(n) = min(1, baseProbability + probabilityPerMiss * n), where n is the
 * count of consecutive kills that produced no drop. This is deliberately the
 * same coefficient as the hard-pity guarantee: P(6) clamps to 1.0, so the
 * 7th consecutive miss-free kill always drops.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { PITY } from '../config';
import type { CatalystTier } from '../eventBus';

export class PityDropSystem {
  readonly #rng: () => number;
  #missStreak = 0;

  constructor(rng: () => number = Math.random) {
    this.#rng = rng;
  }

  get missStreak(): number {
    return this.#missStreak;
  }

  /** Call once per kill. Returns the dropped tier, or null on a miss. */
  rollOnKill(): CatalystTier | null {
    const probability = Math.min(
      1,
      PITY.baseProbability + PITY.probabilityPerMiss * this.#missStreak,
    );

    if (this.#rng() >= probability) {
      this.#missStreak += 1;
      return null;
    }

    this.#missStreak = 0;
    return this.#rollTier();
  }

  #rollTier(): CatalystTier {
    const total =
      PITY.tierWeights.silt + PITY.tierWeights.nitrate + PITY.tierWeights.phyto;
    const roll = this.#rng() * total;

    if (roll < PITY.tierWeights.silt) return 'silt';
    if (roll < PITY.tierWeights.silt + PITY.tierWeights.nitrate)
      return 'nitrate';
    return 'phyto';
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- PityDropSystem`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/systems/PityDropSystem.ts src/game/systems/PityDropSystem.test.ts
git add src/game/systems/PityDropSystem.ts src/game/systems/PityDropSystem.test.ts
git commit -m "feat(pity): add pity-weighted catalyst drop system

SRS 3.5. Same coefficient drives the rolling probability and the 7-kill
hard-pity guarantee, fixing v1.2's contradiction between the two."
```

---

### Task 4: AmmoSystem

**Files:**

- Create: `src/game/systems/AmmoSystem.ts`
- Test: `src/game/systems/AmmoSystem.test.ts`

**Interfaces:**

- Consumes: `CARBINE` from `src/game/config.ts`; type `TetherState` from `src/game/eventBus.ts`.
- Produces: `type AmmoState = { clip: number; reserve: number; reloading: boolean }`; `class AmmoSystem`
  with `tryFire(): boolean`, `update(dtSec: number, tetherState: TetherState): void`,
  `startReload(): void`, getter `state: AmmoState`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/AmmoSystem.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { AmmoSystem } from './AmmoSystem';

describe('AmmoSystem', () => {
  let ammo: AmmoSystem;

  beforeEach(() => {
    ammo = new AmmoSystem();
  });

  it('starts with a full magazine and an empty reserve', () => {
    expect(ammo.state).toEqual({ clip: 24, reserve: 0, reloading: false });
  });

  it('tryFire decrements the clip and returns true while rounds remain', () => {
    expect(ammo.tryFire()).toBe(true);
    expect(ammo.state.clip).toBe(23);
  });

  it('tryFire returns false and does not decrement at zero clip', () => {
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    expect(ammo.state.clip).toBe(0);
    expect(ammo.tryFire()).toBe(false);
    expect(ammo.state.clip).toBe(0);
  });

  it('regenerates the reserve at 8.0 rounds/s while tethered, capped at 240', () => {
    ammo.update(1, 'tethered');
    expect(ammo.state.reserve).toBe(8);
    for (let i = 0; i < 40; i += 1) ammo.update(1, 'tethered');
    expect(ammo.state.reserve).toBe(240);
  });

  it('does not regenerate the reserve during grace or decaying', () => {
    ammo.update(1, 'grace');
    expect(ammo.state.reserve).toBe(0);
    ammo.update(1, 'decaying');
    expect(ammo.state.reserve).toBe(0);
  });

  it('reload takes 1100ms and refills the clip from the reserve', () => {
    // Reserve is filled BEFORE the clip empties: tryFire()'s last call
    // auto-starts the reload the instant the clip hits 0 (SRS 4.1 "Reload
    // Automatic on empty"), so a large update() call issued afterward
    // would tick that already-running reload clock too and could finish
    // it early. Filling the reserve first means the only reload in play
    // is the one this test is actually asserting on.
    ammo.update(30, 'tethered'); // reserve -> 240 (capped)
    for (let i = 0; i < 24; i += 1) ammo.tryFire(); // clip -> 0, auto-reload starts
    expect(ammo.state.reloading).toBe(true);

    ammo.update(1.099, 'tethered');
    expect(ammo.state.reloading).toBe(true);
    expect(ammo.state.clip).toBe(0);

    ammo.update(0.001, 'tethered');
    expect(ammo.state.reloading).toBe(false);
    expect(ammo.state.clip).toBe(24);
    expect(ammo.state.reserve).toBe(240 - 24);
  });

  it('reload only transfers as many rounds as the reserve has', () => {
    // Fill the reserve first so tryFire()'s auto-reload is the only
    // reload this test observes (same reasoning as above). The completing
    // update() call passes 'grace', not 'tethered' -- regen is only
    // paused during grace/decaying per SRS 4.2, so a 'tethered' call here
    // would add another 8.8 rounds mid-reload and the transfer would pull
    // from 16.8, not 8, breaking the "reserve has less than the mag needs"
    // scenario this test exists to check.
    ammo.update(1, 'tethered'); // reserve -> 8
    for (let i = 0; i < 24; i += 1) ammo.tryFire(); // clip -> 0, auto-reload starts
    ammo.update(1.1, 'grace');
    expect(ammo.state.clip).toBe(8);
    expect(ammo.state.reserve).toBe(0);
  });

  it('cannot fire while reloading', () => {
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    ammo.update(5, 'tethered');
    ammo.startReload();
    expect(ammo.tryFire()).toBe(false);
  });

  it('auto-starts a reload when tryFire empties the clip', () => {
    ammo.update(5, 'tethered');
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    expect(ammo.state.reloading).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- AmmoSystem`
Expected: FAIL — `Failed to resolve import "./AmmoSystem"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/AmmoSystem.ts`:

```typescript
/**
 * Clip, reserve, and reload state for the Kinetic Carbine. SRS 4.2.
 *
 * Regeneration fills only the reserve, is paused whenever the player is not
 * tethered, and the magazine is filled only by reloading. An empty clip
 * auto-starts a reload; firing is blocked while reloading.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { CARBINE } from '../config';
import type { TetherState } from '../eventBus';

export type AmmoState = {
  clip: number;
  reserve: number;
  reloading: boolean;
};

export class AmmoSystem {
  #clip = CARBINE.magSize;
  #reserve = 0;
  #reloadRemainingMs = 0;

  get state(): AmmoState {
    return {
      clip: this.#clip,
      reserve: this.#reserve,
      reloading: this.#reloadRemainingMs > 0,
    };
  }

  tryFire(): boolean {
    if (this.#reloadRemainingMs > 0 || this.#clip <= 0) return false;

    this.#clip -= 1;
    if (this.#clip === 0) this.startReload();
    return true;
  }

  startReload(): void {
    if (this.#reloadRemainingMs > 0) return;
    this.#reloadRemainingMs = CARBINE.reloadMs;
  }

  update(dtSec: number, tetherState: TetherState): void {
    if (tetherState === 'tethered') {
      this.#reserve = Math.min(
        CARBINE.reserveCap,
        this.#reserve + CARBINE.regenPerSec * dtSec,
      );
    }

    if (this.#reloadRemainingMs > 0) {
      this.#reloadRemainingMs -= dtSec * 1000;
      if (this.#reloadRemainingMs <= 0) {
        this.#reloadRemainingMs = 0;
        const needed = CARBINE.magSize - this.#clip;
        const transfer = Math.min(needed, this.#reserve);
        this.#clip += transfer;
        this.#reserve -= transfer;
      }
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- AmmoSystem`
Expected: `9 passed`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/systems/AmmoSystem.ts src/game/systems/AmmoSystem.test.ts
git add src/game/systems/AmmoSystem.ts src/game/systems/AmmoSystem.test.ts
git commit -m "feat(ammo): add clip/reserve/reload system for the carbine

SRS 4.2. Reserve regenerates only while tethered, closing the second
reason to come home; magazine is filled only by reload."
```

---

### Task 5: CarrySystem

**Files:**

- Create: `src/game/systems/CarrySystem.ts`
- Test: `src/game/systems/CarrySystem.test.ts`

**Interfaces:**

- Consumes: `CARRY`, `CATALYST_VALUE` from `src/game/config.ts`; type `CatalystTier` from
  `src/game/eventBus.ts`.
- Produces: `class CarrySystem` with `add(tier: CatalystTier): boolean` (returns false if full),
  `deliverAll(): { totalPct: number; count: number }`, `speedMultiplier(): number`, getter
  `tiers: CatalystTier[]`, getter `count: number`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/CarrySystem.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- CarrySystem`
Expected: FAIL — `Failed to resolve import "./CarrySystem"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/CarrySystem.ts`:

```typescript
/**
 * Carried-catalyst stack. SRS 3.3.
 *
 * Catalysts are cargo, not consumed on pickup -- they are cashed in as one
 * lump sum on delivery, per delta spec 2.3's overflow rule (one deliver()
 * call with the total, not one per tier).
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { CARRY, CATALYST_VALUE } from '../config';
import type { CatalystTier } from '../eventBus';

export class CarrySystem {
  #tiers: CatalystTier[] = [];

  get tiers(): CatalystTier[] {
    return [...this.#tiers];
  }

  get count(): number {
    return this.#tiers.length;
  }

  add(tier: CatalystTier): boolean {
    if (this.#tiers.length >= CARRY.capacityBase) return false;
    this.#tiers.push(tier);
    return true;
  }

  speedMultiplier(): number {
    const penalty = Math.min(
      CARRY.speedPenaltyMax,
      CARRY.speedPenaltyPer * this.#tiers.length,
    );
    return 1 - penalty;
  }

  deliverAll(): { totalPct: number; count: number } {
    const count = this.#tiers.length;
    const totalPct = this.#tiers.reduce(
      (sum, tier) => sum + CATALYST_VALUE[tier],
      0,
    );
    this.#tiers = [];
    return { totalPct, count };
  }

  clear(): void {
    this.#tiers = [];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- CarrySystem`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/systems/CarrySystem.ts src/game/systems/CarrySystem.test.ts
git add src/game/systems/CarrySystem.ts src/game/systems/CarrySystem.test.ts
git commit -m "feat(carry): add carried-catalyst stack

SRS 3.3. Delivery is a single lump sum, matching delta spec 2.3's
one-deliver()-call overflow rule rather than per-tier calls."
```

---

### Task 6: CanisterPhysics

**Files:**

- Create: `src/game/systems/CanisterPhysics.ts`
- Test: `src/game/systems/CanisterPhysics.test.ts`

**Interfaces:**

- Consumes: `CANISTER`, `AURA_RADIUS_BASE`, `BARREN_MARGIN` from `src/game/config.ts`.
- Produces: `type CanisterRest = { x: number; y: number; travelPx: number; durationMs: number }`;
  `computeCanisterRest(killX: number, killY: number, treeX: number, treeY: number, rng?: () => number):
  CanisterRest`. `CanisterPool` (Task 10) calls this once per eligible kill and tweens the sprite from
  the kill position to the returned rest position over `durationMs`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/CanisterPhysics.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- CanisterPhysics`
Expected: FAIL — `Failed to resolve import "./CanisterPhysics"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/CanisterPhysics.ts`:

```typescript
/**
 * Canister ejection and rest-position math. SRS 3.6, clamped by delta spec
 * section 4's barren zone: a canister must never come to rest closer to the
 * tree than barrenRadius, or catalysts would cash in for free without a
 * carry step.
 *
 * Rather than tune an Arcade Physics drag body to stop at an exact point,
 * this computes the natural drag-stopping distance analytically
 * (travel = speed^2 / (2 * drag)) and clamps it, then hands the caller a
 * rest position and a duration to animate a tween over -- deterministic and
 * unit-testable without a physics engine.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { AURA_RADIUS_BASE, BARREN_MARGIN, CANISTER } from '../config';

export type CanisterRest = {
  x: number;
  y: number;
  travelPx: number;
  durationMs: number;
};

const BARREN_RADIUS = AURA_RADIUS_BASE + BARREN_MARGIN;

export function computeCanisterRest(
  killX: number,
  killY: number,
  treeX: number,
  treeY: number,
  rng: () => number = Math.random,
): CanisterRest {
  const homeDist = Math.hypot(treeX - killX, treeY - killY);

  if (homeDist < CANISTER.nearTreeThresholdPx) {
    const angle = rng() * Math.PI * 2;
    const speed =
      CANISTER.nearTreeEjectSpeedMin +
      rng() * (CANISTER.nearTreeEjectSpeedMax - CANISTER.nearTreeEjectSpeedMin);
    const travelPx = (speed * speed) / (2 * CANISTER.drag);
    return {
      x: killX + Math.cos(angle) * travelPx,
      y: killY + Math.sin(angle) * travelPx,
      travelPx,
      durationMs: speed > 0 ? (travelPx / speed) * 1000 * 2 : 1,
    };
  }

  const dirX = (treeX - killX) / homeDist;
  const dirY = (treeY - killY) / homeDist;

  const speed =
    CANISTER.ejectSpeedMin +
    rng() * (CANISTER.ejectSpeedMax - CANISTER.ejectSpeedMin);
  const naturalTravel = (speed * speed) / (2 * CANISTER.drag);
  const maxAllowedTravel = Math.max(0, homeDist - BARREN_RADIUS);
  const travelPx = Math.min(naturalTravel, maxAllowedTravel);

  return {
    x: killX + dirX * travelPx,
    y: killY + dirY * travelPx,
    travelPx,
    durationMs: speed > 0 ? (travelPx / speed) * 1000 * 2 : 1,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- CanisterPhysics`
Expected: `6 passed`.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all green, 61 tests (8 Tether + 17 Tree + 9 SpawnDirector + 5 PityDropSystem + 9 AmmoSystem +
6 CarrySystem + 6 CanisterPhysics + 1 smoke).

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/game/systems/CanisterPhysics.ts src/game/systems/CanisterPhysics.test.ts
git add src/game/systems/CanisterPhysics.ts src/game/systems/CanisterPhysics.test.ts
git commit -m "feat(canister): add barren-zone-aware ejection physics

SRS 3.6, clamped by delta spec 4. Analytic drag-stopping distance instead
of a tuned physics body, so the rest point is deterministic and testable."
```

---

### Task 7: Multi-kind EnemyPool, spawn director wiring, difficulty tick

This is the task that replaces the vertical slice's fixed spawn timer with the real director, and
generalizes `EnemyPool` so a single pool holds Swarmers, Brutes, and Detonators together — which matters
for Task 8, where a Detonator's explosion must be able to damage nearby enemies of any kind in the same
group.

**Files:**

- Modify: `src/game/entities/EnemyPool.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `BRUTE`, `DETONATOR`, `SWARMER`, `MELEE_COOLDOWN_MS`, `DIRECTOR` from
  `src/game/config.ts`; `MutantKind`, `SpawnDirector` from `src/game/systems/SpawnDirector.ts`;
  `FRAME` from `src/game/frames.ts`; `isArcadeImage` from `src/game/guards.ts`.
- Produces: `EnemyPool.spawn(x: number, y: number, kind: MutantKind, elapsedSec: number): void`;
  static `kind(enemy): MutantKind`; static `melee(enemy): number`; static `threat(enemy): number`;
  static `ballisticReduction(enemy): number`; static `displaySize(enemy): number`. The existing
  `hp`/`setHp`/`nextMeleeAtMs`/`setNextMeleeAtMs`/`kill`/`pursue` signatures are unchanged. `ArenaScene`
  gains a `#director = new SpawnDirector()` and an `#elapsedSec` accumulator; the fixed-timer spawn path
  is removed entirely.

- [ ] **Step 1: Generalize `EnemyPool` with a per-kind stat table**

Replace `src/game/entities/EnemyPool.ts` entirely:

```typescript
/**
 * Pooled mutants: Dune Swarmer, Carapace Brute, Bio-Detonator. Every mutant
 * computes a live Euclidean pursuit vector toward the player and ignores
 * the tree entirely. SRS 4.3.
 *
 * All three kinds share one pool and one physics group so a Detonator's
 * explosion (Task 8) can scan for and damage nearby enemies of any kind
 * with a single group query.
 */
import Phaser from 'phaser';
import { BRUTE, DETONATOR, DIRECTOR, MELEE_COOLDOWN_MS, SWARMER } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';
import type { MutantKind } from '../systems/SpawnDirector';

type Stats = {
  frame: number;
  displaySize: number;
  speed: number;
  hp: number;
  melee: number;
  threat: number;
  ballisticReduction: number;
};

const STATS: Record<MutantKind, Stats> = {
  swarmer: {
    frame: FRAME.swarmer,
    displaySize: 36,
    speed: SWARMER.speed,
    hp: SWARMER.hp,
    melee: SWARMER.melee,
    threat: SWARMER.threat,
    ballisticReduction: 0,
  },
  brute: {
    frame: FRAME.brute,
    displaySize: BRUTE.displaySize,
    speed: BRUTE.speed,
    hp: BRUTE.hp,
    melee: BRUTE.melee,
    threat: BRUTE.threat,
    ballisticReduction: BRUTE.ballisticReduction,
  },
  detonator: {
    frame: FRAME.detonator,
    displaySize: DETONATOR.displaySize,
    speed: DETONATOR.speed,
    hp: DETONATOR.hp,
    melee: DETONATOR.melee,
    threat: DETONATOR.threat,
    ballisticReduction: 0,
  },
};

export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, size: number) {
    this.group = scene.physics.add.group({
      defaultKey: 'sheet',
      defaultFrame: FRAME.swarmer,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.swarmer,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  /**
   * @param elapsedSec Elapsed run seconds at spawn time. Stat ramp (SRS
   *   5.1) is snapshotted into this instance's hp/melee and fixed for its
   *   lifetime -- later ramp changes do not retroactively affect it.
   */
  spawn(x: number, y: number, kind: MutantKind, elapsedSec: number): void {
    const enemy: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(enemy)) return;

    const stats = STATS[kind];
    const rampSteps = Math.floor(elapsedSec / 60);
    const hpMult = 1 + DIRECTOR.hpRampPer60s * rampSteps;
    const dmgMult = 1 + DIRECTOR.dmgRampPer60s * rampSteps;

    enemy.enableBody(true, x, y, true, true);
    enemy.setFrame(stats.frame);
    enemy.setDisplaySize(stats.displaySize, stats.displaySize);
    enemy.clearTint();
    enemy.setData('kind', kind);
    enemy.setData('hp', stats.hp * hpMult);
    enemy.setData('melee', stats.melee * dmgMult);
    enemy.setData('nextMeleeAtMs', 0);
    enemy.setData('lockedUntilMs', 0);
  }

  /** Recompute every live pursuit vector. */
  pursue(targetX: number, targetY: number): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const enemy = child;

      // A locked Bio-Detonator (Task 8) holds position through its
      // telegraph rather than continuing to close in.
      const lockedUntilMs: unknown = enemy.getData('lockedUntilMs');
      if (typeof lockedUntilMs === 'number' && lockedUntilMs > 0) continue;

      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        targetX,
        targetY,
      );
      const speed = STATS[EnemyPool.kind(enemy)].speed;
      enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      enemy.setRotation(angle);
    }
  }

  static kind(enemy: Phaser.Physics.Arcade.Image): MutantKind {
    const value: unknown = enemy.getData('kind');
    return value === 'brute' || value === 'detonator' ? value : 'swarmer';
  }

  static hp(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('hp');
    return typeof value === 'number' ? value : 0;
  }

  static setHp(enemy: Phaser.Physics.Arcade.Image, value: number): void {
    enemy.setData('hp', value);
  }

  static melee(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('melee');
    return typeof value === 'number' ? value : 0;
  }

  static threat(enemy: Phaser.Physics.Arcade.Image): number {
    return STATS[EnemyPool.kind(enemy)].threat;
  }

  static ballisticReduction(enemy: Phaser.Physics.Arcade.Image): number {
    return STATS[EnemyPool.kind(enemy)].ballisticReduction;
  }

  static nextMeleeAtMs(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('nextMeleeAtMs');
    return typeof value === 'number' ? value : 0;
  }

  static setNextMeleeAtMs(
    enemy: Phaser.Physics.Arcade.Image,
    value: number,
  ): void {
    enemy.setData('nextMeleeAtMs', value);
  }

  static lockedUntilMs(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('lockedUntilMs');
    return typeof value === 'number' ? value : 0;
  }

  static setLockedUntilMs(
    enemy: Phaser.Physics.Arcade.Image,
    value: number,
  ): void {
    enemy.setData('lockedUntilMs', value);
  }

  static kill(enemy: Phaser.Physics.Arcade.Image): void {
    enemy.disableBody(true, true);
  }
}
```

`MELEE_COOLDOWN_MS` is imported but not directly referenced in this file — it is used by `ArenaScene`'s
melee-cooldown-setting code in Step 3 below. If your linter flags the unused import, remove it from this
file; it is only listed above because the stat table originally referenced it before the universal
constant replaced the per-kind duplication. (Concretely: do not import `MELEE_COOLDOWN_MS` into
`EnemyPool.ts` at all — this note exists so you don't second-guess the omission. Only import `BRUTE`,
`DETONATOR`, `DIRECTOR`, `SWARMER` from config in this file.)

- [ ] **Step 2: Track alive threat and elapsed time in `ArenaScene`**

In `src/game/scenes/ArenaScene.ts`, replace the field block:

```typescript
  #hp: number = PLAYER.maxHp;
  #invulnUntilMs = 0;
  #kills = 0;
  #startedAtMs = 0;
  #over = false;
  #spawnTimer!: Phaser.Time.TimerEvent;
```

with:

```typescript
  #hp: number = PLAYER.maxHp;
  #invulnUntilMs = 0;
  #kills = 0;
  #startedAtMs = 0;
  #over = false;
  #director = new SpawnDirector();
  #elapsedSec = 0;
  #msSinceDifficultyTick = 0;
```

Add the import:

```typescript
import { SpawnDirector } from '../systems/SpawnDirector';
```

Add `MELEE_COOLDOWN_MS` to the existing config import list (it currently imports `ARENA`,
`AURA_RADIUS_BASE`, `BARREN_MARGIN`, `CARBINE`, `GROWTH_CEILING`, `PLAYER`, `SWARMER`,
`TICK_INTERVAL_MS`, `TREE_POS` — add `MELEE_COOLDOWN_MS` to that list; `SWARMER` stays, since
`#takeMeleeFrom`'s damage-dealt calculation still reads a per-enemy value but the cooldown-setting call
changes in Step 3).

- [ ] **Step 3: Remove the fixed spawn timer, drive spawning from the director**

Delete the `#spawnTimer` creation in `create()`:

```typescript
    this.#spawnTimer = this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => this.#spawnAtEdge(),
    });
```

(Do not replace it with anything in `create()` — spawning now happens inside `update()`.)

Delete the `this.#spawnTimer.remove();` line inside `#endRun()` (there is no longer a timer to remove).

Replace the `#spawnAtEdge` method's signature and body:

```typescript
  #spawnAtEdge(kind: MutantKind): void {
    const inset = 24;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const edge = Phaser.Math.Between(0, 3);
      const x =
        edge === 0 || edge === 2
          ? Phaser.Math.Between(inset, ARENA.width - inset)
          : edge === 1
            ? ARENA.width - inset
            : inset;
      const y =
        edge === 1 || edge === 3
          ? Phaser.Math.Between(inset, ARENA.height - inset)
          : edge === 0
            ? inset
            : ARENA.height - inset;

      const distance = Phaser.Math.Distance.Between(
        x,
        y,
        this.#player.x,
        this.#player.y,
      );
      if (distance >= 120) {
        this.#enemies.spawn(x, y, kind, this.#elapsedSec);
        return;
      }
    }
  }
```

Add `MutantKind` to the systems import: `import { SpawnDirector } from '../systems/SpawnDirector';`
becomes `import { SpawnDirector, type MutantKind } from '../systems/SpawnDirector';`.

In `update()`, immediately after `const dtSec = delta / 1000;`, add:

```typescript
    this.#elapsedSec += dtSec;

    let aliveThreat = 0;
    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      aliveThreat += EnemyPool.threat(child);
    }
    for (const kind of this.#director.update(dtSec, aliveThreat)) {
      this.#spawnAtEdge(kind);
    }

    this.#msSinceDifficultyTick += delta;
    if (this.#msSinceDifficultyTick >= TICK_INTERVAL_MS) {
      this.#msSinceDifficultyTick = 0;
      let aliveEnemies = 0;
      for (const child of this.#enemies.group.getChildren()) {
        if (isArcadeImage(child) && child.active) aliveEnemies += 1;
      }
      bus.emit('DIFFICULTY_TICK', {
        elapsedMs: this.#elapsedSec * 1000,
        waveLabel: Math.floor(this.#elapsedSec / 30) + 1,
        aliveEnemies,
      });
    }
```

- [ ] **Step 4: Update the melee-cooldown-setting call**

In `#takeMeleeFrom`, find:

```typescript
    EnemyPool.setNextMeleeAtMs(enemy, now + SWARMER.meleeCooldownMs);
```

Replace with:

```typescript
    EnemyPool.setNextMeleeAtMs(enemy, now + MELEE_COOLDOWN_MS);
```

This is the only remaining use of `SWARMER.meleeCooldownMs` in the codebase, so it is now dead. Remove
the field itself rather than leave an unflagged unused constant — Plan 1's final review specifically
criticized config fields with no reader and no deferred owner. In `src/game/config.ts`, find the
`SWARMER` block:

```typescript
export const SWARMER = {
  speed: 180,
  hp: 25,
  melee: 6,
  threat: 1,
  meleeCooldownMs: 800,
  radius: 18,
} as const;
```

Remove the `meleeCooldownMs: 800,` line, leaving:

```typescript
export const SWARMER = {
  speed: 180,
  hp: 25,
  melee: 6,
  threat: 1,
  radius: 18,
} as const;
```

Find:

```typescript
    this.#hp = Math.max(0, this.#hp - SWARMER.melee);
```

Replace with:

```typescript
    this.#hp = Math.max(0, this.#hp - EnemyPool.melee(enemy));
```

- [ ] **Step 5: Apply the Brute's ballistic damage reduction**

In the bullet-vs-enemy overlap handler, find:

```typescript
        const remaining = EnemyPool.hp(enemy) - CARBINE.damage;
```

Replace with:

```typescript
        const damage =
          CARBINE.damage * (1 - EnemyPool.ballisticReduction(enemy));
        const remaining = EnemyPool.hp(enemy) - damage;
```

- [ ] **Step 6: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`.

1. Confirm Swarmers spawn from the start and pressure ramps up over the first minute — you should see
   noticeably more enemies alive around 60 s than around 10 s.
2. Wait roughly 45 s: enemies with the stone-armored beetle sprite (Brute, `FRAME.brute`) should NOT yet
   appear (they unlock at 90 s) — only Swarmers should be visible before 45 s.
3. This task does not yet make Detonators or Brutes render distinctly dangerous (Task 8 adds the
   Detonator's explosion) — just confirm all three sprites can appear after their unlock times without a
   crash, and that a Brute visibly takes more hits to kill than a Swarmer.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/game/entities/EnemyPool.ts src/game/scenes/ArenaScene.ts
git add src/game/entities/EnemyPool.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(director): wire the spawn director into the scene

SRS 5.1. Replaces the vertical slice's fixed 1.5s timer with continuous
threat-budget pressure. EnemyPool now carries kind-tagged Swarmers,
Brutes, and Detonators in one pool with per-instance stat-ramp snapshots."
```

---

### Task 8: Bio-Detonator telegraph and explosion

**Files:**

- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `DETONATOR` from `src/game/config.ts`; `EnemyPool.lockedUntilMs`/`setLockedUntilMs`/`kind`
  from `src/game/entities/EnemyPool.ts`.
- Produces: nothing new consumed by later tasks — this task is self-contained combat behavior.

- [ ] **Step 1: Add the detonator update pass**

In `src/game/scenes/ArenaScene.ts`, add `DETONATOR` to the config import list.

Immediately after the difficulty-tick block added in Task 7 (inside `update()`), add:

```typescript
    this.#updateDetonators();
```

Add the new private method, placed after `#spawnAtEdge`:

```typescript
  /**
   * Bio-Detonator telegraph and explosion. SRS 4.3: on closing within
   * lockRangePx of the player it locks in place, flashes white for
   * telegraphMs, then explodes for AoE damage against the player and any
   * other enemy within explosionRadiusPx -- including other Detonators,
   * which makes baiting them into a crowd a real tactic. Killing it during
   * the telegraph (a bullet overlap disables its body) naturally prevents
   * the explosion, since a dead enemy is skipped by every check below.
   */
  #updateDetonators(): void {
    const now = this.time.now;

    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      if (EnemyPool.kind(child) !== 'detonator') continue;

      const lockedUntilMs = EnemyPool.lockedUntilMs(child);

      if (lockedUntilMs === 0) {
        const distToPlayer = Phaser.Math.Distance.Between(
          child.x,
          child.y,
          this.#player.x,
          this.#player.y,
        );
        if (distToPlayer <= DETONATOR.lockRangePx) {
          EnemyPool.setLockedUntilMs(child, now + DETONATOR.telegraphMs);
          child.setVelocity(0, 0);
          this.tweens.add({
            targets: child,
            alpha: 0.3,
            duration: 120,
            yoyo: true,
            repeat: Math.floor(DETONATOR.telegraphMs / 240),
          });
        }
        continue;
      }

      if (now < lockedUntilMs) continue;

      this.#explodeDetonator(child);
    }
  }

  #explodeDetonator(detonator: Phaser.Physics.Arcade.Image): void {
    const damage = EnemyPool.melee(detonator);
    const cx = detonator.x;
    const cy = detonator.y;

    EnemyPool.kill(detonator);

    if (
      Phaser.Math.Distance.Between(cx, cy, this.#player.x, this.#player.y) <=
      DETONATOR.explosionRadiusPx
    ) {
      this.#takeExplosionDamage(damage);
    }

    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      if (child === detonator) continue;
      if (
        Phaser.Math.Distance.Between(cx, cy, child.x, child.y) <=
        DETONATOR.explosionRadiusPx
      ) {
        const remaining = EnemyPool.hp(child) - damage;
        if (remaining <= 0) {
          EnemyPool.kill(child);
        } else {
          EnemyPool.setHp(child, remaining);
        }
      }
    }
  }

  #takeExplosionDamage(damage: number): void {
    if (this.#over) return;

    this.#hp = Math.max(0, this.#hp - damage);
    bus.emit('PLAYER_HP_CHANGED', { current: this.#hp, max: PLAYER.maxHp });
    this.cameras.main.shake(120, 0.006);

    if (this.#hp === 0) this.#endRun();
  }
```

Note that explosion damage against the player deliberately does **not** consult `#invulnUntilMs` or
`isDashing` — it is a distinct, one-shot AoE event with its own telegraph (the 0.6 s flash) as its
counterplay, not a melee tick subject to the crowd-damage safety rail. This matches SRS 4.3's description
of the Detonator as a "suicide unit" whose threat is positioning and timing, not contact frequency.

- [ ] **Step 2: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Wait past 45 s for Detonators to unlock, then let one close to melee range.

1. Confirm it stops moving and flickers for roughly half a second before anything happens.
2. Confirm it then disappears and — if you were close — you take damage and the camera shakes.
3. Shoot a locked, flickering Detonator before it finishes its telegraph: confirm it dies with no
   explosion and no damage to you.
4. If you can arrange it, let a Detonator explode near a Swarmer: confirm the Swarmer also takes damage
   or dies from the blast.

- [ ] **Step 4: Commit**

```bash
npx prettier --write src/game/scenes/ArenaScene.ts
git add src/game/scenes/ArenaScene.ts
git commit -m "feat(enemies): add bio-detonator telegraph and AoE explosion

SRS 4.3. Lock-flash-explode sequence damages the player and any other
enemy in radius, including other detonators -- killing it mid-telegraph
prevents the explosion entirely, since a disabled body is skipped."
```

---

### Task 9: Ammo wiring and the ammo HUD readout

**Files:**

- Modify: `src/game/scenes/ArenaScene.ts`
- Create: `src/hud/AmmoReadout.tsx`
- Modify: `src/hud/Hud.tsx`

**Interfaces:**

- Consumes: `AmmoSystem` from `src/game/systems/AmmoSystem.ts`; `bus` from `src/game/eventBus.ts`.
- Produces: `<AmmoReadout />`. `ArenaScene` emits `AMMO_UPDATED` edge-triggered (only when clip, reserve,
  or reloading actually changes).

- [ ] **Step 1: Replace the fixed-cadence fire loop with the ammo system**

In `src/game/scenes/ArenaScene.ts`, add the import:

```typescript
import { AmmoSystem } from '../systems/AmmoSystem';
import type { AmmoState } from '../systems/AmmoSystem';
```

Add a field:

```typescript
  #ammo = new AmmoSystem();
  #lastEmittedAmmo: AmmoState | null = null;
  #reloadKey!: Phaser.Input.Keyboard.Key;
```

In `create()`, after the player is constructed, add:

```typescript
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.#reloadKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    }
```

Replace the existing fixed-cadence fire block in `update()`:

```typescript
    const pointer = this.input.activePointer;
    if (pointer.leftButtonDown() && this.time.now >= this.#nextShotAtMs) {
      this.#nextShotAtMs = this.time.now + 1000 / CARBINE.fireRatePerSec;
      this.#bullets.fire(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
    }
```

with:

```typescript
    const pointer = this.input.activePointer;
    if (
      pointer.leftButtonDown() &&
      this.time.now >= this.#nextShotAtMs &&
      this.#ammo.tryFire()
    ) {
      this.#nextShotAtMs = this.time.now + 1000 / CARBINE.fireRatePerSec;
      this.#bullets.fire(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
    }

    if (Phaser.Input.Keyboard.JustDown(this.#reloadKey)) {
      this.#ammo.startReload();
    }

    this.#ammo.update(dtSec, this.#tether.state);
    const ammoState = this.#ammo.state;
    if (
      !this.#lastEmittedAmmo ||
      ammoState.clip !== this.#lastEmittedAmmo.clip ||
      ammoState.reserve !== this.#lastEmittedAmmo.reserve ||
      ammoState.reloading !== this.#lastEmittedAmmo.reloading
    ) {
      this.#lastEmittedAmmo = ammoState;
      bus.emit('AMMO_UPDATED', {
        weaponId: 'carbine',
        clip: ammoState.clip,
        clipMax: 24,
        reserve: ammoState.reserve,
      });
    }
```

`this.#tether.state` reads the tether system's current state getter — confirm this exists on
`TetherSystem` (it does, established in Plan 1 Task 4: `get state(): TetherState`). The ammo update call
must read the state computed by *this* frame's tether update, which happens earlier in `update()` — place
this block after the existing tether-state computation, not before it, so `this.#tether.state` reflects
the current frame rather than the previous one. (The existing code already computes tether state into a
local `const state` earlier in `update()` — you may use that local `state` variable directly instead of
re-reading `this.#tether.state`, if `TetherSystem` does not expose a `state` getter separately from its
`update()` return value; check `TetherSystem.ts` and use whichever is correct. It does expose a `state`
getter, established in Plan 1, so either approach works — prefer the local `state` variable already in
scope for clarity.)

`clipMax: 24` is a literal here rather than a config reference because `CARBINE.magSize` is already
imported and available — replace the literal `24` with `CARBINE.magSize` in the emit call above.

- [ ] **Step 2: Build the ammo readout**

Create `src/hud/AmmoReadout.tsx`:

```tsx
/** Weapon, magazine, reserve, and reload indicator. SRS 6.1, bottom-right. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Ammo = { weaponId: string; clip: number; clipMax: number; reserve: number };

export function AmmoReadout() {
  const [ammo, setAmmo] = useState<Ammo>({
    weaponId: 'carbine',
    clip: 24,
    clipMax: 24,
    reserve: 0,
  });
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onUpdate = (e: Ammo) => setAmmo(e);
    bus.on('AMMO_UPDATED', onUpdate);
    return () => bus.off('AMMO_UPDATED', onUpdate);
  }, []);

  useEffect(() => {
    // Reload state does not currently ride on AMMO_UPDATED's payload
    // shape, so it is inferred: a clip that hasn't moved while the
    // reserve keeps climbing is ambiguous, so instead this simply mirrors
    // the low-clip visual state and the readout leans on the label text
    // rather than a separate boolean. Kept intentionally simple for this
    // plan; a dedicated reload flag can be added to AMMO_UPDATED's payload
    // later without breaking this component.
    setReloading(ammo.clip === 0 && ammo.reserve > 0);
  }, [ammo]);

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Compose it into the HUD**

Replace `src/hud/Hud.tsx` entirely:

```tsx
/** HUD root. Layered over the canvas at z-20, never intercepts input. */
import { AmmoReadout } from './AmmoReadout';
import { DecayVignette } from './DecayVignette';
import { GameOverCard } from './GameOverCard';
import { HealthBar } from './HealthBar';
import { MaturityGauge } from './MaturityGauge';
import { TetherBeacon } from './TetherBeacon';

export function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <DecayVignette />

      <div className="absolute top-4 left-4">
        <HealthBar />
      </div>

      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <MaturityGauge />
        <TetherBeacon />
      </div>

      <div className="absolute right-4 bottom-4">
        <AmmoReadout />
      </div>

      <GameOverCard />
    </div>
  );
}
```

- [ ] **Step 4: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`.

1. Fire continuously: the clip counter counts down from 24, and at 0 the readout shows `Reloading` for
   about 1.1 s, then the clip refills (bounded by whatever reserve has accumulated — expect 0 rounds if
   you haven't stood in the aura first).
2. Stand in the aura without firing: the reserve counter climbs at 8/s.
3. Press `R` manually with a partial clip and rounds in reserve: confirm it starts a reload rather than
   waiting for the clip to empty.
4. Fire is blocked entirely while `Reloading` is shown.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/game/scenes/ArenaScene.ts src/hud/AmmoReadout.tsx src/hud/Hud.tsx
git add src/game/scenes/ArenaScene.ts src/hud/AmmoReadout.tsx src/hud/Hud.tsx
git commit -m "feat(ammo): wire the ammo system into firing, reload, and hud

SRS 4.2, 6.1. Firing now consumes the clip and blocks during reload;
manual R and auto-reload-on-empty both route through AmmoSystem."
```

---

### Task 10: CanisterPool — ejection, magnet, lifetime, and pity-gated drops on kill

**Files:**

- Create: `src/game/entities/CanisterPool.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `CANISTER`, `AURA_RADIUS_BASE`, `BARREN_MARGIN` from `src/game/config.ts`;
  `computeCanisterRest` from `src/game/systems/CanisterPhysics.ts`; `PityDropSystem` from
  `src/game/systems/PityDropSystem.ts`; `FRAME` from `src/game/frames.ts`; `isArcadeImage` from
  `src/game/guards.ts`; type `CatalystTier` from `src/game/eventBus.ts`.
- Produces: `class CanisterPool` with `constructor(scene: Phaser.Scene, size: number)`,
  `eject(killX: number, killY: number, treeX: number, treeY: number, tier: CatalystTier): void`,
  `update(playerX: number, playerY: number): void` (drives the magnet pull and lifetime/despawn flash),
  static `tier(canister): CatalystTier`, static `kill(canister): void`. `ArenaScene` gains
  `#pity = new PityDropSystem()` and `#canisters!: CanisterPool`, and every kill (bullet-vs-enemy) now
  first checks barren-zone eligibility before rolling pity.

- [ ] **Step 1: Create the canister pool**

Create `src/game/entities/CanisterPool.ts`:

```typescript
/**
 * Pooled catalyst canisters: ejection, magnet pull, lifetime, and the
 * despawn warning flash. SRS 3.6.
 *
 * Ejection position is computed once by the pure CanisterPhysics module and
 * animated with a tween rather than a physics body, so the barren-zone
 * clamp from delta spec 4 is exact rather than dependent on drag tuning.
 */
import Phaser from 'phaser';
import { CANISTER } from '../config';
import { computeCanisterRest } from '../systems/CanisterPhysics';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';
import type { CatalystTier } from '../eventBus';

const TIER_TINT: Record<CatalystTier, number> = {
  silt: 0xa8875a,
  nitrate: 0x3ddc84,
  phyto: 0xa855f7,
};

export class CanisterPool {
  readonly group: Phaser.GameObjects.Group;
  readonly #scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, size: number) {
    this.#scene = scene;
    this.group = scene.add.group({
      defaultKey: 'sheet',
      defaultFrame: FRAME.canister,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.canister,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  eject(
    killX: number,
    killY: number,
    treeX: number,
    treeY: number,
    tier: CatalystTier,
  ): void {
    const canister: unknown = this.group.getFirstDead(false);
    if (!(canister instanceof Phaser.GameObjects.Image)) return;

    const rest = computeCanisterRest(killX, killY, treeX, treeY);

    canister.setActive(true);
    canister.setVisible(true);
    canister.setPosition(killX, killY);
    canister.setDisplaySize(CANISTER.displaySize, CANISTER.displaySize);
    canister.setAlpha(1);
    canister.setTint(TIER_TINT[tier]);
    canister.setData('tier', tier);
    canister.setData('spawnedAtMs', this.#scene.time.now);
    canister.setData('settled', false);

    this.#scene.tweens.add({
      targets: canister,
      x: rest.x,
      y: rest.y,
      duration: Math.max(1, rest.durationMs),
      ease: 'Quad.easeOut',
      onComplete: () => canister.setData('settled', true),
    });
  }

  /** Magnet pull toward the player, plus lifetime and despawn flashing. */
  update(playerX: number, playerY: number): void {
    const now = this.#scene.time.now;

    for (const child of this.group.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Image) || !child.active)
        continue;

      const spawnedAtMs: unknown = child.getData('spawnedAtMs');
      const age =
        now - (typeof spawnedAtMs === 'number' ? spawnedAtMs : now);

      if (age >= CANISTER.lifetimeMs) {
        CanisterPool.kill(child);
        continue;
      }

      if (age >= CANISTER.lifetimeMs - CANISTER.despawnWarnMs) {
        const phase = Math.floor(
          (age / 1000) * CANISTER.despawnFlashHz,
        );
        child.setAlpha(phase % 2 === 0 ? 1 : 0.3);
      }

      if (!child.getData('settled')) continue;

      const dist = Phaser.Math.Distance.Between(
        child.x,
        child.y,
        playerX,
        playerY,
      );
      if (dist <= CANISTER.magnetRadius && dist > 0) {
        const angle = Phaser.Math.Angle.Between(
          child.x,
          child.y,
          playerX,
          playerY,
        );
        const step = CANISTER.magnetPullSpeed * (1 / 60);
        child.x += Math.cos(angle) * Math.min(step, dist);
        child.y += Math.sin(angle) * Math.min(step, dist);
      }
    }
  }

  static tier(canister: Phaser.GameObjects.Image): CatalystTier {
    const value: unknown = canister.getData('tier');
    return value === 'nitrate' || value === 'phyto' ? value : 'silt';
  }

  static kill(canister: Phaser.GameObjects.Image): void {
    canister.setActive(false);
    canister.setVisible(false);
  }
}
```

`update`'s magnet step uses a fixed `1 / 60` rather than the frame's real `dtSec` — flag this as a known
simplification: it assumes roughly 60 fps for the magnet's per-frame step size. Passing a real `dtSec`
into `update` is a one-line change if this proves visibly wrong in testing (`const step =
CANISTER.magnetPullSpeed * dtSec`, with `dtSec` added as a parameter) — but do not make that change
unless Step 4's manual verification shows the pull speed is visibly off at a different frame rate; the
plan does not want to speculatively add an unused parameter path.

- [ ] **Step 2: Wire pity, barren-zone eligibility, and ejection into the kill handler**

In `src/game/scenes/ArenaScene.ts`, add the imports:

```typescript
import { CanisterPool } from '../entities/CanisterPool';
import { PityDropSystem } from '../systems/PityDropSystem';
```

Add `AURA_RADIUS_BASE` and `BARREN_MARGIN` to the config import if not already present (they already are,
from Task 6/9's imports — confirm before adding a duplicate).

Add fields:

```typescript
  #canisters!: CanisterPool;
  #pity = new PityDropSystem();
```

In `create()`, after `this.#enemies = new EnemyPool(this, 60);`, add:

```typescript
    this.#canisters = new CanisterPool(this, 30);
```

In the bullet-vs-enemy overlap handler, find the kill branch:

```typescript
        if (remaining <= 0) {
          EnemyPool.kill(enemy);
          this.#kills += 1;
          return;
        }
```

Replace with:

```typescript
        if (remaining <= 0) {
          const killX = enemy.x;
          const killY = enemy.y;
          EnemyPool.kill(enemy);
          this.#kills += 1;
          this.#handleKillDrop(killX, killY);
          return;
        }
```

Add the new private method (placed after `#endRun`):

```typescript
  /**
   * Barren-zone eligibility, then pity, then ejection. Delta spec 4: a
   * kill inside barrenRadius produces no canister at all, and does NOT
   * advance the pity counter -- defending the tree must never silently
   * burn the player's accumulated drop odds.
   */
  #handleKillDrop(killX: number, killY: number): void {
    const barrenRadius = AURA_RADIUS_BASE + BARREN_MARGIN;
    const homeDist = Phaser.Math.Distance.Between(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
    );
    if (homeDist < barrenRadius) return;

    const tier = this.#pity.rollOnKill();
    if (!tier) return;

    this.#canisters.eject(killX, killY, TREE_POS.x, TREE_POS.y, tier);
  }
```

Also apply the same barren-zone/pity gate to the Bio-Detonator's explosion kill of *other* enemies (Task
8's `#explodeDetonator`), and to the Detonator's own death when it explodes — both are kills, and both
should follow the identical rule. In `#explodeDetonator`, find:

```typescript
    EnemyPool.kill(detonator);
```

Replace with:

```typescript
    this.#handleKillDrop(cx, cy);
    EnemyPool.kill(detonator);
```

Find the AoE kill branch inside the same method:

```typescript
        if (remaining <= 0) {
          EnemyPool.kill(child);
        } else {
```

Replace with:

```typescript
        if (remaining <= 0) {
          this.#handleKillDrop(child.x, child.y);
          EnemyPool.kill(child);
        } else {
```

Finally, call the canister pool's `update` once per frame. In `update()`, after
`this.#enemies.pursue(this.#player.x, this.#player.y);`, add:

```typescript
    this.#canisters.update(this.#player.x, this.#player.y);
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`.

1. Kill several enemies well outside the aura: canisters should appear at the kill spots and visibly
   travel a short distance toward the tree before stopping — none should end up closer to the tree than
   the faint outer barren ring drawn in Plan 1.
2. Kill an enemy that is standing very close to you while you are next to the tree (inside the barren
   ring): confirm no canister appears at all.
3. Approach a settled canister: within a short radius it should visibly accelerate toward you.
4. Let a canister sit unclaimed for a while: it should start flashing before disappearing entirely.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/entities/CanisterPool.ts src/game/scenes/ArenaScene.ts
git add src/game/entities/CanisterPool.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(canister): eject pity-weighted drops outside the barren zone

SRS 3.5, 3.6, delta spec 4. Barren-zone kills produce no canister and do
not advance the pity counter; eligible kills roll pity, then eject and
animate to a barren-clamped rest position."
```

---

### Task 11: Pickup, delivery, carry speed penalty, and the catalyst-pip HUD

This is the task that finally calls `TreeSystem.deliver()` from live game code — closing the loop Plan
1's final review flagged as unreachable.

**Files:**

- Modify: `src/game/entities/Player.ts`
- Modify: `src/game/scenes/ArenaScene.ts`
- Create: `src/hud/CarriedCatalystPips.tsx`
- Modify: `src/hud/Hud.tsx`

**Interfaces:**

- Consumes: `CarrySystem` from `src/game/systems/CarrySystem.ts`; `CanisterPool` from
  `src/game/entities/CanisterPool.ts`.
- Produces: `Player.setSpeedMultiplier(mult: number): void`. `ArenaScene` gains `#carry = new
  CarrySystem()`, emits `CATALYSTS_CARRIED` (edge-triggered, on every add/deliver) and
  `CATALYSTS_DELIVERED` (edge-triggered, on every delivery). `<CarriedCatalystPips />`.

- [ ] **Step 1: Add a speed multiplier to `Player`**

In `src/game/entities/Player.ts`, add a field:

```typescript
  #speedMultiplier = 1;
```

Add a method, placed after `get isDashing()`:

```typescript
  setSpeedMultiplier(mult: number): void {
    this.#speedMultiplier = mult;
  }
```

In `update()`, find the non-dashing velocity branch:

```typescript
    } else {
      this.sprite.setVelocity(
        dir.x * PLAYER.moveSpeed,
        dir.y * PLAYER.moveSpeed,
      );
    }
```

Replace with:

```typescript
    } else {
      this.sprite.setVelocity(
        dir.x * PLAYER.moveSpeed * this.#speedMultiplier,
        dir.y * PLAYER.moveSpeed * this.#speedMultiplier,
      );
    }
```

The dash branch is deliberately left untouched — a dash's fixed 1200 px/s burst is not affected by
carried weight; only sustained movement is.

- [ ] **Step 2: Wire pickup, delivery, and the speed penalty into `ArenaScene`**

Add the import:

```typescript
import { CarrySystem } from '../systems/CarrySystem';
```

Add a field:

```typescript
  #carry = new CarrySystem();
```

In the canister-pool `update` call added in Task 10, extend it to also handle pickup. Replace:

```typescript
    this.#canisters.update(this.#player.x, this.#player.y);
```

with:

```typescript
    this.#canisters.update(this.#player.x, this.#player.y);
    this.#handleCanisterPickups(state);
```

`state` here is the same local `TetherState` variable the existing tether-update block already computes
earlier in `update()` — this call must be placed after that computation, not before it. If the canister
update call from Task 10 was placed before the tether-state computation in your current file, move both
the `this.#canisters.update(...)` line and this new pickup line to just after the tether-state block
instead (immediately after the `if (state !== this.#lastTetherState) { ... }` block).

Add the new private method, placed after `#handleKillDrop`:

```typescript
  /**
   * A canister that reaches the player is picked up. While tethered it
   * cashes in immediately, with no carry step -- SRS 3.3. Otherwise it
   * joins the carry stack, capped at 3, and the player's speed multiplier
   * updates to reflect the new weight.
   */
  #handleCanisterPickups(state: TetherState): void {
    for (const child of this.#canisters.group.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Image) || !child.active)
        continue;
      if (!child.getData('settled')) continue;

      const dist = Phaser.Math.Distance.Between(
        child.x,
        child.y,
        this.#player.x,
        this.#player.y,
      );
      if (dist > 24) continue;

      const tier = CanisterPool.tier(child);
      CanisterPool.kill(child);

      if (state === 'tethered') {
        const result = this.#tree.deliver(CATALYST_VALUE[tier]);
        bus.emit('CATALYSTS_DELIVERED', {
          totalPct: result.maturityPct,
          count: 1,
        });
        continue;
      }

      this.#carry.add(tier);
      this.#player.setSpeedMultiplier(this.#carry.speedMultiplier());
      bus.emit('CATALYSTS_CARRIED', {
        tiers: this.#carry.tiers,
        cap: 3,
      });
    }
  }
```

Add `CATALYST_VALUE` to the config import list.

Now handle delivery of the *carried* stack on aura entry. Find the tether-state-change block:

```typescript
    if (state !== this.#lastTetherState) {
      this.#lastTetherState = state;
      bus.emit('TETHER_STATE_CHANGED', { state });
      this.#auraSprite.setTint(
```

Immediately after this block's closing brace (after the `setTint` call and its closing `);` and the
block's own closing `}`), add:

```typescript
    if (state === 'tethered' && this.#carry.count > 0) {
      const { totalPct, count } = this.#carry.deliverAll();
      const result = this.#tree.deliver(totalPct);
      this.#player.setSpeedMultiplier(1);
      bus.emit('CATALYSTS_CARRIED', { tiers: [], cap: 3 });
      bus.emit('CATALYSTS_DELIVERED', {
        totalPct: result.maturityPct,
        count,
      });
    }
```

Placing this check outside the `if (state !== this.#lastTetherState)` block (rather than inside it) is
deliberate: delivery must fire every frame the player is tethered with a non-empty carry stack, not only
on the single frame the state transitions — otherwise a player who is already tethered when a canister
magnet-pulls into their carry cap would never trigger this path, since no tether-state *change* occurs.
The `#handleCanisterPickups` method above already handles the "already tethered" case directly at pickup
time, so in practice this block mainly covers "walked into the aura while carrying" — but it is written
to run unconditionally each frame precisely so it cannot miss that second case either.

- [ ] **Step 3: On death, clear the carry stack**

In `#endRun()`, add `this.#carry.clear();` as the first line of the method body. This has no gameplay
effect today (the run is over regardless, and nothing reads carry state after `GAME_OVER` fires), but it
matches SRS 3.3's explicit statement that carried catalysts are lost on death, and avoids leaving stale
carried-catalyst state sitting in memory for a scene instance that in a later plan might be reused via
`RESTART_SIMULATION` rather than a full reload.

- [ ] **Step 4: Build the catalyst pip HUD**

Create `src/hud/CarriedCatalystPips.tsx`:

```tsx
/** Carried-catalyst pips, next to the maturity gauge. SRS 6.1, 3.3. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { CatalystTier } from '../game/eventBus';

const TIER_COLOR: Record<CatalystTier, string> = {
  silt: 'bg-[#a8875a]',
  nitrate: 'bg-growth',
  phyto: 'bg-[#a855f7]',
};

export function CarriedCatalystPips() {
  const [tiers, setTiers] = useState<CatalystTier[]>([]);
  const [cap, setCap] = useState(3);

  useEffect(() => {
    const onChange = (e: { tiers: CatalystTier[]; cap: number }) => {
      setTiers(e.tiers);
      setCap(e.cap);
    };
    bus.on('CATALYSTS_CARRIED', onChange);
    return () => bus.off('CATALYSTS_CARRIED', onChange);
  }, []);

  if (cap === 0) return null;

  return (
    <div className="flex gap-1">
      {Array.from({ length: cap }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < tiers.length ? TIER_COLOR[tiers[i]] : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Compose it into the HUD**

In `src/hud/Hud.tsx`, add the import and render it beneath `TetherBeacon`:

```tsx
import { CarriedCatalystPips } from './CarriedCatalystPips';
```

```tsx
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <MaturityGauge />
        <TetherBeacon />
        <CarriedCatalystPips />
      </div>
```

- [ ] **Step 6: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`.

1. Kill an enemy outside the aura, walk out to the settled canister, and pick it up while still outside
   the aura: confirm a pip fills in near the maturity gauge and your movement speed visibly drops
   slightly.
2. Fill the carry stack to 3 canisters: confirm your speed is noticeably slower than at 1, and confirm a
   4th canister cannot be picked up (or, per this task's implementation, simply doesn't add past the
   cap — verify against the actual behavior you wired: `CarrySystem.add` returns `false` past capacity,
   and `#handleCanisterPickups` does not check that return value before killing the canister, which means
   a canister picked up past capacity vanishes without being added. Decide whether this is acceptable for
   this plan or needs a guard — see the note below).
3. Walk into the aura while carrying catalysts: confirm all pips clear at once and the maturity gauge
   jumps by the correct combined amount.
4. Pick up a canister while already standing inside the aura: confirm it cashes in instantly with no pip
   ever appearing.

**Known gap to confirm during manual verification, and fix if observed:** `#handleCanisterPickups` always
calls `CanisterPool.kill(child)` after reading its tier, even if `this.#carry.add(tier)` returns `false`
(carry stack already full). This means a 4th canister picked up while already carrying 3 disappears
without being added to the stack or delivered — a silent loss rather than the canister simply bouncing
off or being ignored. If you observe this during Step 7, fix it: only call `CanisterPool.kill(child)` in
the untethered branch if `this.#carry.add(tier)` returns `true`; otherwise leave the canister alone (it
stays settled and available for pickup once the player delivers and has capacity again). Add this
conditional now rather than leaving it for a later plan, since it's a one-line change already surfaced by
this task's own testing:

```typescript
      if (state === 'tethered') {
        const result = this.#tree.deliver(CATALYST_VALUE[tier]);
        CanisterPool.kill(child);
        bus.emit('CATALYSTS_DELIVERED', {
          totalPct: result.maturityPct,
          count: 1,
        });
        continue;
      }

      if (!this.#carry.add(tier)) continue;
      CanisterPool.kill(child);
      this.#player.setSpeedMultiplier(this.#carry.speedMultiplier());
      bus.emit('CATALYSTS_CARRIED', {
        tiers: this.#carry.tiers,
        cap: 3,
      });
```

This replaces the entire body of the `for` loop from the tier/kill lines onward in the method written in
Step 2 — apply this version instead of the one shown there, so the carry-capacity check gates the kill
correctly from the start rather than being discovered as a bug during manual testing.

- [ ] **Step 8: Run the full test suite**

Run: `npm test`
Expected: all 61 tests still pass (this task adds no new tests — it wires existing pure systems into
Phaser, and Phaser code is not unit-tested per this plan's testing strategy).

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/game/entities/Player.ts src/game/scenes/ArenaScene.ts src/hud/CarriedCatalystPips.tsx src/hud/Hud.tsx
git add src/game/entities/Player.ts src/game/scenes/ArenaScene.ts src/hud/CarriedCatalystPips.tsx src/hud/Hud.tsx
git commit -m "feat(carry): wire pickup, delivery, and the carry speed penalty

SRS 3.3. TreeSystem.deliver() finally has a real caller: canisters cash
in instantly while tethered, or join the capped carry stack and slow the
player until delivered on the next aura entry."
```

---

## Definition of done for this plan

All of the following must hold before this plan is considered complete.

- [ ] `npm run build` exits 0 with `strict: true`.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` passes 61 tests (26 carried over from Plan 1, plus 9 SpawnDirector + 5 PityDropSystem +
      9 AmmoSystem + 6 CarrySystem + 6 CanisterPhysics = 35 new).
- [ ] `grep -rnE ': any|<any>|as any|any\[\]' src --include=*.ts --include=*.tsx` finds nothing.
- [ ] `grep -rn " as " src --include=*.ts --include=*.tsx` finds only `as const`.
- [ ] A kill inside the barren ring never produces a canister and does not change the pity counter.
- [ ] A canister never settles closer to the tree than the barren ring.
- [ ] Reserve ammo climbs only while tethered; the clip refills only via reload.
- [ ] Threat pressure is visibly higher a minute into a run than at the start, and Brutes/Detonators
      appear only after their unlock times.
- [ ] A Bio-Detonator telegraphs before exploding, and killing it during the telegraph prevents the
      explosion.
- [ ] Carrying catalysts visibly slows the player, and walking into the aura cashes in the whole stack at
      once, visibly moving the maturity gauge.

## What this plan deliberately leaves out

| Deferred | Plan |
| :------- | :--- |
| Generation draft modal, 13-card pool, `GENERATION_REACHED` emission and scene pause on Generation | 3 |
| Aegis Pulse Battery, Scatter Pulser, Mag-Rail Staker, weapon-switching | 3 |
| Score formula (kills/time/generation/catalyst-delivered composite), high score persistence | 3 |
| Pause (`Esc`/`P`/window blur), `RESTART_SIMULATION`, the wave-label HUD text rendering (`DIFFICULTY_TICK` is emitted by this plan; a HUD component that displays it is not) | 3 |
| Audio, floating combat text, delivery chime, an explicit `reloading` boolean on `AMMO_UPDATED`'s payload (this plan infers it in the HUD instead — see Task 9's note) | 3 |
| Acid Spitter (E-04) | cut entirely, per delta spec 12 |

Acid Spitter's absence is not an oversight: delta spec section 12 already cuts it to pay for the dash, and
Plan 1's own leave-out table records this. This plan's spawn-director unlock table (`DIRECTOR.unlockAtSec`
in Task 1) accordingly has no `acidSpitter` key at all.
