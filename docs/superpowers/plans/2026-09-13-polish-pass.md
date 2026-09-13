# Polish Pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix five correctness bugs, wire four dead event-bus events into real HUD/audio feedback, and add the spec-required ground tiling, particle system, and music bed that were never started.

**Architecture:** No architectural change. Every fix stays inside the existing Phaser-owns-simulation / React-owns-HUD split (`CLAUDE.md`), reuses the existing `mitt` event bus, and reuses existing spritesheet frames per the "no new art" constraint. One new pure-ish module is added: `src/game/systems/ParticleFX.ts`, a thin wrapper around Phaser's particle emitter API, constructed once per scene and reused for every one-shot visual effect.

**Tech Stack:** Phaser 4 (Arcade Physics, `Phaser.GameObjects.Particles`, Web Audio via existing `SoundEffects`), React 19 + Tailwind v4, Vitest.

## Global Constraints

- No `any` type anywhere; `strict: true`; avoid `as` (from `CLAUDE.md`).
- Tailwind utility classes only for any HUD styling — no new CSS files.
- All balance/behavior numbers come from `src/game/config.ts` or existing derived getters — never invent a new literal without checking `docs/For_a_Tree_SRS.md` or `docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md` first.
- No custom shaders, no new art — every visual effect reuses existing frames in `src/game/frames.ts` via tint/scale/alpha.
- High-frequency bus events stay at 10 Hz (`TICK_INTERVAL_MS`); everything else edge-triggered. This plan does not add any new high-frequency event.
- Commit only when the user explicitly asks (do not commit automatically at the end of a task).
- Full spec: `docs/superpowers/specs/2026-09-13-polish-pass-design.md`.

---

### Task 1: Barren-zone radius tracks the live aura radius

**Files:**
- Modify: `src/game/systems/CanisterPhysics.ts`
- Modify: `src/game/systems/CanisterPhysics.test.ts`
- Modify: `src/game/entities/CanisterPool.ts`
- Modify: `src/game/scenes/ArenaScene.ts:198-209` (barren ring), `:824` (`#handleKillDrop`), `:245` (`CanisterPool` construction unaffected — only the `eject` call site at `:836` changes)

**Interfaces:**
- Produces: `computeCanisterRest(killX, killY, treeX, treeY, auraRadius, rng?)` — `auraRadius` is now a required 5th positional parameter (before the optional `rng`), replacing the module-level `BARREN_RADIUS` constant.
- Produces: `CanisterPool.eject(killX, killY, treeX, treeY, tier, auraRadius)` — `auraRadius` is now a required 6th parameter.
- Consumes: `ArenaScene`'s existing `#auraRadius` getter (`ArenaScene.ts:111-113`, already live — resizes `#auraSprite` on `wider-canopy`).

- [ ] **Step 1: Update `CanisterPhysics.ts` to take a live aura radius**

Replace the whole file:

```ts
/**
 * Canister ejection and rest-position math. SRS 3.6, clamped by delta spec
 * section 4's barren zone: a canister must never come to rest closer to the
 * tree than barrenRadius, or catalysts would cash in for free without a
 * carry step.
 *
 * barrenRadius is derived from the caller's live aura radius (not a fixed
 * constant) so that Wider Canopy moves the barren boundary outward with the
 * aura, per delta spec 4.
 *
 * Rather than tune an Arcade Physics drag body to stop at an exact point,
 * this computes the natural drag-stopping distance analytically
 * (travel = speed^2 / (2 * drag)) and clamps it, then hands the caller a
 * rest position and a duration to animate a tween over -- deterministic and
 * unit-testable without a physics engine.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { BARREN_MARGIN, CANISTER } from '../config';

export type CanisterRest = {
  x: number;
  y: number;
  travelPx: number;
  durationMs: number;
};

export function computeCanisterRest(
  killX: number,
  killY: number,
  treeX: number,
  treeY: number,
  auraRadius: number,
  rng: () => number = Math.random,
): CanisterRest {
  const homeDist = Math.hypot(treeX - killX, treeY - killY);
  const barrenRadius = auraRadius + BARREN_MARGIN;

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
  const maxAllowedTravel = Math.max(0, homeDist - barrenRadius);
  const travelPx = Math.min(naturalTravel, maxAllowedTravel);

  return {
    x: killX + dirX * travelPx,
    y: killY + dirY * travelPx,
    travelPx,
    durationMs: speed > 0 ? (travelPx / speed) * 1000 * 2 : 1,
  };
}
```

- [ ] **Step 2: Update existing tests to pass `auraRadius` explicitly**

In `src/game/systems/CanisterPhysics.test.ts`, every call to `computeCanisterRest(a, b, c, d, fixedRng(x))` becomes `computeCanisterRest(a, b, c, d, 220, fixedRng(x))` (220 is `AURA_RADIUS_BASE`, matching the existing `barrenRadius = 220 + 120` constant already declared at the top of the test file). Full updated file:

```ts
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
```

- [ ] **Step 3: Run the test file and confirm it fails on the new test only**

Run: `npx vitest run src/game/systems/CanisterPhysics.test.ts`
Expected: the 6 pre-existing tests pass (signature change is mechanical), the new "moves the barren boundary outward" test fails, because the file at this point still has the old fixed-constant behavior removed by Step 1 — actually Step 1 already implements the fix, so re-check: run this after Step 1 + Step 2 together; all 7 should PASS. (There is no separate "red" step here since Steps 1 and 2 are the fix and its test together — confirm green.)

- [ ] **Step 4: Thread `auraRadius` through `CanisterPool.eject`**

In `src/game/entities/CanisterPool.ts`, change the `eject` method signature and its call to `computeCanisterRest`:

```ts
  eject(
    killX: number,
    killY: number,
    treeX: number,
    treeY: number,
    tier: CatalystTier,
    auraRadius: number,
  ): void {
    const canister: unknown = this.group.getFirstDead(false);
    if (!(canister instanceof Phaser.GameObjects.Image)) return;

    const rest = computeCanisterRest(killX, killY, treeX, treeY, auraRadius);
```

(Everything else in the method body is unchanged.)

- [ ] **Step 5: Pass the live aura radius from `ArenaScene`, and give the barren ring a resizable field**

In `src/game/scenes/ArenaScene.ts`:

1. Add a class field next to `#auraSprite`:

```ts
  #auraSprite!: Phaser.GameObjects.Image;
  #barrenSprite!: Phaser.GameObjects.Image;
```

2. In `create()`, capture the barren ring into that field instead of a local `const`:

```ts
    // Barren ring first, so the bright aura ring draws over it.
    // Delta spec 7.3.
    this.#barrenSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    this.#barrenSprite.setDisplaySize(
      (this.#auraRadius + BARREN_MARGIN) * 2,
      (this.#auraRadius + BARREN_MARGIN) * 2,
    );
    this.#barrenSprite.setAlpha(0.25);
    this.#barrenSprite.setTint(0x6b7280);
```

   (Note: uses `this.#auraRadius`, the live getter, instead of `AURA_RADIUS_BASE` — at scene create these are equal since no upgrades are applied yet, but this makes it consistent with the resize in Step 5.3.)

3. In the `onApplyUpgrade` handler's `wider-canopy` branch (`ArenaScene.ts:404-408`), resize the barren sprite alongside the aura sprite:

```ts
      } else if (cardId === 'wider-canopy') {
        this.#auraSprite.setDisplaySize(
          this.#auraRadius * 2,
          this.#auraRadius * 2,
        );
        this.#barrenSprite.setDisplaySize(
          (this.#auraRadius + BARREN_MARGIN) * 2,
          (this.#auraRadius + BARREN_MARGIN) * 2,
        );
      }
```

4. Fix `#handleKillDrop` (`ArenaScene.ts:823-837`) to use the live radius and pass it into `eject`:

```ts
  #handleKillDrop(killX: number, killY: number): void {
    const barrenRadius = this.#auraRadius + BARREN_MARGIN;
    const homeDist = Phaser.Math.Distance.Between(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
    );
    if (homeDist < barrenRadius) return;

    const tier = this.#pity.rollOnKill();
    if (!tier) return;

    this.#canisters.eject(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
      tier,
      this.#auraRadius,
    );
  }
```

- [ ] **Step 6: Type-check and run the full test suite**

Run: `npm run build`
Expected: no type errors (the `computeCanisterRest`/`eject` signature changes are the only call sites, both updated above).

Run: `npx vitest run`
Expected: all tests pass, including the new one from Step 2.

- [ ] **Step 7: Commit**

```bash
git add src/game/systems/CanisterPhysics.ts src/game/systems/CanisterPhysics.test.ts src/game/entities/CanisterPool.ts src/game/scenes/ArenaScene.ts
git commit -m "fix(canister): barren-zone radius tracks live aura radius

Wider Canopy grew the aura sprite but the barren-zone kill/settle checks
and the barren ring visual stayed pinned to the base radius, letting
canisters drop and settle inside what should be barren ground."
```

---

### Task 2: Detonator explosion kills are counted (score correctness)

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:967-1000` (`#explodeDetonator`)

**Interfaces:**
- Consumes: `this.#kills` (existing private field, already incremented at two other call sites — `ArenaScene.ts:287`, `:575`).

No dedicated automated test exists for this (it lives in Phaser-scene orchestration with zero test harness — see Task 14). Verify manually per Step 3.

- [ ] **Step 1: Add the missing `#kills` increments**

Replace `#explodeDetonator` in `src/game/scenes/ArenaScene.ts`:

```ts
  #explodeDetonator(detonator: Phaser.Physics.Arcade.Image): void {
    const damage = EnemyPool.melee(detonator);
    const cx = detonator.x;
    const cy = detonator.y;

    this.#handleKillDrop(cx, cy);
    EnemyPool.kill(detonator);
    this.#kills += 1;
    this.#audio.alienSplat();

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
          this.#handleKillDrop(child.x, child.y);
          EnemyPool.kill(child);
          this.#kills += 1;
          this.#audio.alienSplat();
        } else {
          EnemyPool.setHp(child, remaining);
        }
      }
    }
  }
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: no type errors (`#kills` is already a `number` field mutated elsewhere the same way).

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, open the game. Survive to 45s+ so Bio-Detonators unlock. Let a Detonator explode near 2-3 Swarmers so they die in the blast. Confirm the score readout (top-right) and, after dying, the game-over kill count both reflect the detonator + its chain kills — not just kills from direct bullet damage. (Before this fix, those deaths were invisible to both.)

- [ ] **Step 4: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "fix(score): count Bio-Detonator explosion kills

Every other kill path incremented #kills; the detonator's own death and
its blast-radius chain kills silently didn't, undercounting the score
and the end-of-run kill total whenever detonators were involved."
```

---

### Task 3: Stop the detonator telegraph tween from leaking onto a recycled enemy

**Files:**
- Modify: `src/game/entities/EnemyPool.ts:80-98` (`spawn`)

**Interfaces:**
- No signature change — `spawn(x, y, kind, elapsedSec)` stays the same.

- [ ] **Step 1: Store the scene, then reset alpha and kill pending tweens on spawn**

`EnemyPool`'s constructor takes `scene: Phaser.Scene` as a parameter but never keeps it. In `src/game/entities/EnemyPool.ts`, replace the class's field declaration and constructor:

```ts
export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly #scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, size: number) {
    this.#scene = scene;
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
```

Then replace `spawn`:

```ts
  spawn(x: number, y: number, kind: MutantKind, elapsedSec: number): void {
    const enemy: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(enemy)) return;

    const stats = STATS[kind];
    const rampSteps = Math.floor(elapsedSec / 60);
    const hpMult = 1 + DIRECTOR.hpRampPer60s * rampSteps;
    const dmgMult = 1 + DIRECTOR.dmgRampPer60s * rampSteps;

    this.#scene.tweens.killTweensOf(enemy);
    enemy.enableBody(true, x, y, true, true);
    enemy.setAlpha(1);
    enemy.setFrame(stats.frame);
    enemy.setDisplaySize(stats.displaySize, stats.displaySize);
    enemy.clearTint();
    enemy.setData('kind', kind);
    enemy.setData('hp', stats.hp * hpMult);
    enemy.setData('melee', stats.melee * dmgMult);
    enemy.setData('nextMeleeAtMs', 0);
    enemy.setData('lockedUntilMs', 0);
  }
```

Every other method in the file (`pursue`, the `static` helpers) is unchanged.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Let a Bio-Detonator start its telegraph (it flashes/dims), then immediately kill it with a bullet. Keep playing under heavy spawn pressure (many enemies alive near the 60-cap) for another 30-60s and watch for any enemy flickering in alpha for no reason tied to its own state. Before the fix this was reproducible-but-rare; after the fix it should not occur at all since the tween is always killed and alpha always reset on reuse.

- [ ] **Step 4: Commit**

```bash
git add src/game/entities/EnemyPool.ts
git commit -m "fix(pool): reset alpha and kill pending tweens on enemy spawn

Detonator telegraph tweens outlived an early kill and could leak onto
whatever enemy the pool handed the same object to next."
```

---

### Task 4: Manual reload does nothing on a full magazine

**Files:**
- Modify: `src/game/systems/WeaponInventory.ts:116-120` (`startReload`)
- Modify: `src/game/systems/WeaponInventory.test.ts`

**Interfaces:**
- No signature change — `startReload(): void` stays the same.

- [ ] **Step 1: Write the failing test**

Add to `src/game/systems/WeaponInventory.test.ts`, inside the existing `describe('WeaponInventory', ...)` block:

```ts
  it('does nothing when manually reloading a full magazine', () => {
    expect(inv.activeAmmo.clip).toBe(24); // carbine starts full
    inv.startReload();
    expect(inv.activeAmmo.reloading).toBe(false);
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/game/systems/WeaponInventory.test.ts -t "full magazine"`
Expected: FAIL — `inv.activeAmmo.reloading` is currently `true` because `startReload` has no clip check.

- [ ] **Step 3: Add the full-clip guard**

In `src/game/systems/WeaponInventory.ts`:

```ts
  startReload(): void {
    const id = this.#activeId;
    const cfg = WEAPON_CONFIGS[id];
    if (this.#reloadRemainingMs[id] > 0 || this.#clips[id] >= cfg.magSize) return;
    this.#reloadRemainingMs[id] = cfg.reloadMs;
  }
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/game/systems/WeaponInventory.test.ts`
Expected: PASS, including the new test and every pre-existing one (the existing "allows manual reload via startReload" test fires one round first, so the clip is 23/24 at that point — below `magSize` — so the new guard doesn't affect it).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/WeaponInventory.ts src/game/systems/WeaponInventory.test.ts
git commit -m "fix(weapons): manual reload no-ops on a full magazine

Pressing R with a full clip started a real reload cycle that transferred
zero ammo and blocked firing for the full reload duration."
```

---

### Task 5: SpawnDirector unlock boundary matches its documented second exactly

**Files:**
- Modify: `src/game/systems/SpawnDirector.ts:63-67` (`#unlockedKinds`)
- Modify: `src/game/systems/SpawnDirector.test.ts`

**Interfaces:**
- No signature change.

- [ ] **Step 1: Write the failing test**

Add to `src/game/systems/SpawnDirector.test.ts`, inside `describe('SpawnDirector', ...)`:

```ts
  it('unlocks the Bio-Detonator at exactly 45.0 elapsed seconds, not one tick later', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    // 45 whole-second updates lands elapsedSec at exactly 45.0.
    for (let t = 0; t < 45; t += 1) director.update(1, 100);
    // No extra update here (unlike the pre-existing "unlocks at 45 seconds"
    // test, which advances to 46s) -- this checks the exact boundary.
    const spawned = director.update(0, 0);
    expect(spawned).toContain('detonator');
  });
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts -t "exactly 45.0"`
Expected: FAIL — at `elapsedSec === 45` exactly, `45 > 45` is `false`, so detonator isn't unlocked yet.

- [ ] **Step 3: Change the boundary to `>=`**

In `src/game/systems/SpawnDirector.ts`:

```ts
  #unlockedKinds(): MutantKind[] {
    return UNLOCK_ORDER.filter(
      (kind) => this.#elapsedSec >= DIRECTOR.unlockAtSec[kind],
    );
  }
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts`
Expected: PASS, including the pre-existing "does not unlock the Bio-Detonator before 45 seconds" test (which stops its loop at `t < 44`, i.e. `elapsedSec` reaches 44 before the final check-update — still strictly less than 45, unaffected by `>` vs `>=`).

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/SpawnDirector.ts src/game/systems/SpawnDirector.test.ts
git commit -m "fix(spawn): unlock enemies at their documented second exactly

unlockAtSec used a strict > comparison, so an enemy documented as
'unlocks at 45s' only unlocked the tick after."
```

---

### Task 6: `AmmoReadout` uses the real reload flag and the weapon-switch event

**Files:**
- Modify: `src/hud/AmmoReadout.tsx`

**Interfaces:**
- Consumes: `AMMO_UPDATED: { weaponId: string; clip: number; clipMax: number; reserve: number }` (unchanged — no bus type change needed; see note below) plus a new locally-tracked `reloading` value read off the *existing* emitted object shape.
- Consumes: `WEAPON_SWITCHED: { weaponId: string; unlocked: string[] }` (already emitted by `ArenaScene`, currently unconsumed).

Note: `ArenaScene.ts`'s two `bus.emit('AMMO_UPDATED', ...)` calls (`:340-345`, `:727-732`) only spread `{weaponId, clip, clipMax, reserve}` — they compute `reloading` locally for their own `#lastEmittedAmmo` dedup check but never put it in the emitted payload. Fix this at the emit site too, since the type already claims a shape without it and the component needs it.

- [ ] **Step 1: Add `reloading` to the `AMMO_UPDATED` event type**

In `src/game/eventBus.ts`:

```ts
  AMMO_UPDATED: {
    weaponId: string;
    clip: number;
    clipMax: number;
    reserve: number;
    reloading: boolean;
  };
```

- [ ] **Step 2: Include `reloading` in both emit sites**

In `src/game/scenes/ArenaScene.ts`, the `create()` emit (around line 340):

```ts
    bus.emit('AMMO_UPDATED', {
      weaponId: activeId,
      clip,
      clipMax,
      reserve,
      reloading,
    });
```

And the `update()` emit (around line 727):

```ts
      bus.emit('AMMO_UPDATED', {
        weaponId: activeId,
        clip,
        clipMax,
        reserve: displayReserve,
        reloading,
      });
```

(Both sites already compute a local `reloading` const right above the emit — only the emitted object literal changes.)

- [ ] **Step 3: Update `AmmoReadout.tsx` to use the real field and listen for `WEAPON_SWITCHED`**

Replace `src/hud/AmmoReadout.tsx`:

```tsx
/** Weapon, magazine, reserve, and reload indicator. SRS 6.1, bottom-right. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Ammo = {
  weaponId: string;
  clip: number;
  clipMax: number;
  reserve: number;
  reloading: boolean;
};

export function AmmoReadout() {
  const [ammo, setAmmo] = useState<Ammo>({
    weaponId: 'carbine',
    clip: 24,
    clipMax: 24,
    reserve: 0,
    reloading: false,
  });

  useEffect(() => {
    const onUpdate = (e: Ammo) => setAmmo(e);
    const onSwitch = (e: { weaponId: string; unlocked: string[] }) =>
      setAmmo((prev) => ({ ...prev, weaponId: e.weaponId }));
    bus.on('AMMO_UPDATED', onUpdate);
    bus.on('WEAPON_SWITCHED', onSwitch);
    return () => {
      bus.off('AMMO_UPDATED', onUpdate);
      bus.off('WEAPON_SWITCHED', onSwitch);
    };
  }, []);

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {ammo.reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no type errors. (`WeaponInventory.getAmmo`/`activeAmmo` already return `{clip, reserve, reloading}` — no change needed there.)

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Empty the carbine's clip to trigger auto-reload — confirm "Reloading" shows for the real ~1.1s duration and disappears exactly when the clip refills (previously it could show/hide based on the `clip===0 && reserve>0` heuristic, which is now gone). Press `1`/`2`/`3` to switch weapons (after unlocking Scatter/Rail via a draft) and confirm the weapon name at the top updates immediately.

- [ ] **Step 6: Commit**

```bash
git add src/game/eventBus.ts src/game/scenes/ArenaScene.ts src/hud/AmmoReadout.tsx
git commit -m "fix(hud): ammo readout uses the real reload flag and weapon-switch event

AMMO_UPDATED already carried a real reloading boolean internally but
never put it on the wire, so AmmoReadout re-derived a clip===0 heuristic
instead. WEAPON_SWITCHED was emitted but had zero listeners."
```

---

### Task 7: Dash cooldown indicator

**Files:**
- Create: `src/hud/DashIndicator.tsx`
- Modify: `src/hud/Hud.tsx`
- Modify: `src/index.css` (one keyframe)

**Interfaces:**
- Consumes: `DASH_STATUS: { cooldownRemainingMs: number; ready: boolean }` (already emitted from `src/game/entities/Player.ts:89-95`, currently unconsumed).

- [ ] **Step 1: Add the cooldown-fill keyframe**

Append to `src/index.css`:

```css
@keyframes dash-cooldown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}
```

- [ ] **Step 2: Create `DashIndicator.tsx`**

```tsx
/** Dash cooldown indicator. Delta spec 7.2, bottom-left beside Aegis. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type DashPayload = { cooldownRemainingMs: number; ready: boolean };

export function DashIndicator() {
  const [ready, setReady] = useState(true);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const onStatus = (e: DashPayload) => {
      setReady(e.ready);
      if (!e.ready) {
        setCooldownMs(e.cooldownRemainingMs);
        setPulseKey((k) => k + 1);
      }
    };
    bus.on('DASH_STATUS', onStatus);
    return () => bus.off('DASH_STATUS', onStatus);
  }, []);

  return (
    <div
      className={`relative overflow-hidden border px-3 py-1.5 text-xs tracking-widest uppercase transition-colors ${
        ready
          ? 'border-growth/40 bg-growth/10 text-growth'
          : 'border-sand-800 bg-sand-950/60 text-white/40'
      }`}
    >
      {!ready && (
        <div
          key={pulseKey}
          className="absolute inset-0 origin-left bg-white/10"
          style={{ animation: `dash-cooldown ${cooldownMs}ms linear forwards` }}
        />
      )}
      <span className="relative">
        {ready ? '[SHIFT] DASH READY' : '[SHIFT] DASH'}
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Mount it beside `AegisBadge`**

In `src/hud/Hud.tsx`, add the import and wrap the bottom-left group:

```tsx
import { AegisBadge } from './AegisBadge';
import { AmmoReadout } from './AmmoReadout';
import { CarriedCatalystPips } from './CarriedCatalystPips';
import { DashIndicator } from './DashIndicator';
import { DecayVignette } from './DecayVignette';
```

```tsx
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <AegisBadge />
        <DashIndicator />
      </div>
```

(replacing the previous single-child `<div className="absolute bottom-4 left-4"><AegisBadge /></div>`.)

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Press Shift to dash — confirm the indicator switches to a dimmed "DASH" state with a shrinking white fill bar taking ~1.6s (`DASH.cooldownMs`) to empty, then flips back to the bright "DASH READY" state.

- [ ] **Step 6: Commit**

```bash
git add src/hud/DashIndicator.tsx src/hud/Hud.tsx src/index.css
git commit -m "feat(hud): add dash cooldown indicator

DASH_STATUS was emitted from Player.ts with no consumer; the delta spec
calls for a visible cooldown indicator beside the Aegis badge."
```

---

### Task 8: Growth-stalled cue (visual pulse + sound)

**Files:**
- Modify: `src/hud/MaturityGauge.tsx`
- Modify: `src/game/audio/SoundEffects.ts`
- Modify: `src/game/scenes/ArenaScene.ts:744-746`

**Interfaces:**
- Consumes: `GROWTH_STALLED: { ceilingPct: number }` (already emitted at `ArenaScene.ts:744-746` on the upward ceiling crossing, currently unconsumed).
- Produces: `SoundEffects.growthStalled(): void`.

- [ ] **Step 1: Add `growthStalled()` to `SoundEffects`**

In `src/game/audio/SoundEffects.ts`, add a method near `decayWarn()`:

```ts
  /**
   * Growth Stalled: a single flat blip marking the ceiling crossing
   * (400Hz triangle, 0.12s) -- distinct from decayWarn's descending drone.
   */
  growthStalled(): void {
    const ctx = this.#init();
    if (!ctx || !this.#masterGain) return;

    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(400, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.25, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.#masterGain);

    osc.start(t);
    osc.stop(t + 0.12);
  }
```

- [ ] **Step 2: Call it from the existing `GROWTH_STALLED` emit site**

In `src/game/scenes/ArenaScene.ts`, change:

```ts
    if (result.stalledCrossing) {
      bus.emit('GROWTH_STALLED', { ceilingPct: GROWTH_CEILING });
    }
```

to:

```ts
    if (result.stalledCrossing) {
      this.#audio.growthStalled();
      bus.emit('GROWTH_STALLED', { ceilingPct: GROWTH_CEILING });
    }
```

- [ ] **Step 3: Add a one-shot pulse to `MaturityGauge` driven by the event**

The gauge's `stalled` boolean (`maturityPct >= ceilingPct`) must stay derived from the continuous tick data — it needs to turn back off once maturity resets after a Generation, and `GROWTH_STALLED` only fires once per crossing, not continuously. So `GROWTH_STALLED` adds a distinct one-shot pulse on top of the existing derived color, rather than replacing it.

Replace `src/hud/MaturityGauge.tsx`:

```tsx
/**
 * Maturity gauge with the growth-ceiling tick mark. Delta spec 7.1.
 *
 * Below the ceiling the fill is growth-coloured and the live rate shows.
 * At or above it the fill switches to the catalyst colour and the rate is
 * replaced by CATALYST REQUIRED -- the only tutorial the ceiling gets.
 * GROWTH_STALLED additionally fires a one-shot pulse at the exact moment
 * the ceiling is first crossed, since the derived colour swap alone is easy
 * to miss mid-combat.
 */
import { useEffect, useRef, useState } from 'react';
import { bus } from '../game/eventBus';

export function MaturityGauge() {
  const [maturityPct, setMaturityPct] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [ratePerSec, setRatePerSec] = useState(0);
  const [ceilingPct, setCeilingPct] = useState(60);
  const [justStalled, setJustStalled] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout>>();

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
    const onStalled = () => {
      setJustStalled(true);
      clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setJustStalled(false), 400);
    };
    bus.on('TREE_GROWTH_TICK', onTick);
    bus.on('GROWTH_STALLED', onStalled);
    return () => {
      bus.off('TREE_GROWTH_TICK', onTick);
      bus.off('GROWTH_STALLED', onStalled);
      clearTimeout(pulseTimer.current);
    };
  }, []);

  const stalled = maturityPct >= ceilingPct;

  return (
    <div className="flex w-80 flex-col gap-1">
      <div className="flex justify-between text-xs tracking-widest uppercase">
        <span className="text-white/70">Maturity</span>
        <span className="text-growth">Gen {generation}</span>
      </div>

      <div
        className={`relative h-3 w-full overflow-hidden rounded-sm bg-black/60 ${
          justStalled ? 'animate-pulse' : ''
        }`}
      >
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
          <span className="text-white/50">+{ratePerSec.toFixed(2)} %/s</span>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Stay tethered without delivering any catalysts until maturity reaches 60%. Confirm: a short blip sound plays exactly once at the crossing, and the gauge bar pulses briefly at that same moment (`animate-pulse` for ~400ms), in addition to the existing amber "CATALYST REQUIRED" state that persists afterward.

- [ ] **Step 6: Commit**

```bash
git add src/hud/MaturityGauge.tsx src/game/audio/SoundEffects.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(tree): growth-stalled sound and gauge pulse

GROWTH_STALLED fired into the void with no listener and no sound."
```

---

### Task 9: Ground tiling

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts` (`preload`, `create`)

**Interfaces:** none new.

- [ ] **Step 1: Load `ground.png`**

In `src/game/scenes/ArenaScene.ts`, add the import at the top alongside the existing spritesheet import:

```ts
import spritesheetUrl from '../../assets/spritesheet.png';
import groundUrl from '../../assets/ground.png';
```

Update `preload()`:

```ts
  preload(): void {
    this.load.spritesheet('sheet', spritesheetUrl, {
      frameWidth: 512,
      frameHeight: 512,
    });
    this.load.image('ground', groundUrl);
  }
```

- [ ] **Step 2: Tile it in `create()`, replacing the flat background color**

Replace:

```ts
    this.cameras.main.setBackgroundColor('#1a1410');
```

with:

```ts
    this.add.tileSprite(
      ARENA.width / 2,
      ARENA.height / 2,
      ARENA.width,
      ARENA.height,
      'ground',
    );
```

(`ARENA` is already imported at the top of the file.) This is a one-time static tile sprite — the arena has no camera panning per `CLAUDE.md`, so it never needs to scroll.

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: no type errors. If Vite/TS complains about importing a `.png` with no type declaration, check `src/vite-env.d.ts` — the existing `spritesheetUrl` import already proves `.png` imports are typed project-wide, so no new declaration should be needed.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`. Confirm the arena background is now the tiled desert-floor texture instead of a flat dark color, and every sprite (tree, aura rings, player, enemies, bullets, canisters) still renders on top of it correctly.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "feat(scene): tile the ground texture instead of a flat background

ground.png shipped in src/assets since the art pass but was never
loaded or drawn; the arena background was a plain color fill."
```

---

### Task 10: Particle system — death splatter, muzzle flash, delivery spore burst, barren dust puff

**Files:**
- Create: `src/game/systems/ParticleFX.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Produces: `class ParticleFX { constructor(scene: Phaser.Scene); splatter(x, y): void; sporeBurst(x, y): void; dustPuff(x, y): void; muzzleFlash(x, y, rotation): void; }`
- Consumes: `FRAME.particle`, `FRAME.muzzleFlash` from `src/game/frames.ts` (both currently unused anywhere in the codebase).

- [ ] **Step 1: Create `ParticleFX.ts`**

```ts
/**
 * One-shot particle bursts for death, delivery, barren-zone voids, and
 * muzzle flashes. SRS 6.2. Every effect reuses existing spritesheet frames
 * (FRAME.particle, FRAME.muzzleFlash) tinted per call site -- no new art,
 * no shaders, per CLAUDE.md.
 *
 * One emitter per effect type, created once and fired with `.explode()`,
 * so nothing allocates per burst.
 */
import Phaser from 'phaser';
import { FRAME } from '../frames';

export class ParticleFX {
  readonly #splatter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #spore: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #dust: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #muzzle: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.#splatter = scene.add.particles(0, 0, 'sheet', {
      frame: FRAME.particle,
      lifespan: 300,
      speed: { min: 60, max: 160 },
      scale: { start: 0.5, end: 0 },
      quantity: 10,
      tint: 0xdc2626,
      emitting: false,
    });

    this.#spore = scene.add.particles(0, 0, 'sheet', {
      frame: FRAME.particle,
      lifespan: 500,
      speed: { min: 40, max: 120 },
      scale: { start: 0.6, end: 0 },
      quantity: 12,
      tint: 0x3ddc84,
      emitting: false,
    });

    this.#dust = scene.add.particles(0, 0, 'sheet', {
      frame: FRAME.particle,
      lifespan: 400,
      speed: { min: 20, max: 60 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.5, end: 0 },
      quantity: 6,
      tint: 0x6b7280,
      emitting: false,
    });

    this.#muzzle = scene.add.particles(0, 0, 'sheet', {
      frame: FRAME.muzzleFlash,
      lifespan: 80,
      speed: 0,
      scale: { start: 0.6, end: 0 },
      quantity: 1,
      tint: 0xffffff,
      blendMode: Phaser.BlendModes.ADD,
      emitting: false,
    });
  }

  /** Red death splatter. Called on every enemy kill. */
  splatter(x: number, y: number): void {
    this.#splatter.explode(10, x, y);
  }

  /** Green spore burst. Called on every catalyst delivery. */
  sporeBurst(x: number, y: number): void {
    this.#spore.explode(12, x, y);
  }

  /** Grey dust puff, no chime -- a kill inside the barren zone that drops nothing. */
  dustPuff(x: number, y: number): void {
    this.#dust.explode(6, x, y);
  }

  /** White muzzle flash at the gun tip, offset from the player along their aim. */
  muzzleFlash(x: number, y: number, rotation: number): void {
    const offset = 24;
    this.#muzzle.explode(
      1,
      x + Math.cos(rotation) * offset,
      y + Math.sin(rotation) * offset,
    );
  }
}
```

- [ ] **Step 2: Type-check the new file in isolation**

Run: `npm run build`
Expected: no type errors. If `Phaser.GameObjects.Particles.ParticleEmitter` or the `scene.add.particles(...)` signature doesn't match installed Phaser's types exactly, check `node_modules/phaser/types/phaser.d.ts` for the exact return type of `GameObjectFactory.particles` in the installed version and adjust the field type accordingly — do not use `any`.

- [ ] **Step 3: Construct it in `ArenaScene` and wire every call site**

Add the field and import:

```ts
import { ParticleFX } from '../systems/ParticleFX';
```

```ts
  #particles!: ParticleFX;
```

In `create()`, after `this.#canisters = new CanisterPool(this, 30);`:

```ts
    this.#particles = new ParticleFX(this);
```

Splatter on every enemy kill — three call sites:

1. Bullet-overlap kill (`ArenaScene.ts`, inside the `physics.add.overlap(bullets, enemies, ...)` callback):

```ts
        if (remaining <= 0) {
          const killX = enemy.x;
          const killY = enemy.y;
          EnemyPool.kill(enemy);
          this.#kills += 1;
          this.#handleKillDrop(killX, killY);
          this.#particles.splatter(killX, killY);
          this.#audio.alienSplat();
          return;
        }
```

2. Aegis retaliation kill (inside `update()`'s aegis-contact loop):

```ts
        if (remaining <= 0) {
          const killX = child.x;
          const killY = child.y;
          EnemyPool.kill(child);
          this.#kills += 1;
          this.#handleKillDrop(killX, killY);
          this.#particles.splatter(killX, killY);
          this.#audio.alienSplat();
          continue;
        }
```

3. `#explodeDetonator` (both the detonator's own death and its chain kills, from Task 2's version of this method):

```ts
  #explodeDetonator(detonator: Phaser.Physics.Arcade.Image): void {
    const damage = EnemyPool.melee(detonator);
    const cx = detonator.x;
    const cy = detonator.y;

    this.#handleKillDrop(cx, cy);
    EnemyPool.kill(detonator);
    this.#kills += 1;
    this.#particles.splatter(cx, cy);
    this.#audio.alienSplat();

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
          this.#handleKillDrop(child.x, child.y);
          EnemyPool.kill(child);
          this.#kills += 1;
          this.#particles.splatter(child.x, child.y);
          this.#audio.alienSplat();
        } else {
          EnemyPool.setHp(child, remaining);
        }
      }
    }
  }
```

Dust puff on a voided barren-zone kill — `#handleKillDrop`:

```ts
  #handleKillDrop(killX: number, killY: number): void {
    const barrenRadius = this.#auraRadius + BARREN_MARGIN;
    const homeDist = Phaser.Math.Distance.Between(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
    );
    if (homeDist < barrenRadius) {
      this.#particles.dustPuff(killX, killY);
      return;
    }

    const tier = this.#pity.rollOnKill();
    if (!tier) return;

    this.#canisters.eject(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
      tier,
      this.#auraRadius,
    );
  }
```

Spore burst on delivery — two call sites, both at `TREE_POS`:

1. Tethered instant-cash delivery — replace the `if (state === 'tethered')` branch inside `#handleCanisterPickups`:

```ts
      if (state === 'tethered') {
        const result = this.#tree.deliver(
          CATALYST_VALUE[tier] * this.#upgrades.catalystValueMult,
        );
        if (result.generationTriggered) {
          this.#triggerGeneration(result.generation);
        }
        CanisterPool.kill(child);
        this.#particles.sporeBurst(TREE_POS.x, TREE_POS.y);
        this.#audio.deliver();
        this.#catalystsDeliveredCount += 1;
        bus.emit('CATALYSTS_DELIVERED', {
          totalPct: result.maturityPct,
          count: 1,
        });
        if (this.#pausedForDraft) break;
        continue;
      }
```

2. Carry-stack delivery on returning tethered — replace the `if (state === 'tethered' && this.#carry.count > 0)` block inside `update()`:

```ts
    if (state === 'tethered' && this.#carry.count > 0) {
      const { totalPct, count } = this.#carry.deliverAll();
      const result = this.#tree.deliver(
        totalPct * this.#upgrades.catalystValueMult,
      );
      if (result.generationTriggered) {
        this.#triggerGeneration(result.generation);
      }
      this.#catalystsDeliveredCount += count;
      this.#particles.sporeBurst(TREE_POS.x, TREE_POS.y);
      this.#audio.deliver();
      this.#player.setSpeedMultiplier(this.#upgrades.moveSpeedMult);
      bus.emit('CATALYSTS_CARRIED', {
        tiers: [],
        cap: this.#upgrades.carryCapacity,
      });
      bus.emit('CATALYSTS_DELIVERED', {
        totalPct: result.maturityPct,
        count,
      });
    }
```

Muzzle flash on every shot fired — in `update()`, inside the fire-input block, right after `this.#nextShotAtMs = ...`:

```ts
      const activeId = this.#weapons.activeWeaponId;
      this.#nextShotAtMs = this.time.now + 1000 / WEAPON_FIRE_RATES[activeId];
      this.#particles.muzzleFlash(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
      if (activeId === 'carbine') {
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`. Confirm: red splatter on every enemy death (bullet, Aegis, and detonator-chain kills), white muzzle flash at the gun tip on every shot, green spore burst at the tree on every catalyst delivery (both instant-cash while tethered and carried-then-delivered), and a grey silent dust puff (no chime) when you kill something inside the barren ring instead of the previous silent nothing.

- [ ] **Step 6: Commit**

```bash
git add src/game/systems/ParticleFX.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(fx): add particle system for death, delivery, muzzle, and barren-void feedback

FRAME.particle and FRAME.muzzleFlash were defined in frames.ts and never
drawn by anything. SRS 6.2 calls for splatter, delivery bursts, muzzle
flashes, and the barren-zone kill was silently giving no feedback at all
about why no canister dropped."
```

---

### Task 11: Generation bloom sequence

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts` (`#triggerGeneration`, new `#playGenerationRing`)

**Interfaces:** none new — `#triggerGeneration(generation: number)` keeps its signature; `GENERATION_REACHED` still ends up emitted with the same payload, just after a 500ms delay in the immediate-draft path.

- [ ] **Step 1: Add the flash + ring, and delay the draft modal by 500ms**

Replace `#triggerGeneration` and add `#playGenerationRing`:

```ts
  #triggerGeneration(generation: number): void {
    this.#audio.generation();
    this.#aegis.grantCharge(this.#upgrades.aegisCapacity);
    this.cameras.main.flash(300, 220, 255, 200);
    this.#playGenerationRing();

    if (this.#pausedForDraft) {
      this.#pendingDraftGenerations.push(generation);
    } else {
      this.#pausedForDraft = true;
      this.physics.pause();
      this.time.delayedCall(500, () => {
        const cards = this.#upgrades.draw(generation);
        bus.emit('GENERATION_REACHED', { generation, cards });
      });
    }
  }

  #playGenerationRing(): void {
    const ring = this.add.graphics();
    ring.setPosition(TREE_POS.x, TREE_POS.y);
    ring.lineStyle(4, 0x3ddc84, 1);
    ring.strokeCircle(0, 0, 20);
    ring.setDepth(50);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 7,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }
```

Note: `this.physics.pause()` still happens immediately (so the player can't act during the flash/hold), only the draft-modal-triggering `GENERATION_REACHED` emit is delayed by 500ms to match "a 0.5s hold before the draft modal fades in."

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`. Deliver catalysts until a Generation triggers. Confirm: a bright white-green screen flash plays immediately, a green ring expands outward from the tree and fades over 0.5s, physics is already paused during this, and the draft modal appears only after that half-second hold — not instantly.

- [ ] **Step 4: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "feat(fx): add Generation bloom flash, expanding ring, and modal hold

triggerGeneration jumped straight from sound to the draft modal with no
visual bloom; SRS 6.2 calls for a full-screen flash, an expanding spore
ring, and a 0.5s hold before the modal appears."
```

---

### Task 12: Procedural music bed

**Files:**
- Modify: `src/game/audio/SoundEffects.ts`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Produces: `SoundEffects.startMusic(): void`, `SoundEffects.setMusicIntensity(active: boolean): void`, `SoundEffects.stopMusic(): void`.

- [ ] **Step 1: Add the music methods to `SoundEffects`**

Add fields and methods to `src/game/audio/SoundEffects.ts`:

```ts
  #musicOsc1: OscillatorNode | null = null;
  #musicOsc2: OscillatorNode | null = null;
  #musicFilter: BiquadFilterNode | null = null;
```

```ts
  /**
   * Looping dark drone: two slightly detuned low sawtooths through a
   * lowpass filter. SRS 7. Filter cutoff is automated by
   * setMusicIntensity rather than swapping tracks.
   */
  startMusic(): void {
    const ctx = this.#init();
    const masterGain = this.#masterGain;
    if (!ctx || !masterGain || this.#musicOsc1) return;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(55, ctx.currentTime);
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(55.5, ctx.currentTime);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, ctx.currentTime);

    gain.gain.setValueAtTime(0.08, ctx.currentTime);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start();
    osc2.start();

    this.#musicOsc1 = osc1;
    this.#musicOsc2 = osc2;
    this.#musicFilter = filter;
  }

  /** Brightens the drone during combat, darkens it during pause/draft. */
  setMusicIntensity(active: boolean): void {
    const ctx = this.#ctx;
    const filter = this.#musicFilter;
    if (!ctx || !filter) return;
    filter.frequency.linearRampToValueAtTime(
      active ? 1600 : 400,
      ctx.currentTime + 0.8,
    );
  }

  stopMusic(): void {
    this.#musicOsc1?.stop();
    this.#musicOsc2?.stop();
    this.#musicOsc1 = null;
    this.#musicOsc2 = null;
    this.#musicFilter = null;
  }
```

- [ ] **Step 2: Type-check the audio module in isolation**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 3: Start/stop music with the scene lifecycle, and darken it during pause/draft**

In `src/game/scenes/ArenaScene.ts`'s `create()`, right after the existing `this.physics.resume();` line near the top:

```ts
    this.physics.resume();
    this.#audio.stopMusic();
    this.#audio.startMusic();
```

(Calling `stopMusic()` immediately before `startMusic()` makes this idempotent across `scene.restart()`, since `#audio` is a persistent class field that survives restarts while `create()` re-runs.)

In `#triggerGeneration` (already rewritten by Task 11 to include the flash/ring — this replaces that same method again, adding one line), darken the music the moment the draft modal is about to show:

```ts
  #triggerGeneration(generation: number): void {
    this.#audio.generation();
    this.#aegis.grantCharge(this.#upgrades.aegisCapacity);
    this.cameras.main.flash(300, 220, 255, 200);
    this.#playGenerationRing();

    if (this.#pausedForDraft) {
      this.#pendingDraftGenerations.push(generation);
    } else {
      this.#pausedForDraft = true;
      this.physics.pause();
      this.#audio.setMusicIntensity(false);
      this.time.delayedCall(500, () => {
        const cards = this.#upgrades.draw(generation);
        bus.emit('GENERATION_REACHED', { generation, cards });
      });
    }
  }
```

In `onResumeFromDraft`, brighten it back when leaving the draft loop for good:

```ts
    const onResumeFromDraft = () => {
      if (this.#over) return;
      if (this.#pendingDraftGenerations.length > 0) {
        const nextGen = this.#pendingDraftGenerations.shift()!;
        const cards = this.#upgrades.draw(nextGen);
        bus.emit('GENERATION_REACHED', { generation: nextGen, cards });
      } else {
        this.physics.resume();
        this.#pausedForDraft = false;
        this.#audio.setMusicIntensity(true);
      }
    };
```

In `onTogglePause`:

```ts
    const onTogglePause = () => {
      if (this.#over || this.#pausedForDraft) return;
      this.#isPaused = !this.#isPaused;
      if (this.#isPaused) {
        this.physics.pause();
        this.#audio.setMusicIntensity(false);
      } else {
        this.physics.resume();
        this.#audio.setMusicIntensity(true);
      }
    };
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, click/press a key once to satisfy the browser's audio-autoplay gesture requirement (the existing `pointerdown`/`keydown` → `this.#audio.resume()` handlers already do this). Confirm a continuous low drone plays during combat, audibly darkens (lower cutoff, muffled) when you pause (Esc/P) or a draft modal opens, and brightens again on resume. Restart the run (game-over → restart) and confirm the drone doesn't double up or distort from overlapping oscillators.

- [ ] **Step 6: Commit**

```bash
git add src/game/audio/SoundEffects.ts src/game/scenes/ArenaScene.ts
git commit -m "feat(audio): add procedural looping music bed with pause/draft filtering

SRS 7 calls for a looping dark drone that darkens during pause/drafts;
SoundEffects previously only had one-shot SFX."
```

---

### Task 13: Documentation cleanup

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none.

- [ ] **Step 1: Replace the stale project-state paragraph and add the delta-spec pointer**

In `CLAUDE.md`, replace:

```markdown
"For a Tree" — a top-down sci-fi survival action game for desktop browsers. Hackathon scope:
solo developer, 36 hours, art already complete.

**The repository is pre-implementation.** The specification is finished and the shell builds;
the Phaser engine is not yet mounted. `src/App.tsx` renders a placeholder over an empty
`#phaser-root`.

## The SRS is the source of truth

`docs/For_a_Tree_SRS.md` (v2.0) is authoritative for every number, formula, entity stat, event
name, and scope decision. Read the relevant section before implementing a system, and do not
invent balance values — if a value is missing, it is a spec gap worth raising, not a judgement
call to make silently.
```

with:

```markdown
"For a Tree" — a top-down sci-fi survival action game for desktop browsers. Hackathon scope:
solo developer, 36 hours, art already complete.

**The core loop is implemented and playable.** Player, tree/maturity, tether/grace, weapons,
mutants, spawn director, draft upgrades, HUD, pause/restart, and procedural audio are mounted
and wired through the event bus. Ongoing work is a polish pass — see
`docs/superpowers/specs/2026-09-13-polish-pass-design.md` for the current punch list.

## The SRS and the loop-correction delta are the source of truth

`docs/For_a_Tree_SRS.md` (v2.0) is authoritative for every number, formula, entity stat, event
name, and scope decision. Read the relevant section before implementing a system, and do not
invent balance values — if a value is missing, it is a spec gap worth raising, not a judgement
call to make silently.

`docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md` is a delta against the
SRS and **wins where the two disagree** — it governs the growth ceiling, dash, barren zone, and
grace-as-meter mechanics, none of which read correctly from the SRS alone.
```

- [ ] **Step 2: Lint the markdown**

Run: `npx markdownlint-cli2 "**/*.md"`
Expected: no new errors introduced by this edit.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: correct stale pre-implementation framing, link the delta spec

CLAUDE.md said Phaser wasn't mounted yet and never mentioned the
loop-correction delta doc that actually governs several core mechanics."
```

---

## Self-Review Notes

- **Spec coverage:** every numbered section of `docs/superpowers/specs/2026-09-13-polish-pass-design.md` (§1-§9, §11) maps to a task above. §10 (test coverage gap) is intentionally not a task — the spec marks it out of scope for this pass and it's already covered by manual-verification steps on Tasks 2-3, the two bugs that motivated it.
- **Type consistency:** `ParticleFX`'s four method names (`splatter`, `sporeBurst`, `dustPuff`, `muzzleFlash`) are used identically in Task 10's `ArenaScene.ts` call sites. `AMMO_UPDATED`'s `reloading` field (Task 6) and `SoundEffects.growthStalled()`/`startMusic()`/`setMusicIntensity()`/`stopMusic()` (Tasks 8, 12) are each defined in the task that introduces them and used only in that same task or later ones, never earlier.
- **Ordering:** Task 2 and Task 10 both touch `#explodeDetonator` — Task 10's version of the method is written as a full replacement that already includes Task 2's `#kills += 1` lines, so applying the tasks in order (2 before 10) produces no conflict.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-13-polish-pass.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
