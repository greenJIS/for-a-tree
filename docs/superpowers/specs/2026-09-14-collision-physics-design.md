# Collision Physics — Design

## Problem

No solid-body collision exists between player and enemies, or between enemies and
each other. `EnemyPool.pursue()` sets every enemy's velocity straight at the
player's position each frame with no separation term, and the only player-enemy
interaction wired up is `physics.add.overlap` (ArenaScene.ts:370), which detects
overlap for melee damage but does not push bodies apart. Enemies visibly stack
inside the player sprite and inside each other.

## Approach

Use Arcade Physics colliders for solid-body separation instead of manual
steering math. This matches the architecture split in CLAUDE.md: Phaser/Arcade
Physics owns pursuit vectors and simulation; React/manual code should not
reinvent collision resolution Arcade already provides. Arcade's collider
broadphase handles the enemy-enemy sweep natively at 60 enemies with no
per-frame O(n²) hand-rolled distance checks.

An alternative (boid-style separation vector blended into `pursue()`'s velocity
calc) was considered and rejected: more code, reinvents what `physics.add
.collider` does for free, and fights the "Arcade owns physics" boundary.

## Changes

### Player-enemy: overlap → collider

ArenaScene.ts:370 currently:

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

Change `physics.add.overlap` to `physics.add.collider`, same callback
unchanged, plus a `processCallback` that suppresses collision entirely while
the player is dashing:

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

Arcade's collider fires the callback on contact each step *before* separating
the bodies, so melee still triggers every step contact occurs (existing
`nextMeleeAtMs` cooldown in `#takeMeleeFrom` already gates damage cadence — no
change there). The body is now also solid: enemies can no longer occupy the
same space as the player.

**Dash must stay a pass-through.** The loop-correction spec (§3.1) frames dash
as the crowd-escape tool — "dashing through a crowd" is the explicit intended
use. A plain solid collider would physically stop the player at an enemy's
edge mid-dash, silently breaking that mechanic. The `processCallback` above
(`() => !this.#player.isDashing`) skips both separation and the melee callback
while dashing, so the player passes through enemies during the dash window
exactly as before this change. This doesn't duplicate the existing
`isDashing` check inside `#takeMeleeFrom` — that check stops damage even on a
stray non-dash contact right at dash's edge; the processCallback stops the
*physical* block, a separate effect.

### Player body: not pushable

Immediately after player sprite creation (Player.ts constructor, after
`scene.physics.add.image(...)`), set:

```ts
if (this.sprite.body instanceof Phaser.Physics.Arcade.Body) {
  this.sprite.body.pushable = false;
}
```

Without this, a mob of enemies colliding with the player (equal default mass)
would physically shove the player around on contact. `pushable = false` keeps
the player's own movement code (`update()`'s `setVelocity` from input/dash) as
the sole authority over player position — enemies still collide-block against
the player and get displaced off them, but cannot displace the player.

### Enemy-enemy: new collider

Near EnemyPool construction (ArenaScene.ts, right after `this.#enemies = new
EnemyPool(this, 60)` at line 300), add:

```ts
this.physics.add.collider(this.#enemies.group, this.#enemies.group);
```

Self-collision on the group, no callback — pure separation. Enemies pursuing
the same target point will now push off each other instead of stacking,
naturally producing a crowd/queue effect around the player.

## Explicitly unchanged

- **Bullet-enemy overlap** (ArenaScene.ts:319) stays `overlap`, not `collider`
  — bullets must pass through or pierce, not physically block.
- **Bio-Detonator lock-range check** (`#updateDetonators`, ArenaScene.ts:1019)
  is already a `Phaser.Math.Distance.Between` check against the player, not
  overlap-based. Unaffected by the collider changes.
- **`EnemyPool.pursue()`** pursuit-vector math is unchanged — enemies still
  aim straight at the player's current position every tick. Separation now
  comes from Arcade's collision correction after `pursue()` sets velocity,
  not from a steering term blended into the vector itself.
- **Body shape** stays the default rectangular Arcade body Phaser derives from
  each sprite's display size (already correct — bullet-hit detection already
  depends on this sizing working). No switch to circular bodies; that's a
  cosmetic precision improvement, out of scope here.

## Testing

No test runner in this project yet (per CLAUDE.md). Verify manually via
`npm run dev`: mob of swarmers should queue around the player instead of
overlapping it or each other; player should not be flung by contact; melee
damage cadence should feel unchanged from before.
