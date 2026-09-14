# Loot Visibility & Easy Mode Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the no-loot-drop radius around the tree from 340px to
`auraRadius * 0.5` (110px base) so kills near the tree actually produce
visible catalyst drops, and make easy-mode spawn pressure meaningfully
lighter.

**Architecture:** Both changes are config/gate edits in the existing Phaser
scene and config module — no new systems, no new files. The drop-gate change
touches one radius calculation and its two dependent visual-sizing call
sites in `ArenaScene.ts`. The easy-mode change touches one config object in
`config.ts` and the pre-existing test assertions that hardcode its old
values.

**Tech Stack:** TypeScript, Phaser 4, Vitest.

## Global Constraints

- No `any` type anywhere (`strict: true`).
- No balance literal outside `src/game/config.ts` (existing project rule,
  stated in that file's header comment).
- `npm run build` (`tsc -b && vite build`) is the real type check; `npm run
  lint` does not type-check.
- Commit only when a task's steps say to commit — small, focused commits per
  task.

---

## Reference: current code being changed

`src/game/config.ts:17-21`:
```ts
/** Aura radius before draft cards. SRS 3.2. */
export const AURA_RADIUS_BASE = 220;

/** Barren zone extends this far past the aura. Delta spec 4. */
export const BARREN_MARGIN = 120;
```

`src/game/scenes/ArenaScene.ts:913-930` (`#handleKillDrop`):
```ts
  /**
   * Barren-zone eligibility, then pity, then ejection. Delta spec 4: a
   * kill inside barrenRadius produces no canister at all, and does NOT
   * advance the pity counter -- defending the tree must never silently
   * burn the player's accumulated drop odds.
   */
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
```

`src/game/scenes/ArenaScene.ts:274-285` (`#barrenSprite` creation):
```ts
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

`src/game/scenes/ArenaScene.ts:485-493` (`#barrenSprite` resize on Wider
Canopy upgrade):
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
      } else if (cardId === 'vacuum-coils') {
```

`src/game/config.ts:121-131` (`DIRECTOR_PRESETS.easy`):
```ts
  easy: {
    baseThreat: 1.8,
    threatPerSec: 0.1,
    maxSpawnsPerSecond: 2,
    unlockAtSec: {
      swarmer: 0,
      detonator: 75,
      brute: 150,
    },
  },
```

`src/game/systems/SpawnDirector.test.ts:102-124`:
```ts
  it('does not unlock the Bio-Detonator before 75 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 74; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).not.toContain('detonator');
  });

  it('unlocks the Bio-Detonator at 75 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 75; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).toContain('detonator');
  });

  it('reaches a lower threat target on Easy than on Hard at the same elapsed time', () => {
    // targetThreat(60) on Hard = 3 + 60/6 = 13; on Easy = 1.8 + 60*0.1 = 7.8.
    // Pin aliveThreat at 10 -- above Easy's target (Easy spawns nothing)
    // but below Hard's (Hard still needs to close a 3-point gap).
```

---

### Task 1: Add `DEADZONE_RADIUS_FRACTION` config constant

**Files:**
- Modify: `src/game/config.ts:17-21`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DEADZONE_RADIUS_FRACTION` (exported `number` constant, value
  `0.5`), consumed by Task 2 and Task 3.

- [ ] **Step 1: Add the constant**

In `src/game/config.ts`, right after `BARREN_MARGIN` (line 21), add:

```ts
/** Fraction of the live aura radius inside which a kill drops nothing at
 * all. Below this, defending the tree still gets zero loot; beyond it,
 * kills roll pity/tier and drop normally (see #handleKillDrop). */
export const DEADZONE_RADIUS_FRACTION = 0.5;
```

So the block reads:

```ts
/** Aura radius before draft cards. SRS 3.2. */
export const AURA_RADIUS_BASE = 220;

/** Barren zone extends this far past the aura. Delta spec 4. */
export const BARREN_MARGIN = 120;

/** Fraction of the live aura radius inside which a kill drops nothing at
 * all. Below this, defending the tree still gets zero loot; beyond it,
 * kills roll pity/tier and drop normally (see #handleKillDrop). */
export const DEADZONE_RADIUS_FRACTION = 0.5;
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors (unused-export is fine, `tsc` doesn't flag
unused exports).

- [ ] **Step 3: Commit**

```bash
git add src/game/config.ts
git commit -m "feat(config): add DEADZONE_RADIUS_FRACTION for the loot no-drop radius"
```

---

### Task 2: Shrink the drop-gate radius in `#handleKillDrop`

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:9-16` (import block)
- Modify: `src/game/scenes/ArenaScene.ts:913-930` (`#handleKillDrop`)

**Interfaces:**
- Consumes: `DEADZONE_RADIUS_FRACTION` from Task 1.
- Produces: no new exports; `#handleKillDrop`'s external behavior (called
  from `ArenaScene.ts:~360` and `~664`) is unchanged in signature, only in
  which kills count as barren.

- [ ] **Step 1: Add the import**

`ArenaScene.ts`'s import block (`ArenaScene.ts:6-21`) is alphabetized:
`AEGIS, ARENA, AURA_RADIUS_BASE, BARREN_MARGIN, CARBINE, CATALYST_VALUE,
DETONATOR, DIRECTOR_PRESETS, ...`. Add `DEADZONE_RADIUS_FRACTION` between
`CATALYST_VALUE` and `DETONATOR` to keep that order:

```ts
  CATALYST_VALUE,
  DEADZONE_RADIUS_FRACTION,
  DETONATOR,
```

- [ ] **Step 2: Update the gate and its doc-comment**

Replace the `#handleKillDrop` docblock and its first two lines:

```ts
  /**
   * Dead-zone eligibility, then pity, then ejection. A kill within
   * DEADZONE_RADIUS_FRACTION of the live aura radius produces no canister
   * at all, and does NOT advance the pity counter -- defending the tree
   * up close must never silently burn the player's accumulated drop odds.
   * Kills beyond that radius roll and drop normally, per delta spec 4.
   */
  #handleKillDrop(killX: number, killY: number): void {
    const deadZoneRadius = this.#auraRadius * DEADZONE_RADIUS_FRACTION;
    const homeDist = Phaser.Math.Distance.Between(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
    );
    if (homeDist < deadZoneRadius) {
      this.#particles.dustPuff(killX, killY);
      return;
    }

    const tier = this.#pity.rollOnKill();
    if (!tier) return;

    this.#canisters.eject(
```

(Everything after `this.#canisters.eject(` is unchanged — only the docblock
and the `barrenRadius` → `deadZoneRadius` variable rename/formula change.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the printed local URL, play until you can kill an
enemy at a measured distance — use the on-screen aura ring (cyan) as a
100px-radius-ish visual reference, or eyeball roughly halfway between the
tree and the aura ring's edge. Kill an enemy there.
Expected: either a canister appears at the kill spot (drop rolled) or a grey
dust puff with no canister (drop missed on the pity roll) — either is
correct, since pity is probabilistic. Repeat 5-10 kills in the 110-220px
band; you should see at least one canister appear (pity guarantees a drop
within 7 consecutive misses). Confirm no canister ever appears for a kill
made while standing directly on top of the tree (well under 110px).

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "fix(loot): shrink no-drop radius from auraRadius+120 to auraRadius/2"
```

---

### Task 3: Resize the barren-zone visual ring to match the new radius

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:280-283` (`#barrenSprite` creation)
- Modify: `src/game/scenes/ArenaScene.ts:490-493` (`#barrenSprite` resize on
  Wider Canopy)

**Interfaces:**
- Consumes: `DEADZONE_RADIUS_FRACTION` (already imported in Task 2).
- Produces: nothing new; visual-only change.

- [ ] **Step 1: Update the creation-time sizing**

In `ArenaScene.ts`, find (around line 280):

```ts
    this.#barrenSprite.setDisplaySize(
      (this.#auraRadius + BARREN_MARGIN) * 2,
      (this.#auraRadius + BARREN_MARGIN) * 2,
    );
```

Replace with:

```ts
    this.#barrenSprite.setDisplaySize(
      this.#auraRadius * DEADZONE_RADIUS_FRACTION * 2,
      this.#auraRadius * DEADZONE_RADIUS_FRACTION * 2,
    );
```

- [ ] **Step 2: Update the Wider Canopy resize**

In the same file, find (around line 490, inside the `wider-canopy` upgrade
branch):

```ts
        this.#barrenSprite.setDisplaySize(
          (this.#auraRadius + BARREN_MARGIN) * 2,
          (this.#auraRadius + BARREN_MARGIN) * 2,
        );
```

Replace with:

```ts
        this.#barrenSprite.setDisplaySize(
          this.#auraRadius * DEADZONE_RADIUS_FRACTION * 2,
          this.#auraRadius * DEADZONE_RADIUS_FRACTION * 2,
        );
```

- [ ] **Step 3: Check for now-unused `BARREN_MARGIN` import**

Run: `grep -n "BARREN_MARGIN" src/game/scenes/ArenaScene.ts`
Expected: no matches remain in this file (both call sites were the only
uses). If none remain, remove `BARREN_MARGIN` from the import block added
back in Task 2's Step 1 area (it was already imported before this plan
started — just drop it from the import list now that nothing in this file
references it).

- [ ] **Step 4: Type-check**

Run: `npm run build`
Expected: succeeds with no errors. `tsconfig.app.json` has `noUnusedLocals:
true`, so if `BARREN_MARGIN` wasn't removed from the import list in Step 3
despite being unused, this build will fail — that's the signal to go back
and remove it.

- [ ] **Step 5: Manual verification**

Run: `npm run dev`, open the game. Look at the grey barren ring around the
tree at game start (before any upgrades) — it should visually sit at half
the radius of the cyan aura ring, not past it. Pick the "Wider Canopy"
upgrade at a Generation draft and confirm the grey ring grows proportionally
with the cyan aura ring and stays at half its radius.

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "fix(loot): resize barren-zone ring to match the new dead-zone radius"
```

---

### Task 4: Lighten easy-mode spawn pressure

**Files:**
- Modify: `src/game/config.ts:122-131` (`DIRECTOR_PRESETS.easy`)

**Interfaces:**
- Consumes: nothing new.
- Produces: `DIRECTOR_PRESETS.easy` with new values, consumed by
  `SpawnDirector` (unchanged code) and by Task 5's test updates.

- [ ] **Step 1: Update the preset**

In `src/game/config.ts`, replace:

```ts
  easy: {
    baseThreat: 1.8,
    threatPerSec: 0.1,
    maxSpawnsPerSecond: 2,
    unlockAtSec: {
      swarmer: 0,
      detonator: 75,
      brute: 150,
    },
  },
```

with:

```ts
  easy: {
    baseThreat: 1.0,
    threatPerSec: 0.05,
    maxSpawnsPerSecond: 2,
    unlockAtSec: {
      swarmer: 0,
      detonator: 140,
      brute: 260,
    },
  },
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/game/config.ts
git commit -m "feat(difficulty): lighten easy-mode spawn pressure"
```

(This commit will leave `SpawnDirector.test.ts` failing until Task 5 — that
is expected and fixed in the very next task.)

---

### Task 5: Fix `SpawnDirector.test.ts` for the new easy-mode numbers

**Files:**
- Modify: `src/game/systems/SpawnDirector.test.ts:102-124`

**Interfaces:**
- Consumes: `DIRECTOR_PRESETS.easy` from Task 4.
- Produces: nothing new; test-only change.

- [ ] **Step 1: Run the suite to confirm the expected failure**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts`
Expected: FAIL — `'unlocks the Bio-Detonator at 75 seconds on Easy'` fails
because `spawned` no longer contains `'detonator'` at `t=75` (new unlock is
140s).

- [ ] **Step 2: Update the two Easy-detonator-unlock tests**

Replace:

```ts
  it('does not unlock the Bio-Detonator before 75 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 74; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).not.toContain('detonator');
  });

  it('unlocks the Bio-Detonator at 75 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 75; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).toContain('detonator');
  });
```

with:

```ts
  it('does not unlock the Bio-Detonator before 140 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 139; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).not.toContain('detonator');
  });

  it('unlocks the Bio-Detonator at 140 seconds on Easy', () => {
    const director = new SpawnDirector(
      scriptedRng(new Array(20).fill(0.99)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 140; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).toContain('detonator');
  });
```

- [ ] **Step 3: Fix the stale comment in the threat-target test**

Immediately below, find:

```ts
  it('reaches a lower threat target on Easy than on Hard at the same elapsed time', () => {
    // targetThreat(60) on Hard = 3 + 60/6 = 13; on Easy = 1.8 + 60*0.1 = 7.8.
    // Pin aliveThreat at 10 -- above Easy's target (Easy spawns nothing)
    // but below Hard's (Hard still needs to close a 3-point gap).
```

Replace the second comment line with the corrected numbers (the assertion
itself does not change — `4.0 < 10` still holds):

```ts
  it('reaches a lower threat target on Easy than on Hard at the same elapsed time', () => {
    // targetThreat(60) on Hard = 3 + 60/6 = 13; on Easy = 1.0 + 60*0.05 = 4.0.
    // Pin aliveThreat at 10 -- above Easy's target (Easy spawns nothing)
    // but below Hard's (Hard still needs to close a 3-point gap).
```

- [ ] **Step 4: Run the full test file**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts`
Expected: PASS — all tests green.

- [ ] **Step 5: Run the full test suite**

Run: `npx vitest run`
Expected: PASS — no other file references the old easy-mode numbers (already
confirmed during spec review: only this file hardcoded them).

- [ ] **Step 6: Commit**

```bash
git add src/game/systems/SpawnDirector.test.ts
git commit -m "test(spawn-director): update Easy detonator-unlock assertions for new timing"
```

---

### Task 6: Full verification pass

**Files:** none modified.

**Interfaces:** none.

- [ ] **Step 1: Full type-check and build**

Run: `npm run build`
Expected: succeeds, no errors.

- [ ] **Step 2: Full lint**

Run: `npm run lint`
Expected: no errors (this does not type-check, `build` already covered
that).

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: all tests pass.

- [ ] **Step 4: Manual playtest, both changes together**

Run: `npm run dev`, open the game, select Easy mode from the title screen.
Play for 2-3 minutes:
- Confirm enemy pressure feels lighter than before (fewer/slower spawns
  early on; no Bio-Detonator until well past 2 minutes elapsed).
- Kill several enemies at varying distances from the tree, including some
  in the 110-220px band (inside the old dead zone, now eligible). Confirm
  canisters appear there over a handful of kills (pity guarantees a drop
  by the 7th consecutive miss-free kill) and that the barren ring visually
  matches where drops actually stop.

No commit for this task — it's a verification checkpoint only.
