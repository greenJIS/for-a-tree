# For a Tree — Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended)
> or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax
> for tracking.

**Goal:** Build a playable single-screen survival loop — move, aim, dash, shoot, kill Dune Swarmers, grow the
tree by staying tethered, watch maturity decay when you leave, and die.

**Architecture:** Phaser 4 owns the simulation inside `#phaser-root`; React 19 owns the HUD as DOM layered
over the canvas; they speak only through a typed `mitt` bus. All balance logic that can be pure TypeScript
(tether state, tree maturity) lives in framework-free classes under `src/game/systems/` so it is unit-testable
without a canvas. Everything Phaser-specific is a thin adapter over those classes.

**Tech Stack:** Vite 8, React 19, TypeScript 6 (`strict`), Tailwind CSS v4, Phaser 4, mitt, Vitest.

## Source documents

- `docs/For_a_Tree_SRS.md` v2.0 — authoritative for all numbers not listed below.
- `docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md` — a **delta** against the SRS.
  Where the two disagree, the delta wins.

## Global Constraints

- **No `any`.** `strict: true`. Prefer `unknown` and narrow with type guards. Avoid `as`.
  Phaser types its physics callbacks and pool accessors loosely
  (`GameObjectWithBody | Tile`, `GameObject | null`). Narrow those with the runtime guard in
  `src/game/guards.ts` — never with a cast. Task 10 creates it.
- **Tailwind utilities only.** No CSS files, modules, or CSS-in-JS. Shared tokens go in the `@theme` block
  in `src/index.css`.
- **React never reads Phaser state directly; Phaser never touches the DOM.** All traffic crosses the bus.
- **`TREE_GROWTH_TICK`, `DIFFICULTY_TICK`, `SCORE_UPDATED` emit at 10 Hz**, not per frame. Every other event
  is edge-triggered — emitted only on actual change.
- **Design resolution is fixed 1280x720**, `Phaser.Scale.FIT` + `autoCenter: CENTER_BOTH`. No camera panning,
  no responsive game-space layout.
- **Pooling is a requirement, not an optimisation.** Bullets and enemies are pooled; target zero allocation
  inside `update`.
- **Prettier defaults** (`printWidth` 80, 2-space, single quotes, trailing commas `all`). Run
  `npx prettier --write .` before every commit.
- **Commit format:** `type(scope): short summary`, blank line, body explaining _why_ when not obvious.
  Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`, `build`, `perf`, `style`, `revert`.
  Never add a Claude/Anthropic co-author trailer.
- **All art is one spritesheet** at `src/assets/spritesheet.png`, 4x4, 512 px cells. Effects are tints,
  scales, alpha tweens, and particle emitters on existing frames. No custom shaders, no new art.

## A note on testing strategy

Pure logic (Tasks 3–5) is driven by real TDD — write the failing test, watch it fail, make it pass. The 23
tests in Tasks 4 and 5 were executed against the implementations in this document before it shipped; the
stated pass counts are measured, not estimated. `TetherSystem` and `TreeSystem` import nothing from Phaser,
which is why `vitest` can run them under `environment: 'node'` — Phaser itself cannot be imported outside a
DOM.

Phaser rendering, input, and physics (Tasks 6–12) cannot be meaningfully unit-tested without a WebGL context,
and standing up a headless canvas harness would cost more than the vertical slice itself. Those tasks are
verified by a typed build, a lint pass, and an explicit **manual verification** step that states exactly what
to do and exactly what you should see. Do not skip the manual step and do not fake a unit test for it.

## File structure

| File                               | Responsibility                                                                   |
| :--------------------------------- | :------------------------------------------------------------------------------- |
| `src/game/config.ts`               | Every balance constant, one place. No magic numbers anywhere else.               |
| `src/game/frames.ts`               | Spritesheet frame indices. Its own module so entities need not import the scene. |
| `src/game/guards.ts`               | Type guards that narrow Phaser's loosely-typed callback and pool arguments.      |
| `src/game/eventBus.ts`             | The typed `mitt` bus and its event map.                                          |
| `src/game/systems/TetherSystem.ts` | Grace meter and tether state machine. Pure, no Phaser.                           |
| `src/game/systems/TreeSystem.ts`   | Maturity, ceiling, decay, Generation, overflow, phase. Pure, no Phaser.          |
| `src/game/scenes/ArenaScene.ts`    | The one Phaser scene. Owns entities and wires systems to the bus.                |
| `src/game/entities/Player.ts`      | Player sprite, movement, aim, dash.                                              |
| `src/game/entities/BulletPool.ts`  | Pooled projectiles.                                                              |
| `src/game/entities/EnemyPool.ts`   | Pooled enemies with pursuit.                                                     |
| `src/game/createGame.ts`           | `Phaser.Game` factory and config.                                                |
| `src/game/usePhaserGame.ts`        | React hook: mount on mount, destroy on unmount.                                  |
| `src/hud/Hud.tsx`                  | HUD root, `pointer-events: none`.                                                |
| `src/hud/MaturityGauge.tsx`        | Maturity bar, ceiling tick, GEN counter, rate readout.                           |
| `src/hud/TetherBeacon.tsx`         | Three-state beacon.                                                              |
| `src/hud/HealthBar.tsx`            | HP bar and numeric readout.                                                      |
| `src/hud/DecayVignette.tsx`        | Rust-red screen-edge vignette.                                                   |
| `src/hud/GameOverCard.tsx`         | Scorecard and restart.                                                           |

---

### Task 1: Test infrastructure and strict mode

`tsconfig.app.json` is currently missing `"strict": true`, which both CLAUDE.md and SRS 8 require. There is no
test runner. Fix both before any game code exists, so every later task inherits them.

**Files:**

- Modify: `tsconfig.app.json`
- Modify: `vite.config.ts`
- Modify: `package.json`
- Create: `src/game/smoke.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `npm test` (single run) and `npm run test:watch`. All later tasks rely on these.

- [ ] **Step 1: Install Vitest**

```bash
npm install -D vitest
```

- [ ] **Step 2: Enable strict mode**

In `tsconfig.app.json`, inside `compilerOptions`, add `"strict": true` immediately above the
`/* Linting */` comment block:

```json
    "jsx": "react-jsx",

    "strict": true,

    /* Linting */
    "noUnusedLocals": true,
```

- [ ] **Step 3: Configure Vitest**

Replace `vite.config.ts` entirely:

```typescript
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

- [ ] **Step 4: Add test scripts**

In `package.json`, add to `"scripts"`:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 5: Write the smoke test**

Create `src/game/smoke.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Verify the harness runs**

Run: `npm test`
Expected: `1 passed`.

- [ ] **Step 7: Verify strict mode compiles**

Run: `npm run build`
Expected: exit 0.

The existing scaffold is three files and already null-checks `document.getElementById('root')` in
`src/main.tsx`, so no `strict` errors are expected. If one does appear, fix the code — never relax the
compiler option, and never reach for `any` or a cast to silence it.

- [ ] **Step 8: Commit**

```bash
npx prettier --write .
git add tsconfig.app.json vite.config.ts package.json package-lock.json src/game/smoke.test.ts
git commit -m "build: add vitest and enable typescript strict mode

SRS section 8 requires strict:true and it was absent from the scaffold.
Vitest is the intended runner and later tasks are written test-first."
```

---

### Task 2: Balance constants

Every number from the SRS and the delta spec, in one module. No other file may contain a balance literal.

**Files:**

- Create: `src/game/config.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: named exports `ARENA`, `TREE_POS`, `AURA_RADIUS_BASE`, `BARREN_MARGIN`, `GROWTH_CEILING`,
  `GROWTH_RATE_BASE`, `GROWTH_PER_GENERATION`, `DECAY_RATE`, `GRACE_MAX`, `GRACE_REFILL_RATE`, `PLAYER`,
  `DASH`, `CARRY`, `CARBINE`, `SWARMER`, `TICK_INTERVAL_MS`.

- [ ] **Step 1: Write the file**

Create `src/game/config.ts`:

```typescript
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
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/game/config.ts
git add src/game/config.ts
git commit -m "feat(config): add balance constants from SRS and delta spec

Single source for every tuned number so balance passes touch one file."
```

---

### Task 3: Typed event bus

**Files:**

- Create: `src/game/eventBus.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `bus` (a `mitt` emitter), and the exported types `TetherState`, `CatalystTier`, `UpgradeCard`,
  `GameEvents`. Every later task imports `bus` from here.

- [ ] **Step 1: Write the file**

Create `src/game/eventBus.ts`. This is SRS 2.2 plus the three changes in delta spec 6. Events not used by
this plan are declared anyway so later plans need not edit the map.

```typescript
/**
 * The single channel between Phaser and React. SRS 2.2, amended by
 * docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md
 * section 6.
 *
 * The Phaser scene is the source of truth. React holds a mirror for
 * rendering only and must never write game state.
 */
import mitt from 'mitt';

export type TetherState = 'tethered' | 'grace' | 'decaying';

export type CatalystTier = 'silt' | 'nitrate' | 'phyto';

export type UpgradeCard = {
  id: string;
  name: string;
  body: string;
  effect: string;
  repeatable: boolean;
};

export type GameEvents = {
  // Phaser -> React
  PLAYER_HP_CHANGED: { current: number; max: number };
  AMMO_UPDATED: {
    weaponId: string;
    clip: number;
    clipMax: number;
    reserve: number;
  };
  WEAPON_SWITCHED: { weaponId: string; unlocked: string[] };
  TREE_GROWTH_TICK: {
    maturityPct: number;
    generation: number;
    ratePerSec: number;
    ceilingPct: number;
  };
  GROWTH_STALLED: { ceilingPct: number };
  TETHER_STATE_CHANGED: { state: TetherState };
  CATALYSTS_CARRIED: { tiers: CatalystTier[]; cap: number };
  CATALYSTS_DELIVERED: { totalPct: number; count: number };
  GENERATION_REACHED: { generation: number; cards: UpgradeCard[] };
  AEGIS_STATUS: {
    charges: number;
    capacity: number;
    activeRemainingMs: number;
  };
  DASH_STATUS: { cooldownRemainingMs: number; ready: boolean };
  DIFFICULTY_TICK: {
    elapsedMs: number;
    waveLabel: number;
    aliveEnemies: number;
  };
  SCORE_UPDATED: { score: number };
  GAME_OVER: {
    score: number;
    generation: number;
    kills: number;
    survivedMs: number;
  };

  // React -> Phaser
  APPLY_UPGRADE_SELECTION: { cardId: string };
  RESUME_FROM_DRAFT: void;
  TOGGLE_PAUSE: void;
  RESTART_SIMULATION: void;
};

export const bus = mitt<GameEvents>();
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
npx prettier --write src/game/eventBus.ts
git add src/game/eventBus.ts
git commit -m "feat(bus): add typed mitt event bus

Declares the full v2.0 event map up front so later plans add emitters,
not schema edits."
```

---

### Task 4: TetherSystem

Grace is a depleting budget, not a resettable timer — delta spec 5. A resettable timer lets a player
oscillate across the aura boundary on a 0.9 s period and never decay, which is a dominant exploit.

**Files:**

- Create: `src/game/systems/TetherSystem.ts`
- Test: `src/game/systems/TetherSystem.test.ts`

**Interfaces:**

- Consumes: `GRACE_MAX`, `GRACE_REFILL_RATE` from `src/game/config.ts`; type `TetherState` from
  `src/game/eventBus.ts`.
- Produces: `class TetherSystem` with `update(dtSec: number, inAura: boolean): TetherState`,
  getters `state: TetherState` and `grace: number`, and `reset(): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/TetherSystem.test.ts`:

```typescript
import { beforeEach, describe, expect, it } from 'vitest';
import { TetherSystem } from './TetherSystem';

describe('TetherSystem', () => {
  let tether: TetherSystem;

  beforeEach(() => {
    tether = new TetherSystem();
  });

  it('starts tethered with a full grace budget', () => {
    expect(tether.state).toBe('tethered');
    expect(tether.grace).toBeCloseTo(1.0);
  });

  it('enters grace immediately on leaving the aura', () => {
    expect(tether.update(0.1, false)).toBe('grace');
  });

  it('decays once the grace budget is spent', () => {
    tether.update(0.9, false);
    expect(tether.state).toBe('grace');
    tether.update(0.2, false);
    expect(tether.state).toBe('decaying');
    expect(tether.grace).toBe(0);
  });

  it('refills grace at half rate while tethered', () => {
    tether.update(1.0, false);
    expect(tether.grace).toBe(0);
    tether.update(1.0, true);
    expect(tether.grace).toBeCloseTo(0.5);
  });

  it('never refills grace above the maximum', () => {
    tether.update(10, true);
    expect(tether.grace).toBeCloseTo(1.0);
  });

  it('returns to tethered instantly on re-entry even with no grace left', () => {
    tether.update(2.0, false);
    expect(tether.state).toBe('decaying');
    expect(tether.update(0.016, true)).toBe('tethered');
  });

  it('does not let boundary oscillation prevent decay indefinitely', () => {
    // Out 0.9 s, in 0.9 s, repeatedly. Drain outpaces refill 2:1, so the
    // player must eventually decay. This is the exploit the meter closes.
    let sawDecaying = false;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      tether.update(0.9, false);
      if (tether.state === 'decaying') sawDecaying = true;
      tether.update(0.9, true);
    }
    expect(sawDecaying).toBe(true);
  });

  it('resets to a full budget', () => {
    tether.update(2.0, false);
    tether.reset();
    expect(tether.state).toBe('tethered');
    expect(tether.grace).toBeCloseTo(1.0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TetherSystem`
Expected: FAIL — `Failed to resolve import "./TetherSystem"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/TetherSystem.ts`:

```typescript
/**
 * Tether state machine with a grace budget.
 *
 * Delta spec section 5. Grace drains while outside the aura and refills at
 * half rate while inside, so restoring a full second of grace costs two
 * seconds of tethering. SRS 3.2's resettable timer allowed indefinite
 * boundary oscillation with no decay.
 *
 * Pure TypeScript by design — no Phaser import — so it is unit-testable.
 */
import { GRACE_MAX, GRACE_REFILL_RATE } from '../config';
import type { TetherState } from '../eventBus';

export class TetherSystem {
  #state: TetherState = 'tethered';
  #grace: number = GRACE_MAX;

  get state(): TetherState {
    return this.#state;
  }

  get grace(): number {
    return this.#grace;
  }

  /**
   * Advance one frame.
   *
   * @param dtSec  Delta time in seconds.
   * @param inAura Whether the player is within the live aura radius.
   * @returns The state after this update.
   */
  update(dtSec: number, inAura: boolean): TetherState {
    if (inAura) {
      this.#grace = Math.min(GRACE_MAX, this.#grace + GRACE_REFILL_RATE * dtSec);
      this.#state = 'tethered';
      return this.#state;
    }

    this.#grace = Math.max(0, this.#grace - dtSec);
    this.#state = this.#grace > 0 ? 'grace' : 'decaying';
    return this.#state;
  }

  reset(): void {
    this.#state = 'tethered';
    this.#grace = GRACE_MAX;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- TetherSystem`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/game/systems/
git add src/game/systems/TetherSystem.ts src/game/systems/TetherSystem.test.ts
git commit -m "feat(tether): add grace-budget tether state machine

Delta spec 5. A resettable grace timer let a player oscillate across the
aura boundary and never decay; a draining budget closes that."
```

---

### Task 5: TreeSystem

The growth ceiling is the correction at the centre of the delta spec. Without it, base growth reaches 100%
in 83 s unaided and catalysts are optional, which inverts the entire design.

**Files:**

- Create: `src/game/systems/TreeSystem.ts`
- Test: `src/game/systems/TreeSystem.test.ts`

**Interfaces:**

- Consumes: `GROWTH_CEILING`, `GROWTH_RATE_BASE`, `GROWTH_PER_GENERATION`, `DECAY_RATE` from
  `src/game/config.ts`; type `TetherState` from `src/game/eventBus.ts`.
- Produces: `type TreePhase = 1 | 2 | 3 | 4`; `type TreeUpdate` with fields `maturityPct`, `generation`,
  `ratePerSec`, `generationTriggered`, `stalledCrossing`; `class TreeSystem` with
  `update(dtSec: number, state: TetherState): TreeUpdate`, `deliver(pct: number): TreeUpdate`,
  getters `maturityPct`, `generation`, `phase`, `growthRatePerSec`, and `reset(): void`.

- [ ] **Step 1: Write the failing tests**

Create `src/game/systems/TreeSystem.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- TreeSystem`
Expected: FAIL — `Failed to resolve import "./TreeSystem"`.

- [ ] **Step 3: Write the implementation**

Create `src/game/systems/TreeSystem.ts`:

```typescript
/**
 * Tree maturity, the growth ceiling, and the Generation cycle.
 *
 * Delta spec sections 2, 2.3, 2.4 and 9.2. Tethered growth stops at 60%;
 * only delivered catalysts move the bar past it. Without the ceiling, base
 * growth reaches 100% in 83 s unaided and catalysts are optional, which
 * inverts design pillar 1.
 *
 * Pure TypeScript by design — no Phaser import — so it is unit-testable.
 */
import {
  DECAY_RATE,
  GROWTH_CEILING,
  GROWTH_PER_GENERATION,
  GROWTH_RATE_BASE,
} from '../config';
import type { TetherState } from '../eventBus';

export type TreePhase = 1 | 2 | 3 | 4;

export type TreeUpdate = {
  maturityPct: number;
  generation: number;
  ratePerSec: number;
  generationTriggered: boolean;
  stalledCrossing: boolean;
};

export class TreeSystem {
  #maturityPct = 0;
  #generation = 0;
  #wasAtCeiling = false;

  get maturityPct(): number {
    return this.#maturityPct;
  }

  get generation(): number {
    return this.#generation;
  }

  /** Zero at or above the ceiling. Delta spec 2. */
  get growthRatePerSec(): number {
    if (this.#maturityPct >= GROWTH_CEILING) return 0;
    return (
      GROWTH_RATE_BASE * (1 + GROWTH_PER_GENERATION * this.#generation)
    );
  }

  /** Half-open intervals. Delta spec 9.2. */
  get phase(): TreePhase {
    if (this.#maturityPct >= 100) return 4;
    if (this.#maturityPct >= 65) return 3;
    if (this.#maturityPct >= 25) return 2;
    return 1;
  }

  update(dtSec: number, state: TetherState): TreeUpdate {
    if (state === 'tethered') {
      this.#maturityPct = Math.min(
        GROWTH_CEILING,
        this.#maturityPct + this.growthRatePerSec * dtSec,
      );
    } else if (state === 'decaying') {
      this.#maturityPct = Math.max(0, this.#maturityPct - DECAY_RATE * dtSec);
    }

    return this.#result(false);
  }

  /**
   * Cash in delivered catalysts. Overflow carries into the next cycle and at
   * most one Generation resolves per call. Delta spec 2.3.
   */
  deliver(pct: number): TreeUpdate {
    this.#maturityPct += pct;

    if (this.#maturityPct >= 100) {
      this.#maturityPct -= 100;
      this.#generation += 1;
      return this.#result(true);
    }

    return this.#result(false);
  }

  reset(): void {
    this.#maturityPct = 0;
    this.#generation = 0;
    this.#wasAtCeiling = false;
  }

  /**
   * Builds the return value and reports an upward ceiling crossing. Delta
   * spec 6: fires on every upward crossing, because 2.4 allows decaying back
   * below the ceiling and re-crossing it.
   */
  #result(generationTriggered: boolean): TreeUpdate {
    const atCeiling = this.#maturityPct >= GROWTH_CEILING;
    const stalledCrossing = atCeiling && !this.#wasAtCeiling;
    this.#wasAtCeiling = atCeiling;

    return {
      maturityPct: this.#maturityPct,
      generation: this.#generation,
      ratePerSec: this.growthRatePerSec,
      generationTriggered,
      stalledCrossing,
    };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- TreeSystem`
Expected: `15 passed`.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: all green, 24 tests.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/game/systems/
git add src/game/systems/TreeSystem.ts src/game/systems/TreeSystem.test.ts
git commit -m "feat(tree): add maturity, growth ceiling and generation cycle

Delta spec 2. Tethered growth stops at 60% so catalysts become mandatory
income rather than optional surplus."
```

---

### Task 6: Mount Phaser

From here on, verification is a typed build plus an explicit manual check. Read the note on testing strategy
above before starting.

**Files:**

- Create: `src/game/frames.ts`
- Create: `src/game/scenes/ArenaScene.ts`
- Create: `src/game/createGame.ts`
- Create: `src/game/usePhaserGame.ts`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `ARENA`, `TREE_POS`, `AURA_RADIUS_BASE`, `BARREN_MARGIN` from `src/game/config.ts`.
- Produces: `FRAME` from `src/game/frames.ts`; `class ArenaScene extends Phaser.Scene` with key `'arena'`;
  `createGame(parent: HTMLElement): Phaser.Game`; `usePhaserGame(): React.RefObject<HTMLDivElement | null>`.

- [ ] **Step 1: Create the frame index module**

Frame indices live in their own module, not on the scene. Entities need them, and the scene imports the
entities — putting them on the scene creates a circular import.

Create `src/game/frames.ts`:

```typescript
/** Frame indices into the 4x4 spritesheet. Delta spec 11.2. */
export const FRAME = {
  player: 0,
  aegisDome: 1,
  auraRing: 2,
  particle: 3,
  swarmer: 4,
  brute: 5,
  detonator: 6,
  muzzleFlash: 7,
  bulletCarbine: 8,
  bulletScatter: 9,
  bulletRail: 10,
  canister: 11,
  treeSprout: 12,
  treeSapling: 13,
  groundDecal: 14,
  sandDecal: 15,
} as const;
```

- [ ] **Step 2: Create the scene**

Create `src/game/scenes/ArenaScene.ts`. Frame indices are delta spec 11.2.

```typescript
/**
 * The one Phaser scene. Owns every entity and drives the pure systems.
 * SRS 2.1.
 */
import Phaser from 'phaser';
import { AURA_RADIUS_BASE, BARREN_MARGIN, TREE_POS } from '../config';
import { FRAME } from '../frames';
import spritesheetUrl from '../../assets/spritesheet.png';

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('arena');
  }

  preload(): void {
    this.load.spritesheet('sheet', spritesheetUrl, {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1410');

    // Barren ring first, so the bright aura ring draws over it.
    // Delta spec 7.3.
    const barren = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    barren.setDisplaySize(
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
    );
    barren.setAlpha(0.25);
    barren.setTint(0x6b7280);

    const aura = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    aura.setDisplaySize(AURA_RADIUS_BASE * 2, AURA_RADIUS_BASE * 2);
    aura.setTint(0x22d3ee);

    const tree = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.treeSprout,
    );
    tree.setDisplaySize(64, 64);
  }
}
```

- [ ] **Step 3: Create the game factory**

Create `src/game/createGame.ts`:

```typescript
/**
 * Phaser.Game construction. Fixed 1280x720 with Scale.FIT and CENTER_BOTH,
 * so the arena letterboxes intact. SRS 2.3 and 8.
 */
import Phaser from 'phaser';
import { ARENA } from './config';
import { ArenaScene } from './scenes/ArenaScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA.width,
    height: ARENA.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [ArenaScene],
  });
}
```

- [ ] **Step 4: Create the mount hook**

Create `src/game/usePhaserGame.ts`. The guard matters: React 19 StrictMode double-invokes effects in
development, and without it you get two `Phaser.Game` instances and two canvases.

```typescript
/**
 * Mounts Phaser into a div on mount and destroys it on unmount.
 *
 * React StrictMode double-invokes effects in development, so the ref guard
 * is load-bearing — without it two Phaser.Game instances are created.
 */
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from './createGame';

export function usePhaserGame(): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    gameRef.current = createGame(container);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return containerRef;
}
```

- [ ] **Step 5: Mount it from App**

Replace `src/App.tsx`:

```tsx
/**
 * Application shell.
 *
 * React owns the page chrome, HUD and modal layers; Phaser owns the
 * simulation and mounts into #phaser-root. The two communicate only through
 * the typed event bus. SRS 2.1.
 */
import { usePhaserGame } from './game/usePhaserGame';

function App() {
  const containerRef = usePhaserGame();

  return (
    <main className="flex h-full w-full items-center justify-center bg-sand-950">
      <div
        className="relative aspect-video w-full max-w-[1280px] overflow-hidden
          border border-sand-800 bg-sand-900 shadow-2xl shadow-black/60"
      >
        <div id="phaser-root" ref={containerRef} className="absolute inset-0" />
      </div>
    </main>
  );
}

export default App;
```

- [ ] **Step 6: Add the image module declaration**

`allowArbitraryExtensions` is on but `types: ["vite/client"]` should already cover `*.png`. Verify with the
build; if `import spritesheetUrl from '../../assets/spritesheet.png'` errors, create `src/vite-env.d.ts`:

```typescript
/// <reference types="vite/client" />
```

- [ ] **Step 7: Verify the build**

Run: `npm run build`
Expected: exit 0.

- [ ] **Step 8: Manual verification**

Run: `npm run dev`, open the printed URL.

Expected: a dark arena with **exactly one** canvas, a bright cyan ring centred left of middle, a larger faint
grey ring around it, and a small sprout at the ring's centre. Resize the window — the arena scales and
letterboxes, never stretches.

If you see two canvases, the StrictMode guard in Step 3 is wrong. If the sprites are garbled or offset, the
spritesheet is not 2048x2048 with 512 px cells — see delta spec 11.1 and rebuild it before continuing.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/
git add src/game/frames.ts src/game/scenes/ArenaScene.ts src/game/createGame.ts src/game/usePhaserGame.ts src/App.tsx
git commit -m "feat(engine): mount phaser scene with aura and barren rings

Scale.FIT at a fixed 1280x720 per SRS 2.3. The faint outer ring is the
barren boundary from delta spec 7.3."
```

---

### Task 7: Player movement and aim

**Files:**

- Create: `src/game/entities/Player.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `PLAYER`, `ARENA` from `src/game/config.ts`; `FRAME` from `src/game/frames.ts`.
- Produces: `class Player` with constructor `(scene: Phaser.Scene, x: number, y: number)`, `update(): void`,
  getters `x: number` and `y: number`, and readonly `sprite: Phaser.Physics.Arcade.Image`. It reads delta
  time from Phaser rather than taking it, because Arcade Physics integrates velocity itself.

- [ ] **Step 1: Create the player**

Create `src/game/entities/Player.ts`.

Two details worth not improvising on. First, `addKey` per key rather than `addKeys` — `addKeys` returns a
loose record that would need a cast, and the Global Constraints route all narrowing through
`src/game/guards.ts`. Second, SRS 3.1 specifies "`WASD` / arrow keys", so both sets are bound and each
direction reads as the OR of its two keys. `addCapture` stops the arrow keys scrolling the host page.

```typescript
/**
 * Player entity: 8-direction movement with instant response, mouse aim.
 * SRS 3.1.
 */
import Phaser from 'phaser';
import { ARENA, PLAYER } from '../config';
import { FRAME } from '../frames';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Image;

  readonly #scene: Phaser.Scene;
  readonly #keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.#scene = scene;

    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
    this.sprite.setCollideWorldBounds(true);
    scene.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.#keys = {
      up: [keyboard.addKey(codes.W), keyboard.addKey(codes.UP)],
      down: [keyboard.addKey(codes.S), keyboard.addKey(codes.DOWN)],
      left: [keyboard.addKey(codes.A), keyboard.addKey(codes.LEFT)],
      right: [keyboard.addKey(codes.D), keyboard.addKey(codes.RIGHT)],
    };

    keyboard.addCapture([
      codes.UP,
      codes.DOWN,
      codes.LEFT,
      codes.RIGHT,
    ]);
  }

  static #anyDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((key) => key.isDown);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  update(): void {
    const dir = new Phaser.Math.Vector2(
      (Player.#anyDown(this.#keys.right) ? 1 : 0) -
        (Player.#anyDown(this.#keys.left) ? 1 : 0),
      (Player.#anyDown(this.#keys.down) ? 1 : 0) -
        (Player.#anyDown(this.#keys.up) ? 1 : 0),
    );

    if (dir.lengthSq() > 0) dir.normalize();
    this.sprite.setVelocity(
      dir.x * PLAYER.moveSpeed,
      dir.y * PLAYER.moveSpeed,
    );

    const pointer = this.#scene.input.activePointer;
    this.sprite.setRotation(
      Phaser.Math.Angle.Between(
        this.sprite.x,
        this.sprite.y,
        pointer.worldX,
        pointer.worldY,
      ),
    );
  }
}
```

- [ ] **Step 2: Wire the player into the scene**

In `src/game/scenes/ArenaScene.ts`, add the import and a field, construct in `create()`, and add `update()`:

```typescript
import { Player } from '../entities/Player';

// ...inside the class, above the constructor:
  #player!: Player;

// ...at the end of create():
    this.#player = new Player(this, TREE_POS.x, TREE_POS.y);

// ...new method on the class:
  override update(): void {
    this.#player.update();
  }
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`.

Expected: the mech spawns at the tree. `WASD` **and** the arrow keys each move it at a constant speed in 8
directions, and diagonals are **not** faster than cardinals — that is the `normalize()` call. The arrow keys
must not scroll the page. The barrel tracks the mouse cursor smoothly.
The mech cannot leave the arena on any edge.

If the mech drifts after you release a key, `setVelocity` is not being called every frame.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/
git add src/game/entities/Player.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(player): add 8-direction movement and mouse aim

Normalised input vector so diagonals are not faster, per SRS 3.1."
```

---

### Task 8: Dash

Delta spec 3. The dash is what makes a swarm a positional threat rather than a damage race, and it is the only
way a loaded player escapes a blockade on the return trip.

**Files:**

- Modify: `src/game/entities/Player.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `DASH` from config; `bus` from `src/game/eventBus.ts`.
- Produces: `Player.tryDash(): boolean`, `Player.isDashing: boolean`. `ArenaScene` emits `DASH_STATUS`.

- [ ] **Step 1: Add dash state to the player**

In `src/game/entities/Player.ts`, add these imports and fields:

```typescript
import { ARENA, DASH, PLAYER } from '../config';
import { bus } from '../eventBus';

// fields on the class:
  #dashUntilMs = 0;
  #dashReadyAtMs = 0;
  #dashVector = new Phaser.Math.Vector2(0, 0);
  #shiftKey!: Phaser.Input.Keyboard.Key;
```

In the constructor, after the other keys:

```typescript
    this.#shiftKey = keyboard.addKey(
      Phaser.Input.Keyboard.KeyCodes.SHIFT,
    );
```

- [ ] **Step 2: Add the dash methods**

Add to `Player`:

```typescript
  get isDashing(): boolean {
    return this.#scene.time.now < this.#dashUntilMs;
  }

  /**
   * Start a dash if off cooldown. Direction is the current movement input,
   * or the aim vector when standing still. Delta spec 3.
   */
  tryDash(moveDir: Phaser.Math.Vector2): boolean {
    const now = this.#scene.time.now;
    if (now < this.#dashReadyAtMs || this.isDashing) return false;

    this.#dashVector =
      moveDir.lengthSq() > 0
        ? moveDir.clone().normalize()
        : new Phaser.Math.Vector2(
            Math.cos(this.sprite.rotation),
            Math.sin(this.sprite.rotation),
          );

    this.#dashUntilMs = now + DASH.durationMs;
    this.#dashReadyAtMs = now + DASH.cooldownMs;

    bus.emit('DASH_STATUS', {
      cooldownRemainingMs: DASH.cooldownMs,
      ready: false,
    });
    this.#scene.time.delayedCall(DASH.cooldownMs, () => {
      bus.emit('DASH_STATUS', { cooldownRemainingMs: 0, ready: true });
    });

    for (let i = 0; i < 3; i += 1) {
      this.#scene.time.delayedCall(i * 50, () => this.#spawnGhost());
    }

    return true;
  }

  #spawnGhost(): void {
    const ghost = this.#scene.add.image(
      this.sprite.x,
      this.sprite.y,
      'sheet',
      FRAME.player,
    );
    ghost.setDisplaySize(40, 40);
    ghost.setRotation(this.sprite.rotation);
    ghost.setAlpha(0.4);
    this.#scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 200,
      onComplete: () => ghost.destroy(),
    });
  }
```

- [ ] **Step 3: Apply dash velocity in update**

Replace the body of `Player.update()` so the dash overrides normal movement while active:

```typescript
  update(): void {
    const dir = new Phaser.Math.Vector2(
      (Player.#anyDown(this.#keys.right) ? 1 : 0) -
        (Player.#anyDown(this.#keys.left) ? 1 : 0),
      (Player.#anyDown(this.#keys.down) ? 1 : 0) -
        (Player.#anyDown(this.#keys.up) ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();

    if (Phaser.Input.Keyboard.JustDown(this.#shiftKey)) {
      this.tryDash(dir);
    }

    if (this.isDashing) {
      const speed = DASH.distance / (DASH.durationMs / 1000);
      this.sprite.setVelocity(
        this.#dashVector.x * speed,
        this.#dashVector.y * speed,
      );
    } else {
      this.sprite.setVelocity(
        dir.x * PLAYER.moveSpeed,
        dir.y * PLAYER.moveSpeed,
      );
    }

    const pointer = this.#scene.input.activePointer;
    this.sprite.setRotation(
      Phaser.Math.Angle.Between(
        this.sprite.x,
        this.sprite.y,
        pointer.worldX,
        pointer.worldY,
      ),
    );
  }
```

- [ ] **Step 4: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`.

Expected: `Shift` while holding a direction lunges roughly 180 px in about 0.15 s, leaving three fading
ghosts. `Shift` again immediately does nothing; after about 1.6 s it works again. `Shift` while standing
still dashes toward the cursor. The dash still stops at the arena bounds.

Measure it once: dash from the tree toward the right wall and confirm the displacement is close to 180 px
against the 440 px aura diameter as a ruler.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/
git add src/game/entities/Player.ts
git commit -m "feat(player): add dash with i-frames and cooldown

Delta spec 3. Makes crowd size a positional threat rather than a damage
race, and makes the loaded return trip survivable."
```

---

### Task 9: Tether, tree growth, and the HUD

Wires the two pure systems from Tasks 4 and 5 into the scene, emits at 10 Hz, and renders the HUD that makes
the ceiling legible.

**Files:**

- Modify: `src/game/scenes/ArenaScene.ts`
- Create: `src/hud/Hud.tsx`
- Create: `src/hud/MaturityGauge.tsx`
- Create: `src/hud/TetherBeacon.tsx`
- Create: `src/hud/DecayVignette.tsx`
- Modify: `src/App.tsx`

**Interfaces:**

- Consumes: `TetherSystem`, `TreeSystem`, `bus`, `TICK_INTERVAL_MS`, `AURA_RADIUS_BASE`, `GROWTH_CEILING`.
- Produces: `<Hud />`. Scene emits `TREE_GROWTH_TICK` at 10 Hz, and `TETHER_STATE_CHANGED` and
  `GROWTH_STALLED` edge-triggered.

- [ ] **Step 1: Drive the systems from the scene**

In `src/game/scenes/ArenaScene.ts`, add imports and fields:

```typescript
import { TetherSystem } from '../systems/TetherSystem';
import { TreeSystem } from '../systems/TreeSystem';
import { bus } from '../eventBus';
import { GROWTH_CEILING, TICK_INTERVAL_MS } from '../config';
import type { TetherState } from '../eventBus';

// fields:
  #tether = new TetherSystem();
  #tree = new TreeSystem();
  #auraSprite!: Phaser.GameObjects.Image;
  #treeSprite!: Phaser.GameObjects.Image;
  #lastTetherState: TetherState = 'tethered';
  #msSinceTick = 0;
```

Then replace the body of `create()` so the aura and tree images are kept as fields rather than discarded as
local `const`s — `update()` needs to retint and resize them every frame:

```typescript
  create(): void {
    this.cameras.main.setBackgroundColor('#1a1410');

    const barren = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    barren.setDisplaySize(
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
    );
    barren.setAlpha(0.25);
    barren.setTint(0x6b7280);

    this.#auraSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    this.#auraSprite.setDisplaySize(
      AURA_RADIUS_BASE * 2,
      AURA_RADIUS_BASE * 2,
    );
    this.#auraSprite.setTint(0x22d3ee);

    this.#treeSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.treeSprout,
    );
    this.#treeSprite.setDisplaySize(64, 64);

    this.#player = new Player(this, TREE_POS.x, TREE_POS.y);
  }
```

- [ ] **Step 2: Replace the scene update**

```typescript
  override update(_time: number, delta: number): void {
    const dtSec = delta / 1000;
    this.#player.update();

    const dist = Phaser.Math.Distance.Between(
      this.#player.x,
      this.#player.y,
      TREE_POS.x,
      TREE_POS.y,
    );
    const state = this.#tether.update(dtSec, dist <= AURA_RADIUS_BASE);

    if (state !== this.#lastTetherState) {
      this.#lastTetherState = state;
      bus.emit('TETHER_STATE_CHANGED', { state });
      this.#auraSprite.setTint(
        state === 'tethered'
          ? 0x22d3ee
          : state === 'grace'
            ? 0xfbbf24
            : 0xf43f5e,
      );
    }

    const result = this.#tree.update(dtSec, state);
    if (result.stalledCrossing) {
      bus.emit('GROWTH_STALLED', { ceilingPct: GROWTH_CEILING });
    }

    const phaseSize = [0, 64, 96, 128, 160][this.#tree.phase];
    this.#treeSprite.setDisplaySize(phaseSize, phaseSize);
    this.#treeSprite.setFrame(
      this.#tree.phase === 1 ? FRAME.treeSprout : FRAME.treeSapling,
    );

    this.#msSinceTick += delta;
    if (this.#msSinceTick >= TICK_INTERVAL_MS) {
      this.#msSinceTick = 0;
      bus.emit('TREE_GROWTH_TICK', {
        maturityPct: result.maturityPct,
        generation: result.generation,
        ratePerSec: result.ratePerSec,
        ceilingPct: GROWTH_CEILING,
      });
    }
  }
```

- [ ] **Step 3: Build the maturity gauge**

Create `src/hud/MaturityGauge.tsx`. The ceiling tick and the `CATALYST REQUIRED` swap are the whole tutorial
for the growth ceiling — delta spec 7.1.

```tsx
/**
 * Maturity gauge with the growth-ceiling tick mark. Delta spec 7.1.
 *
 * Below the ceiling the fill is growth-coloured and the live rate shows.
 * At or above it the fill switches to the catalyst colour and the rate is
 * replaced by CATALYST REQUIRED — the only tutorial the ceiling gets.
 */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function MaturityGauge() {
  const [maturityPct, setMaturityPct] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [ratePerSec, setRatePerSec] = useState(0);
  const [ceilingPct, setCeilingPct] = useState(60);

  useEffect(() => {
    const onTick = (e: {
      maturityPct: number;
      generation: number;
      ratePerSec: number;
      ceilingPct: number;
    }) => {
      setMaturityPct(e.maturityPct);
      setGeneration(e.generation);
      setRatePerSec(e.ratePerSec);
      setCeilingPct(e.ceilingPct);
    };
    bus.on('TREE_GROWTH_TICK', onTick);
    return () => bus.off('TREE_GROWTH_TICK', onTick);
  }, []);

  const stalled = maturityPct >= ceilingPct;

  return (
    <div className="flex w-80 flex-col gap-1">
      <div className="flex justify-between text-xs tracking-widest uppercase">
        <span className="text-white/70">Maturity</span>
        <span className="text-growth">Gen {generation}</span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${
            stalled ? 'bg-grace' : 'bg-growth'
          }`}
          style={{ width: `${Math.min(100, maturityPct)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80"
          style={{ left: `${ceilingPct}%` }}
        />
      </div>

      <div className="text-center text-[10px] tracking-widest uppercase">
        {stalled ? (
          <span className="text-grace">Catalyst required</span>
        ) : (
          <span className="text-white/50">
            +{ratePerSec.toFixed(2)} %/s
          </span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Build the tether beacon**

Create `src/hud/TetherBeacon.tsx`:

```tsx
/** Three-state tether beacon. SRS 6.1. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { TetherState } from '../game/eventBus';

const LABEL: Record<TetherState, string> = {
  tethered: 'Tethered',
  grace: 'Leaving',
  decaying: 'Decaying -0.6 %/s',
};

const STYLE: Record<TetherState, string> = {
  tethered: 'text-tether',
  grace: 'text-grace animate-pulse',
  decaying: 'text-decay animate-pulse',
};

export function TetherBeacon() {
  const [state, setState] = useState<TetherState>('tethered');

  useEffect(() => {
    const onChange = (e: { state: TetherState }) => setState(e.state);
    bus.on('TETHER_STATE_CHANGED', onChange);
    return () => bus.off('TETHER_STATE_CHANGED', onChange);
  }, []);

  return (
    <div className={`text-xs tracking-widest uppercase ${STYLE[state]}`}>
      {LABEL[state]}
    </div>
  );
}
```

- [ ] **Step 5: Build the decay vignette**

Create `src/hud/DecayVignette.tsx`. SRS 6.2 calls this the primary corner-of-the-eye signal that the run is
bleeding.

```tsx
/** Rust-red screen-edge vignette while decaying. SRS 6.2. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { TetherState } from '../game/eventBus';

export function DecayVignette() {
  const [decaying, setDecaying] = useState(false);

  useEffect(() => {
    const onChange = (e: { state: TetherState }) =>
      setDecaying(e.state === 'decaying');
    bus.on('TETHER_STATE_CHANGED', onChange);
    return () => bus.off('TETHER_STATE_CHANGED', onChange);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity
        duration-400 ${decaying ? 'opacity-100' : 'opacity-0'}`}
      style={{
        boxShadow: 'inset 0 0 160px 40px rgba(244, 63, 94, 0.55)',
      }}
    />
  );
}
```

- [ ] **Step 6: Compose the HUD**

Create `src/hud/Hud.tsx`:

```tsx
/** HUD root. Layered over the canvas at z-20, never intercepts input. */
import { DecayVignette } from './DecayVignette';
import { MaturityGauge } from './MaturityGauge';
import { TetherBeacon } from './TetherBeacon';

export function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <DecayVignette />
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <MaturityGauge />
        <TetherBeacon />
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Layer the HUD over the canvas**

In `src/App.tsx`, import `Hud` and render it after the canvas div, and add `z-10` to the canvas div:

```tsx
        <div
          id="phaser-root"
          ref={containerRef}
          className="absolute inset-0 z-10"
        />
        <Hud />
```

- [ ] **Step 8: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 9: Manual verification**

Run: `npm run dev`. This is the first point where the core design is observable, so check all of it:

1. Stand still at the tree. The gauge fills and the rate reads `+1.20 %/s`.
2. Time it. The bar stops at the ceiling tick in about **50 seconds**, the fill turns amber, and the readout
   changes to `CATALYST REQUIRED`. It must not pass the tick.
3. Walk out of the aura. The beacon reads `LEAVING` in amber and the ring desaturates. Growth is frozen but
   nothing is lost yet.
4. Stay out past one second. The beacon reads `DECAYING`, the ring turns red, the vignette fades in, and the
   bar falls.
5. Walk back in. The beacon returns to `TETHERED` instantly and the vignette fades out.
6. Now oscillate across the boundary roughly every second. You must **still** reach `DECAYING` within a few
   cycles — if you can hold `LEAVING` forever, the grace meter in Task 4 is wired wrong.

- [ ] **Step 10: Commit**

```bash
npx prettier --write src/
git add src/game/scenes/ArenaScene.ts src/hud/ src/App.tsx
git commit -m "feat(hud): wire tether and tree systems to the maturity hud

Delta spec 7.1. The ceiling tick and the CATALYST REQUIRED swap are the
only tutorial the growth ceiling gets."
```

---

### Task 10: Carbine and bullet pool

**Files:**

- Create: `src/game/guards.ts`
- Create: `src/game/entities/BulletPool.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `CARBINE`, `ARENA` from `src/game/config.ts`; `FRAME` from `src/game/frames.ts`.
- Produces: `isArcadeImage(obj: unknown): obj is Phaser.Physics.Arcade.Image` from `src/game/guards.ts`,
  used by Tasks 11 and 12 as well; `class BulletPool` with `constructor(scene: Phaser.Scene, size: number)`,
  `fire(x: number, y: number, rotation: number): void`, `readonly group: Phaser.Physics.Arcade.Group`,
  `cull(): void`, and `static kill(bullet: Phaser.Physics.Arcade.Image): void`.

- [ ] **Step 1: Create the type guard**

Phaser's pool accessors return `Phaser.GameObjects.GameObject | null` and its overlap callbacks hand you
`GameObjectWithBody | Tile`. Both need narrowing. `Phaser.Physics.Arcade.Image` is a real runtime class, so
`instanceof` narrows it properly and no cast is needed anywhere in the codebase.

Create `src/game/guards.ts`:

```typescript
/**
 * Narrowing helpers for Phaser's loosely-typed boundaries.
 *
 * Global Constraints ban `as`. Phaser's physics overlap callbacks and group
 * accessors are typed as unions, so this guard is the sanctioned way to get
 * a concrete type out of them.
 */
import Phaser from 'phaser';

export function isArcadeImage(
  obj: unknown,
): obj is Phaser.Physics.Arcade.Image {
  return obj instanceof Phaser.Physics.Arcade.Image;
}
```

- [ ] **Step 2: Create the pool**

Create `src/game/entities/BulletPool.ts`. Pooling is a Global Constraint, not an optimisation — the pool is
pre-allocated once and `fire` never constructs.

```typescript
/**
 * Pre-allocated projectile pool. SRS 8 requires zero runtime allocation in
 * update, so the group is filled once at construction and recycled.
 */
import Phaser from 'phaser';
import { ARENA, CARBINE } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';

export class BulletPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, size: number) {
    this.group = scene.physics.add.group({
      defaultKey: 'sheet',
      defaultFrame: FRAME.bulletCarbine,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.bulletCarbine,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  fire(x: number, y: number, rotation: number): void {
    const bullet: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(bullet)) return;

    bullet.enableBody(true, x, y, true, true);
    bullet.setDisplaySize(20, 8);
    bullet.setRotation(rotation);
    bullet.setVelocity(
      Math.cos(rotation) * CARBINE.bulletSpeed,
      Math.sin(rotation) * CARBINE.bulletSpeed,
    );
  }

  /** Recycle anything that has left the arena. */
  cull(): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const bullet = child;
      if (
        bullet.x < -32 ||
        bullet.x > ARENA.width + 32 ||
        bullet.y < -32 ||
        bullet.y > ARENA.height + 32
      ) {
        bullet.disableBody(true, true);
      }
    }
  }

  static kill(bullet: Phaser.Physics.Arcade.Image): void {
    bullet.disableBody(true, true);
  }
}
```

- [ ] **Step 3: Wire firing into the scene**

The carbine fires at its real rate but does not yet consume ammunition — magazine, reload and the
tethered reserve regeneration of SRS 4.2 are Plan 2. `CARBINE.magSize`, `reloadMs`, `reserveCap` and
`regenPerSec` are already in config and go unused until then; that is expected, not an oversight.

In `ArenaScene`, add fields and fire on held left mouse at the carbine's 4.0/s rate:

```typescript
import { BulletPool } from '../entities/BulletPool';
import { CARBINE } from '../config';

// fields:
  #bullets!: BulletPool;
  #nextShotAtMs = 0;

// in create():
    this.#bullets = new BulletPool(this, 200);

// in update(), after this.#player.update():
    const pointer = this.input.activePointer;
    if (pointer.leftButtonDown() && this.time.now >= this.#nextShotAtMs) {
      this.#nextShotAtMs = this.time.now + 1000 / CARBINE.fireRatePerSec;
      this.#bullets.fire(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
    }
    this.#bullets.cull();
```

- [ ] **Step 4: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Hold left mouse: bolts stream from the mech toward the cursor at a steady 4 per second
and vanish at the arena edge. Hold it for 30 seconds and confirm the framerate is stable — if it degrades,
the pool is leaking and `cull()` is not disabling bodies.

- [ ] **Step 6: Commit**

```bash
npx prettier --write src/
git add src/game/guards.ts src/game/entities/BulletPool.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(weapons): add pooled carbine projectiles

Pool is pre-allocated at 200 so update allocates nothing, per SRS 8."
```

---

### Task 11: Dune Swarmer pursuit

**Files:**

- Create: `src/game/entities/EnemyPool.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**

- Consumes: `SWARMER`, `ARENA` from `src/game/config.ts`; `FRAME` from `src/game/frames.ts`.
- Produces: `class EnemyPool` with `constructor(scene, size)`, `spawn(x: number, y: number): void`,
  `pursue(targetX: number, targetY: number): void`, `readonly group: Phaser.Physics.Arcade.Group`,
  and `static hp(enemy)` / `static setHp(enemy, value)` accessors over sprite data.

- [ ] **Step 1: Create the pool**

Create `src/game/entities/EnemyPool.ts`:

```typescript
/**
 * Pooled Dune Swarmers. Every mutant computes a live Euclidean pursuit
 * vector toward the player and ignores the tree entirely. SRS 4.3.
 */
import Phaser from 'phaser';
import { SWARMER } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';

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

  spawn(x: number, y: number): void {
    const enemy: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(enemy)) return;

    enemy.enableBody(true, x, y, true, true);
    enemy.setDisplaySize(36, 36);
    enemy.setData('hp', SWARMER.hp);
    enemy.setData('nextMeleeAtMs', 0);
  }

  /** Recompute every live pursuit vector. */
  pursue(targetX: number, targetY: number): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const enemy = child;

      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        targetX,
        targetY,
      );
      enemy.setVelocity(
        Math.cos(angle) * SWARMER.speed,
        Math.sin(angle) * SWARMER.speed,
      );
      enemy.setRotation(angle);
    }
  }

  static hp(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('hp');
    return typeof value === 'number' ? value : 0;
  }

  static setHp(enemy: Phaser.Physics.Arcade.Image, value: number): void {
    enemy.setData('hp', value);
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

  static kill(enemy: Phaser.Physics.Arcade.Image): void {
    enemy.disableBody(true, true);
  }
}
```

- [ ] **Step 2: Spawn on a fixed timer**

The real spawn director is Plan 2. For now spawn one Swarmer every 1.5 s at a random edge, at least 120 px
from the player, per SRS 2.3.

In `ArenaScene`:

```typescript
import { EnemyPool } from '../entities/EnemyPool';

// fields:
  #enemies!: EnemyPool;

// in create():
    this.#enemies = new EnemyPool(this, 60);
    this.time.addEvent({
      delay: 1500,
      loop: true,
      callback: () => this.#spawnAtEdge(),
    });

// new private method:
  #spawnAtEdge(): void {
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
        this.#enemies.spawn(x, y);
        return;
      }
    }
  }

// in update(), after the bullet cull:
    this.#enemies.pursue(this.#player.x, this.#player.y);
```

`ArenaScene` does not currently import `ARENA` — Task 6 imports only `AURA_RADIUS_BASE`, `BARREN_MARGIN` and
`TREE_POS` from config. Add it:

```typescript
import {
  ARENA,
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  GROWTH_CEILING,
  TICK_INTERVAL_MS,
  TREE_POS,
} from '../config';
```

- [ ] **Step 3: Verify the build and lint**

Run: `npm run build && npm run lint`
Expected: exit 0 from both.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Red crabs appear at the screen edges every 1.5 s and walk straight at you, rotating to
face you. None spawns on top of you. They pass through the tree without reacting to it — enemies must ignore
the tree entirely, per SRS 4.3.

- [ ] **Step 5: Commit**

```bash
npx prettier --write src/
git add src/game/entities/EnemyPool.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(enemies): add pooled dune swarmers with pursuit

Placeholder fixed-interval spawning; the threat-budget director is a
later plan. Enemies ignore the tree per SRS 4.3."
```

---

### Task 12: Damage, death, and game over

The two safety rails in SRS 3.1 are what stop the player melting instantly: 0.5 s of invulnerability after
any hit, and a per-enemy melee cadence of one tick per 0.8 s.

**Files:**

- Modify: `src/game/scenes/ArenaScene.ts`
- Create: `src/hud/HealthBar.tsx`
- Create: `src/hud/GameOverCard.tsx`
- Modify: `src/hud/Hud.tsx`

**Interfaces:**

- Consumes: `PLAYER`, `SWARMER`, `CARBINE`; `bus`; `EnemyPool`, `BulletPool`.
- Produces: scene emits `PLAYER_HP_CHANGED` and `GAME_OVER`; React renders `<HealthBar />` and
  `<GameOverCard />`.

- [ ] **Step 1: Add combat state to the scene**

```typescript
import { PLAYER, SWARMER } from '../config';
import { isArcadeImage } from '../guards';

// fields:
  #hp = PLAYER.maxHp;
  #invulnUntilMs = 0;
  #kills = 0;
  #startedAtMs = 0;
  #over = false;
```

In `create()`, record the start time and register both overlaps:

```typescript
    this.#startedAtMs = this.time.now;

    this.physics.add.overlap(
      this.#bullets.group,
      this.#enemies.group,
      (bulletObj, enemyObj) => {
        if (!isArcadeImage(bulletObj) || !isArcadeImage(enemyObj)) return;
        const bullet = bulletObj;
        const enemy = enemyObj;
        if (!bullet.active || !enemy.active) return;

        BulletPool.kill(bullet);

        const remaining = EnemyPool.hp(enemy) - CARBINE.damage;
        if (remaining <= 0) {
          EnemyPool.kill(enemy);
          this.#kills += 1;
          return;
        }

        EnemyPool.setHp(enemy, remaining);
        enemy.setTintFill(0xffffff);
        this.time.delayedCall(60, () => enemy.clearTint());
      },
    );

    this.physics.add.overlap(
      this.#player.sprite,
      this.#enemies.group,
      (_playerObj, enemyObj) => {
        if (!isArcadeImage(enemyObj)) return;
        this.#takeMeleeFrom(enemyObj);
      },
    );

    bus.emit('PLAYER_HP_CHANGED', {
      current: this.#hp,
      max: PLAYER.maxHp,
    });
```

- [ ] **Step 2: Implement the damage rails**

Both gates are required. The global i-frame window stops a crowd from melting the player in one frame; the
per-enemy cadence stops a single enemy from re-triggering every frame it overlaps.

```typescript
  #takeMeleeFrom(enemy: Phaser.Physics.Arcade.Image): void {
    if (this.#over || !enemy.active) return;

    const now = this.time.now;
    if (now < this.#invulnUntilMs) return;
    if (now < EnemyPool.nextMeleeAtMs(enemy)) return;
    if (this.#player.isDashing) return;

    EnemyPool.setNextMeleeAtMs(enemy, now + SWARMER.meleeCooldownMs);
    this.#invulnUntilMs = now + PLAYER.invulnMs;
    this.#hp = Math.max(0, this.#hp - SWARMER.melee);

    bus.emit('PLAYER_HP_CHANGED', {
      current: this.#hp,
      max: PLAYER.maxHp,
    });

    this.cameras.main.shake(80, 0.004);
    this.tweens.add({
      targets: this.#player.sprite,
      alpha: 0.2,
      duration: 1000 / PLAYER.flickerHz / 2,
      yoyo: true,
      repeat: Math.floor(
        (PLAYER.invulnMs / 1000) * PLAYER.flickerHz,
      ),
      onComplete: () => this.#player.sprite.setAlpha(1),
    });

    if (this.#hp === 0) this.#endRun();
  }

  #endRun(): void {
    this.#over = true;
    this.physics.pause();
    bus.emit('GAME_OVER', {
      score: this.#kills * 50,
      generation: this.#tree.generation,
      kills: this.#kills,
      survivedMs: this.time.now - this.#startedAtMs,
    });
  }
```

Guard the top of `update()` so a finished run stops simulating:

```typescript
    if (this.#over) return;
```

- [ ] **Step 3: Build the health bar**

Create `src/hud/HealthBar.tsx`:

```tsx
/** HP bar and numeric readout. SRS 6.1, top-left. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function HealthBar() {
  const [hp, setHp] = useState({ current: 100, max: 100 });

  useEffect(() => {
    const onChange = (e: { current: number; max: number }) => setHp(e);
    bus.on('PLAYER_HP_CHANGED', onChange);
    return () => bus.off('PLAYER_HP_CHANGED', onChange);
  }, []);

  return (
    <div className="flex w-56 flex-col gap-1">
      <div className="h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className="h-full bg-decay transition-[width] duration-150"
          style={{ width: `${(hp.current / hp.max) * 100}%` }}
        />
      </div>
      <span className="text-xs tracking-widest text-white/70 uppercase">
        HP {Math.round(hp.current)} / {hp.max}
      </span>
    </div>
  );
}
```

- [ ] **Step 4: Build the game over card**

Create `src/hud/GameOverCard.tsx`. It sits on the modal layer at `z-30` with `pointer-events: auto`, per
SRS 2.1. Restart is wired in Plan 3; for now it reloads.

```tsx
/** Game-over scorecard on the modal layer. SRS 2.1, z-30. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Summary = {
  score: number;
  generation: number;
  kills: number;
  survivedMs: number;
};

export function GameOverCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const onOver = (e: Summary) => setSummary(e);
    bus.on('GAME_OVER', onOver);
    return () => bus.off('GAME_OVER', onOver);
  }, []);

  if (!summary) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80">
      <div className="flex flex-col items-center gap-4 border border-sand-800 bg-sand-900 px-12 py-10">
        <h2 className="text-2xl tracking-[0.3em] text-decay uppercase">
          Guardian Fallen
        </h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-white/70">
          <dt>Generations</dt>
          <dd className="text-right text-growth">{summary.generation}</dd>
          <dt>Kills</dt>
          <dd className="text-right">{summary.kills}</dd>
          <dt>Survived</dt>
          <dd className="text-right">
            {Math.floor(summary.survivedMs / 1000)}s
          </dd>
          <dt>Score</dt>
          <dd className="text-right">{summary.score}</dd>
        </dl>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 border border-growth px-6 py-2 text-xs tracking-widest text-growth uppercase hover:bg-growth/10"
        >
          Redeploy
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Add both to the HUD**

Replace `src/hud/Hud.tsx` entirely:

```tsx
/** HUD root. Layered over the canvas at z-20, never intercepts input. */
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

      <GameOverCard />
    </div>
  );
}
```

- [ ] **Step 6: Verify build, lint, and the full suite**

Run: `npm run build && npm run lint && npm test`
Expected: exit 0 from all three; 24 tests pass.

- [ ] **Step 7: Manual verification**

Run: `npm run dev`.

1. Shoot a Swarmer twice — 2 x 22 is 44 against 25 HP, so one bolt should kill it. Confirm one bolt is enough
   and the bolt disappears on impact.
2. Let a Swarmer touch you. HP drops by 6, the screen shakes, and the mech flickers for half a second.
3. Stand in a crowd. You should lose at most about 12 HP per second no matter how many are touching you —
   that is the 0.5 s i-frame rail working. If a crowd deletes you instantly, the `#invulnUntilMs` check is
   wrong.
4. Dash through a crowd. You should take no damage during the lunge.
5. Die. The scorecard appears, enemies freeze, and `Redeploy` restarts the page.

- [ ] **Step 8: Commit**

```bash
npx prettier --write src/
git add src/game/scenes/ArenaScene.ts src/hud/
git commit -m "feat(combat): add damage rails, death and game over card

0.5s global i-frames plus a per-enemy 0.8s melee cadence, per SRS 3.1.
Both gates are required; either alone melts the player in a crowd."
```

---

## Definition of done for this plan

All of the following must hold before starting Plan 2.

- [ ] `npm run build` exits 0 with `strict: true`.
- [ ] `npm run lint` exits 0.
- [ ] `npm test` passes 24 tests.
- [ ] `grep -rnE ': any|<any>|as any|any\[\]' src --include=*.ts --include=*.tsx` finds nothing.
      (Matching the bare word `any` also hits ordinary English in comments, so match the syntax instead.)
- [ ] `grep -rn " as " src --include=*.ts --include=*.tsx` finds only `as const`. Every other narrowing
      goes through `isArcadeImage` in `src/game/guards.ts`.
- [ ] Standing at the tree fills the gauge to the 60% tick in ~50 s and stops there.
- [ ] Leaving the aura triggers `LEAVING`, then `DECAYING` after 1 s, with the vignette.
- [ ] Boundary oscillation cannot indefinitely prevent decay.
- [ ] Dash lunges ~180 px, grants invulnerability, and is unavailable for 1.6 s.
- [ ] A crowd of Swarmers cannot deal more than roughly 12 HP/s.
- [ ] Dying shows the scorecard.

## What this plan deliberately leaves out

These are not gaps. They are Plans 2 and 3.

| Deferred                                                                         | Plan |
| :------------------------------------------------------------------------------- | :--- |
| Spawn director, threat budget, stat ramp, Bio-Detonator, Carapace Brute          | 2    |
| Magazine, reload, ammunition reserves and tethered regeneration                  | 2    |
| Pity drops, barren zone enforcement, canister arc and magnet, carry and delivery | 2    |
| Generation draft modal, 13-card pool, Aegis, Scatter Pulser, Mag-Rail            | 3    |
| Score formula, high score, pause, blur handling, `RESTART_SIMULATION`            | 3    |
| Audio, particles, ground tile, balance pass, GitHub Pages deploy                 | 3    |
