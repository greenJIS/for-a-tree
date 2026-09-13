# Collision Physics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give player and enemies solid-body collision — enemies no longer stack
inside the player or each other — without breaking dash's crowd-pass-through or
existing melee damage cadence.

**Architecture:** Replace the player-enemy `physics.add.overlap` with
`physics.add.collider` (same melee callback, gated off during dash via a
`processCallback`), pin the player body as non-pushable so a mob can't shove it
around, and add a self-collider on the enemy group for enemy-enemy separation.
All three changes live in Arcade Physics setup code already present in
`Player.ts` and `ArenaScene.ts` — no new files, no new state.

**Tech Stack:** Phaser 4 Arcade Physics, TypeScript (strict, no `any`, no `as`).

## Global Constraints

- No `any` type anywhere. No `as` type assertions — use `instanceof` guards
  (matches the existing pattern at `ArenaScene.ts:357`).
- `strict: true` TypeScript — `npm run build` is the real type check
  (`npm run lint` does not type-check).
- No test runner exists in this project yet — verification is `npm run build`
  (typecheck) plus manual play-testing via `npm run dev`, per CLAUDE.md.
- Pooling/Arcade ownership conventions already in place must not change:
  enemies stay in `EnemyPool`'s single physics group, bullet-enemy interaction
  stays `overlap` (not touched by this plan).
- Spec: `docs/superpowers/specs/2026-09-14-collision-physics-design.md`.

---

## File Structure

- **Modify:** `src/game/entities/Player.ts` — set the player's Arcade body to
  non-pushable at construction.
- **Modify:** `src/game/scenes/ArenaScene.ts` — swap the player-enemy
  `overlap` for a dash-aware `collider` (`:370-377` in current file), and add
  an enemy-enemy self-collider next to `EnemyPool` construction (`:300`).

No test files: this repo has no test runner (per CLAUDE.md). Verification is
`npm run build` for typecheck and manual play-testing steps spelled out per
task.

---

### Task 1: Pin player body as non-pushable

**Files:**
- Modify: `src/game/entities/Player.ts:26-48` (constructor)

**Interfaces:**
- Consumes: `this.sprite` (`Phaser.Physics.Arcade.Image`), already created at
  `Player.ts:29` via `scene.physics.add.image(x, y, 'sheet', FRAME.player)`.
- Produces: nothing new exported. Downstream Task 2's collider relies on this
  having already run (player body must be non-pushable before any collider
  involving the player fires), so this task must land first.

- [ ] **Step 1: Add the pushable guard right after `setCollideWorldBounds`**

Open `src/game/entities/Player.ts`. Find this block (lines 29-32):

```ts
    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
    this.sprite.setCollideWorldBounds(true);
    scene.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);
```

Replace it with:

```ts
    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
    this.sprite.setCollideWorldBounds(true);
    scene.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);

    if (this.sprite.body instanceof Phaser.Physics.Arcade.Body) {
      this.sprite.body.pushable = false;
    }
```

This keeps the existing no-`as` convention (`instanceof` guard, matching
`ArenaScene.ts:357`). `body.pushable = false` means other Arcade bodies
colliding with the player get displaced, but the player's own body is never
displaced by a collision — the player's own `setVelocity` calls in
`update()` remain the sole authority over player position.

- [ ] **Step 2: Format**

Run: `npx prettier --write src/game/entities/Player.ts`
Expected: file reformatted in place if needed (no hook is wired in this
project — CLAUDE.md requires this manual step after edits).

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: no TypeScript errors, `dist/` bundle produced.

- [ ] **Step 4: Commit**

```bash
git add src/game/entities/Player.ts
git commit -m "$(cat <<'EOF'
fix(player): pin player body as non-pushable

Prepares for solid player-enemy collision (next commit). Without
this, a mob colliding with the player would physically shove them
around on contact -- the player's own movement code should be the
only thing that moves the player.
EOF
)"
```

---

### Task 2: Player-enemy collider, dash-aware

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:370-377`

**Interfaces:**
- Consumes: `this.#player.sprite` (`Phaser.Physics.Arcade.Image`, non-pushable
  as of Task 1), `this.#player.isDashing` (existing getter, `Player.ts:62-64`,
  returns `boolean`), `this.#enemies.group` (`Phaser.Physics.Arcade.Group`),
  `isArcadeImage` (existing type guard from `../guards`), `this.#takeMeleeFrom`
  (existing private method, `ArenaScene.ts:843`, signature
  `(enemy: Phaser.Physics.Arcade.Image) => void`).
- Produces: nothing new exported. This task can land independently of Task 3.

- [ ] **Step 1: Replace the player-enemy overlap with a dash-gated collider**

Open `src/game/scenes/ArenaScene.ts`. Find this block (lines 370-377):

```ts
    this.physics.add.overlap(
      this.#player.sprite,
      this.#enemies.group,
      (_playerObj, enemyObj) => {
        if (!isArcadeImage(enemyObj)) return;
        this.#takeMeleeFrom(enemyObj);
      },
    );
```

Replace it with:

```ts
    this.physics.add.collider(
      this.#player.sprite,
      this.#enemies.group,
      (_playerObj, enemyObj) => {
        if (!isArcadeImage(enemyObj)) return;
        this.#takeMeleeFrom(enemyObj);
      },
      () => !this.#player.isDashing,
    );
```

The fourth argument is Arcade's `processCallback` — it runs before Arcade
decides whether to separate the bodies and invoke the collide callback at
all. Returning `false` while dashing skips both separation *and* the melee
callback, so a dashing player passes straight through enemies exactly as
before this change (the crowd-escape use case called out in the
loop-correction spec, §3.1). `#takeMeleeFrom` (`ArenaScene.ts:843`) already
independently no-ops when `this.#player.isDashing` is true — this
`processCallback` is what stops the *physical* block; that early-return is
what stops *damage* on a stray non-dash edge case. Both stay in place, each
covering a different effect.

- [ ] **Step 2: Format**

Run: `npx prettier --write src/game/scenes/ArenaScene.ts`
Expected: file reformatted in place if needed (no hook is wired in this
project — CLAUDE.md requires this manual step after edits).

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the served URL.

- Walk the player into a swarmer: player should stop at the enemy's edge
  (no longer overlap/stack), melee damage + camera shake + invuln flicker
  should still fire exactly as before.
- Hold Shift to dash directly at a cluster of enemies: player sprite should
  pass through them during the dash window (no stutter/block), consistent
  with pre-change dash behavior.
- Stand still next to several enemies and let them close in: player position
  should not visibly get shoved/displaced by the pile of enemy bodies.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
fix(collision): make player-enemy contact solid, dash still passes through

Swaps the player-enemy overlap for a collider so enemies can no
longer occupy the same space as the player. Gated off during
isDashing via processCallback so dash keeps working as the
crowd-escape tool the loop-correction spec calls for.
EOF
)"
```

---

### Task 3: Enemy-enemy separation collider

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:299-303`

**Interfaces:**
- Consumes: `this.#enemies.group` (`Phaser.Physics.Arcade.Group`, created at
  `ArenaScene.ts:300` via `new EnemyPool(this, 60)`).
- Produces: nothing new exported. Independent of Task 2 — order between Task
  2 and Task 3 doesn't matter, but both must land after Task 1 (player body
  non-pushable) so Task 2's manual verification is meaningful. This plan
  sequences Task 3 last for a clean incremental commit history.

- [ ] **Step 1: Add the enemy-enemy self-collider**

Open `src/game/scenes/ArenaScene.ts`. Find this block (lines 299-303):

```ts
    this.#bullets = new BulletPool(this, 200);
    this.#enemies = new EnemyPool(this, 60);
    this.#enemies.group.getChildren().forEach((child, index) => {
      child.setData('id', index + 1);
    });
```

Replace it with:

```ts
    this.#bullets = new BulletPool(this, 200);
    this.#enemies = new EnemyPool(this, 60);
    this.#enemies.group.getChildren().forEach((child, index) => {
      child.setData('id', index + 1);
    });
    this.physics.add.collider(this.#enemies.group, this.#enemies.group);
```

Self-collision on one group, no callback — pure separation. Arcade's own
broadphase handles the sweep; at the pool's max of 60 enemies this is cheap
and needs no manual distance checks. Enemies converging on the same target
point (per `EnemyPool.pursue()`, unchanged) will now push off each other
instead of stacking.

- [ ] **Step 2: Format**

Run: `npx prettier --write src/game/scenes/ArenaScene.ts`
Expected: file reformatted in place if needed (no hook is wired in this
project — CLAUDE.md requires this manual step after edits).

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: no TypeScript errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the served URL.

- Let a large group of swarmers converge on the player: they should queue
  up / spread around the player instead of overlapping each other.
- Bait a Bio-Detonator into a crowd (per the existing explosion mechanic,
  `ArenaScene.ts:1010-1017`): confirm the explosion's AoE-to-other-enemies
  check still fires correctly (it's distance-based, not overlap-based, so it
  should be unaffected) and that the crowd still visually separates before
  the explosion.
- Confirm bullets still register hits normally against enemies (bullet-enemy
  interaction is untouched `overlap`, not `collider` — this step confirms no
  regression).

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(collision): separate enemies from each other on contact

Adds a self-collider on the enemy group so pursuing enemies push
off each other instead of stacking inside one another while
converging on the player.
EOF
)"
```

---

## Post-Plan Verification

- [ ] `npm run build` — final full typecheck across all three commits.
- [ ] `npm run lint` — no new lint errors introduced.
- [ ] Full manual playtest via `npm run dev`: spawn a heavy wave, confirm no
  enemy visually occupies the same space as the player or another enemy,
  confirm dash still cuts through crowds, confirm melee damage cadence and
  Bio-Detonator explosions feel unchanged from before this plan.
