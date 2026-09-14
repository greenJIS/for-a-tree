# Entity Scale & Loot Drop Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump player/enemy/canister/tree display sizes 2.5x, give canister loot drops a one-shot
landing bounce, replace their alpha-flicker vanish warning with a red-tint flicker, and extend
canister lifetime from 15s to 20s.

**Architecture:** All balance numbers move into `src/game/config.ts` (fixing two pre-existing
violations of its "no balance literal elsewhere" contract along the way). Visual behavior changes
are additive Phaser tweens inside `CanisterPool.ts` — no new pooled objects, no new art, no
per-frame allocation in `update()`.

**Tech Stack:** Phaser 4 (Arcade Physics, tweens), TypeScript strict, Vitest for pure-logic unit
tests (this codebase does not unit-test Phaser Scene/GameObject-coupled classes — see
`src/game/smoke.test.ts` and the existing `*.test.ts` files, which only cover pure systems modules
like `CanisterPhysics.ts`, `TreeSystem.ts`, etc. `Player.ts`, `EnemyPool.ts`, `CanisterPool.ts`,
and `ArenaScene.ts` have no existing unit tests and this plan does not add any — they're gated by
`npm run build` (the real type check) and manual `npm run dev` verification instead, per the
codebase's own convention).

## Global Constraints

- No balance literal outside `src/game/config.ts` (header contract, `src/game/config.ts:8`).
- No `any`; `strict: true`; avoid `as` (project CLAUDE.md).
- No new art, no custom shaders — effects are tints/scales/tweens on existing spritesheet frames
  (project CLAUDE.md, SRS 6.3).
- Pooling is a requirement: zero allocation inside `update()` (project CLAUDE.md).
- `npm run lint` does not type-check; use `npm run build` for that (project CLAUDE.md).
- Commit format: `type(scope): summary` + body explaining why when non-obvious. Types: feat, fix,
  chore, refactor, docs, test, ci, build, perf, style, revert (project CLAUDE.md).

---

## File Structure

- **Modify `src/game/config.ts`** — add `displaySize` to `PLAYER` and `SWARMER`; bump
  `BRUTE.displaySize`, `DETONATOR.displaySize`, `CANISTER.displaySize`; bump
  `CANISTER.lifetimeMs`/`despawnWarnMs`; add new `TREE` export with `phaseSizes`.
- **Create `src/game/config.test.ts`** — pure-value assertions for the new/changed constants.
- **Modify `src/game/entities/Player.ts`** — read `PLAYER.displaySize` instead of the hardcoded
  `40` (both the main sprite and the dash-ghost trail).
- **Modify `src/game/entities/EnemyPool.ts`** — read `SWARMER.displaySize` instead of the
  hardcoded `36` in the `STATS` map.
- **Modify `src/game/scenes/ArenaScene.ts`** — read `TREE.phaseSizes` instead of the hardcoded
  `64` (tree creation) and the inline `[0, 64, 96, 128, 160]` array (tree `update()`).
- **Modify `src/game/entities/CanisterPool.ts`** — swap the despawn alpha-flicker for a red-tint
  flicker that restores the tier tint (not `clearTint()`) on the "off" phase; add a one-shot
  pop+squash scale tween on `eject()` for the landing bounce.

No files are created besides the new test file. No existing file is split — none of the touched
files are large enough to warrant it.

---

## Task 1: Config constants

**Files:**
- Modify: `src/game/config.ts:48-55` (`PLAYER`), `:84-91` (`SWARMER`), `:96-104` (`BRUTE`),
  `:106-116` (`DETONATOR`), `:191-205` (`CANISTER`); add new `TREE` export after `TREE_POS`
  (`:15`)
- Test: `src/game/config.test.ts` (new)

**Interfaces:**
- Produces: `PLAYER.displaySize: 100`, `SWARMER.displaySize: 90`, `BRUTE.displaySize: 120`,
  `DETONATOR.displaySize: 100`, `CANISTER.displaySize: 60`, `CANISTER.lifetimeMs: 20000`,
  `CANISTER.despawnWarnMs: 5000`, `TREE.phaseSizes: readonly [0, 160, 240, 320, 400]` — every
  later task in this plan reads these exact names.

- [ ] **Step 1: Write the failing test**

Create `src/game/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { BRUTE, CANISTER, DETONATOR, PLAYER, SWARMER, TREE } from './config';

describe('config: entity scale & loot polish', () => {
  it('sizes player, enemies, and canisters at the 2.5x bump', () => {
    expect(PLAYER.displaySize).toBe(100);
    expect(SWARMER.displaySize).toBe(90);
    expect(BRUTE.displaySize).toBe(120);
    expect(DETONATOR.displaySize).toBe(100);
    expect(CANISTER.displaySize).toBe(60);
  });

  it('extends canister lifetime to 20s with a 5s red-flash warning', () => {
    expect(CANISTER.lifetimeMs).toBe(20000);
    expect(CANISTER.despawnWarnMs).toBe(5000);
  });

  it('sizes the tree at 2.5x per growth phase', () => {
    expect(TREE.phaseSizes).toEqual([0, 160, 240, 320, 400]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- config.test.ts`
Expected: FAIL — `SWARMER.displaySize` is `undefined` (no such field yet), `TREE` is not exported.

- [ ] **Step 3: Edit `PLAYER`, `SWARMER`, `BRUTE`, `DETONATOR`, `CANISTER`, and add `TREE`**

In `src/game/config.ts`, replace:

```ts
/** Player entity. SRS 3.1. */
export const PLAYER = {
  maxHp: 100,
  moveSpeed: 220,
  invulnMs: 500,
  flickerHz: 12,
  radius: 20,
} as const;
```

with:

```ts
/** Player entity. SRS 3.1. */
export const PLAYER = {
  maxHp: 100,
  moveSpeed: 220,
  invulnMs: 500,
  flickerHz: 12,
  radius: 20,
  displaySize: 100,
} as const;
```

Replace:

```ts
/** E-01 Dune Swarmer. SRS 4.3. */
export const SWARMER = {
  speed: 55,
  hp: 25,
  melee: 6,
  threat: 1,
  radius: 18,
} as const;
```

with:

```ts
/** E-01 Dune Swarmer. SRS 4.3. */
export const SWARMER = {
  speed: 55,
  hp: 25,
  melee: 6,
  threat: 1,
  radius: 18,
  displaySize: 90,
} as const;
```

Replace:

```ts
  ballisticReduction: 0.25,
  displaySize: 48,
} as const;
```

with:

```ts
  ballisticReduction: 0.25,
  displaySize: 120,
} as const;
```

Replace:

```ts
  explosionRadiusPx: 70,
  displaySize: 40,
} as const;
```

with:

```ts
  explosionRadiusPx: 70,
  displaySize: 100,
} as const;
```

Replace:

```ts
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

with:

```ts
/** Canister ejection, magnet, and lifetime. SRS 3.6, clamped by delta spec 4's barren zone. */
export const CANISTER = {
  ejectSpeedMin: 450,
  ejectSpeedMax: 600,
  drag: 300,
  nearTreeThresholdPx: 40,
  nearTreeEjectSpeedMin: 150,
  nearTreeEjectSpeedMax: 250,
  lifetimeMs: 20000,
  despawnWarnMs: 5000,
  despawnFlashHz: 8,
  magnetRadius: 90,
  magnetPullSpeed: 500,
  displaySize: 60,
} as const;
```

Add a new export directly after `TREE_POS` (`src/game/config.ts:15`):

```ts
/** Tree anchor and player spawn. SRS 2.3. */
export const TREE_POS = { x: 640, y: 360 } as const;

/** Display size in px per growth phase (index = ArenaScene's tree.phase, 0-4). Phase 0 has no
 * tree yet; phases 1-4 are sprout through full sapling. Delta spec's growth-ceiling mechanic
 * (2026-09-13) doesn't change phase count. */
export const TREE = { phaseSizes: [0, 160, 240, 320, 400] } as const;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- config.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite to confirm no regression**

Run: `npm test`
Expected: PASS — every existing suite still passes (no other test file reads these constants'
old values).

- [ ] **Step 6: Commit**

```bash
git add src/game/config.ts src/game/config.test.ts
git commit -m "$(cat <<'EOF'
feat(config): bump entity/canister/tree sizes 2.5x, extend loot lifetime

Player, enemies, canisters, and the tree read too small on the
1280x720 arena. Canister lifetime moves 15s->20s with a 5s red-flash
warning window (was 4s) to match.
EOF
)"
```

---

## Task 2: Player display size

**Files:**
- Modify: `src/game/entities/Player.ts:29-30` (main sprite), `:108-115` (dash ghost)

**Interfaces:**
- Consumes: `PLAYER.displaySize` (Task 1, `= 100`), already imported at
  `src/game/entities/Player.ts:6` (`import { ARENA, DASH, PLAYER } from '../config';`).

- [ ] **Step 1: Replace the main sprite's hardcoded size**

In `src/game/entities/Player.ts`, replace:

```ts
    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
```

with:

```ts
    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(PLAYER.displaySize, PLAYER.displaySize);
```

- [ ] **Step 2: Replace the dash-ghost trail's hardcoded size**

Replace:

```ts
    ghost.setDisplaySize(40, 40);
```

with:

```ts
    ghost.setDisplaySize(PLAYER.displaySize, PLAYER.displaySize);
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src/game/entities/Player.ts
git commit -m "$(cat <<'EOF'
feat(player): read display size from config instead of a literal

Fixes a pre-existing violation of config.ts's "no balance literal
elsewhere" contract while wiring up the 2.5x size bump.
EOF
)"
```

---

## Task 3: Swarmer display size

**Files:**
- Modify: `src/game/entities/EnemyPool.ts:27-35`

**Interfaces:**
- Consumes: `SWARMER.displaySize` (Task 1, `= 90`), already imported at
  `src/game/entities/EnemyPool.ts:11` (`import { BRUTE, DETONATOR, DIRECTOR, SWARMER } from '../config';`).

- [ ] **Step 1: Replace the swarmer's hardcoded display size**

In `src/game/entities/EnemyPool.ts`, replace:

```ts
  swarmer: {
    frame: FRAME.swarmer,
    displaySize: 36,
    speed: SWARMER.speed,
    hp: SWARMER.hp,
    melee: SWARMER.melee,
    threat: SWARMER.threat,
    ballisticReduction: 0,
  },
```

with:

```ts
  swarmer: {
    frame: FRAME.swarmer,
    displaySize: SWARMER.displaySize,
    speed: SWARMER.speed,
    hp: SWARMER.hp,
    melee: SWARMER.melee,
    threat: SWARMER.threat,
    ballisticReduction: 0,
  },
```

(`brute` and `detonator` in the same `STATS` map already read `BRUTE.displaySize` /
`DETONATOR.displaySize` — Task 1 updated those constants' values, so no further edit is needed for
those two kinds.)

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/entities/EnemyPool.ts
git commit -m "$(cat <<'EOF'
feat(enemies): read swarmer display size from config instead of a literal

Fixes a pre-existing violation of config.ts's "no balance literal
elsewhere" contract while wiring up the 2.5x size bump. Brute and
detonator already read their displaySize from config.
EOF
)"
```

---

## Task 4: Tree display size

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:6-25` (import), `:302` (tree creation),
  `:844-845` (tree `update()`)

**Interfaces:**
- Consumes: `TREE.phaseSizes` (Task 1, `= [0, 160, 240, 320, 400]`).

- [ ] **Step 1: Import `TREE`**

In `src/game/scenes/ArenaScene.ts`, replace:

```ts
  TICK_INTERVAL_MS,
  TREE_POS,
  UPGRADE_EFFECTS,
} from '../config';
```

with:

```ts
  TICK_INTERVAL_MS,
  TREE,
  TREE_POS,
  UPGRADE_EFFECTS,
} from '../config';
```

- [ ] **Step 2: Fix the tree's initial size**

The tree starts life at phase 1 (sprout) — `TREE.phaseSizes[0]` is `0` (no tree), so the initial
call must index `[1]`, not `[0]`, or the tree will be invisible until the first `update()` tick.

Replace:

```ts
    this.#treeSprite.setDisplaySize(64, 64);
```

with:

```ts
    this.#treeSprite.setDisplaySize(TREE.phaseSizes[1], TREE.phaseSizes[1]);
```

- [ ] **Step 3: Fix the tree's per-phase size in `update()`**

Replace:

```ts
    const phaseSize = [0, 64, 96, 128, 160][this.#tree.phase];
    this.#treeSprite.setDisplaySize(phaseSize, phaseSize);
```

with:

```ts
    const phaseSize = TREE.phaseSizes[this.#tree.phase];
    this.#treeSprite.setDisplaySize(phaseSize, phaseSize);
```

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(tree): read display size from config instead of inline literals

The tree's size was set in two places (initial creation and the
per-phase update array) with hardcoded numbers. Both now read
TREE.phaseSizes so the 2.5x bump is a single source of truth.
EOF
)"
```

---

## Task 5: Vanish flicker — red tint instead of alpha

**Files:**
- Modify: `src/game/entities/CanisterPool.ts:92-95`

**Interfaces:**
- Consumes: `CANISTER.lifetimeMs`, `CANISTER.despawnWarnMs`, `CANISTER.despawnFlashHz` (Task 1),
  the existing module-level `TIER_TINT: Record<CatalystTier, number>` map
  (`src/game/entities/CanisterPool.ts:15-18`), and the existing `CanisterPool.tier()` static
  helper (`:119-122`).

- [ ] **Step 1: Replace the alpha-flicker with a tint-flicker**

In `src/game/entities/CanisterPool.ts`, replace:

```ts
      if (age >= CANISTER.lifetimeMs - CANISTER.despawnWarnMs) {
        const phase = Math.floor((age / 1000) * CANISTER.despawnFlashHz);
        child.setAlpha(phase % 2 === 0 ? 1 : 0.3);
      }
```

with:

```ts
      if (age >= CANISTER.lifetimeMs - CANISTER.despawnWarnMs) {
        const phase = Math.floor((age / 1000) * CANISTER.despawnFlashHz);
        child.setTint(
          phase % 2 === 0 ? 0xff0000 : TIER_TINT[CanisterPool.tier(child)],
        );
      }
```

This keeps the canister's tier color visible on the "off" phase instead of dropping it to white —
`clearTint()` would erase the tier identity, which `setTint(TIER_TINT[...])` restores exactly.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, play until a catalyst drop sits unpicked for 15+ seconds.
Expected: the canister flickers between red and its original tier color (not white, not a dimmed
version of the tier color) for the last 5 seconds, then disappears at 20 seconds total.

- [ ] **Step 4: Commit**

```bash
git add src/game/entities/CanisterPool.ts
git commit -m "$(cat <<'EOF'
feat(loot): flash red instead of dimming alpha before a drop vanishes

Alpha-flicker was easy to miss in a busy fight. Red tint flickers
against the canister's own tier color (not clearTint, which would
erase the tier identity) so the warning reads clearly without losing
which catalyst tier it is.
EOF
)"
```

---

## Task 6: Landing bounce animation

**Files:**
- Modify: `src/game/entities/CanisterPool.ts:40-73` (`eject()`)

**Interfaces:**
- Consumes: `CANISTER.displaySize` (Task 1), the existing `rest` object returned by
  `computeCanisterRest()` (`{ x: number; y: number; durationMs: number }`, unchanged by this
  plan).

- [ ] **Step 1: Guard against leftover tweens from a previous life of this pooled object**

Pickup only requires `settled === true` (`ArenaScene.ts:956`), which Step 2 below will set the
moment the pop tween finishes — *before* the trailing squash sub-tween (~120ms) is done. Under
heavy fire, a picked-up canister can be handed straight back out to a new `eject()` call while
that squash tween is still running on it, so the old tween keeps writing `scaleY` on top of the
new drop's tweens — the exact same class of conflict already avoided for `x`/`y`. `EnemyPool`
already guards its own pooled reuse this way (`this.#scene.tweens.killTweensOf(enemy)` at
`EnemyPool.ts:92`); `CanisterPool.eject()` has no equivalent yet.

In `src/game/entities/CanisterPool.ts`, replace:

```ts
    const canister: unknown = this.group.getFirstDead(false);
    if (!(canister instanceof Phaser.GameObjects.Image)) return;

    const rest = computeCanisterRest(killX, killY, treeX, treeY, auraRadius);
```

with:

```ts
    const canister: unknown = this.group.getFirstDead(false);
    if (!(canister instanceof Phaser.GameObjects.Image)) return;

    this.#scene.tweens.killTweensOf(canister);

    const rest = computeCanisterRest(killX, killY, treeX, treeY, auraRadius);
```

- [ ] **Step 2: Add the pop-in and squash tweens**

The existing move-to-rest tween already drives `x`/`y` on the canister — a second tween cannot
also drive those properties without both fighting over the same frame. The bounce is built
entirely from `scaleX`/`scaleY`, which the move tween never touches.

In `src/game/entities/CanisterPool.ts`, replace:

```ts
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
```

with:

```ts
    canister.setActive(true);
    canister.setVisible(true);
    canister.setPosition(killX, killY);
    canister.setDisplaySize(CANISTER.displaySize, CANISTER.displaySize);
    const baseScale = canister.scaleX;
    canister.setScale(baseScale * 1.3);
    canister.setAlpha(1);
    canister.setTint(TIER_TINT[tier]);
    canister.setData('tier', tier);
    canister.setData('spawnedAtMs', this.#scene.time.now);
    canister.setData('settled', false);

    const restDurationMs = Math.max(1, rest.durationMs);

    this.#scene.tweens.add({
      targets: canister,
      x: rest.x,
      y: rest.y,
      duration: restDurationMs,
      ease: 'Quad.easeOut',
      onComplete: () => canister.setData('settled', true),
    });

    this.#scene.tweens.add({
      targets: canister,
      scaleX: baseScale,
      scaleY: baseScale,
      duration: restDurationMs,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.#scene.tweens.add({
          targets: canister,
          scaleY: baseScale * 0.8,
          duration: 60,
          yoyo: true,
          ease: 'Quad.easeOut',
        });
      },
    });
  }
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, kill an enemy far enough from the tree to trigger a drop.
Expected: the canister visibly "pops" larger then settles to its normal size while flying to its
rest spot, then does a quick squash-and-rebound on landing. It does not jitter or fight with the
move-to-rest motion. It does not continue bobbing once settled. Rapidly killing several enemies
in a row (so canisters get picked up and reused quickly) should never produce a canister that
visibly glitches or snaps in scale right after appearing.

- [ ] **Step 5: Commit**

```bash
git add src/game/entities/CanisterPool.ts
git commit -m "$(cat <<'EOF'
feat(loot): add a one-shot landing bounce to canister drops

Canisters just appeared and slid to rest with no physical weight.
Built from a scale-only tween (pop + squash) so it can't fight the
existing x/y move-to-rest tween on the same object. Also guards pooled
reuse with killTweensOf, matching EnemyPool.spawn(), since a picked-up
canister can now be handed back out mid-squash.
EOF
)"
```

---

## Task 7: Full regression pass

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: PASS — all suites, including `config.test.ts` from Task 1.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run build`
Expected: succeeds with no errors, `dist/` produced.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual playtest**

Run: `npm run dev`, then in the browser:
- Confirm player, swarmer, brute, detonator, and canister all render visibly larger without
  clipping the HUD or looking absurd against the aura ring.
- Confirm the tree grows through all four visible phases without ever looking smaller than the
  previous phase, and doesn't visually swallow the whole aura ring at full growth (it will be
  close — 400px tree vs 440px aura diameter — that's expected per the design).
- Confirm melee/bullet hit detection still feels fair at the new, larger hitbox sizes — enemies
  land hits and take hits at correspondingly greater range; this is an intended consequence of
  the size bump, not a regression to fix.
- Confirm a canister bounces once on drop, sits still afterward, flickers red (keeping its tier
  color visible on the off-phase) for the last 5 seconds of its life, and disappears at 20 seconds
  total.

- [ ] **Step 5: No commit for this task** — it's a verification gate, not a code change. If any
  check fails, return to the relevant earlier task, fix, and re-commit there.
