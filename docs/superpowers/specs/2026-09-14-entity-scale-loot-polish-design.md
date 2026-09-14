# Entity Scale & Loot Drop Polish

**Date:** 2026-09-14
**Status:** Approved

## Problem

Player, enemies, canisters, and the tree read too small on the 1280x720 arena. Loot drops (canisters)
are a plain static sprite that despawns silently — no landing feedback, no warning before it vanishes,
and the current 15s lifetime is too short.

## Scope

- Bump display size of player, all enemy kinds, canisters, and the tree (all growth phases) by 2.5x.
- Add a one-shot "landing" bounce animation to canisters when they eject.
- Replace the current despawn alpha-flicker with a red-tint flicker as the vanish warning.
- Extend canister lifetime from 15s to 20s, with the last 5s carrying the red-flash warning.

Out of scope: bullets, particles, HUD icons, aegis dome, aura ring — untouched.

## Sizes (2.5x multiplier)

All balance literals live in `src/game/config.ts` per its header contract ("no other module may
contain a balance literal"). Two entities currently violate that (`Player.ts` hardcodes `40`,
`EnemyPool.ts` hardcodes `36` for swarmer) — this work fixes both by sourcing them from config.

| Entity            | Current (px) | New (px) | Source before                          | Source after                          |
| ------------------ | -----------: | -------: | --------------------------------------- | --------------------------------------- |
| Player              |           40 |      100 | hardcoded literal in `Player.ts`        | `PLAYER.displaySize` in `config.ts`     |
| Swarmer             |           36 |       90 | hardcoded literal in `EnemyPool.ts`     | `SWARMER.displaySize` (new field on the existing `SWARMER` const) |
| Brute               |           48 |      120 | `BRUTE.displaySize`                     | `BRUTE.displaySize` (updated)           |
| Detonator           |           40 |      100 | `DETONATOR.displaySize`                 | `DETONATOR.displaySize` (updated)       |
| Canister            |           24 |       60 | `CANISTER.displaySize`                  | `CANISTER.displaySize` (updated)        |
| Tree phase 1 (sprout) |         64 |      160 | literal `64` in `ArenaScene.ts`         | `TREE.phaseSizes[0]` in `config.ts`     |
| Tree phase 2         |           96 |      240 | literal in `phaseSize` array            | `TREE.phaseSizes[1]`                    |
| Tree phase 3         |          128 |      320 | literal in `phaseSize` array            | `TREE.phaseSizes[2]`                    |
| Tree phase 4         |          160 |      400 | literal in `phaseSize` array            | `TREE.phaseSizes[3]`                    |

Note: at full growth the tree (400px) approaches the aura ring diameter (440px, unchanged). This is
an accepted visual tradeoff of "bigger" — the tree becomes a dominant landmark rather than a small
icon. Aura radius, dash ghost trail, and aegis dome are unaffected — they aren't touched by this
change.

**Hitboxes scale too, deliberately.** Player and every mutant are `physics.add.image`/group Arcade
bodies with no `setSize`/`setCircle` call anywhere in `Player.ts` or `EnemyPool.ts` — confirmed by
grep. Arcade's default body recomputes its width/height from the GameObject's live scale every
step, so `setDisplaySize` alone grows the collision body proportionally: melee reach, bullet-hit
radius, and enemy-enemy separation all become 2.5x along with the sprite. This is accepted as
correct, not a bug to work around — a bigger mutant should be easier to hit and reach further.
`PLAYER.radius` (20) and `SWARMER.radius` (18) in `config.ts` are pre-existing dead fields, unused
by any collision or distance check in the codebase; this work does not wire them up or touch them.
The canister (`add.group`, plain `Image`, no physics body) and the tree (`add.image`, no physics
at all) have no collision consequence from their size change.

## Loot drop bounce animation

`eject()` already runs one tween moving the canister's `x`/`y` to its rest position — a second
tween cannot also drive `y` for a rise/fall arc without the two fighting over the same property
each frame (Phaser tweens don't compose on a shared property; whichever updates last that frame
wins, producing jitter). The bounce must ride on a property the position tween doesn't touch, so
it's built from scale alone, run as a second tween added alongside the existing one (same target,
disjoint properties — `scaleX`/`scaleY` vs `x`/`y` — so no conflict):

- Pop: `setDisplaySize(CANISTER.displaySize, ...)` already sets the sprite's baseline scale (e.g.
  ≈0.117 for a 512px frame at 60px display) — capture that as `baseScale` right after the call,
  then tween `scaleX`/`scaleY` from `baseScale * 1.3` down to `baseScale` (`Back.easeOut`) over
  the same span as the move-to-rest tween, reading as the canister "arriving with weight" rather
  than fading in at rest size.
- Squash: immediately chained after the pop, a quick `scaleY` dip to `baseScale * 0.8` and
  rebound to `baseScale` (`Quad.easeOut`, ~120ms) once landing finishes, giving the cartoon "3D"
  landing cue.
- One-shot only — plays once during eject/settle, then the canister is static (per the "once on
  drop" decision). No continuous idle bob.
- Implemented as a tween on the existing canister sprite; no new pooled objects, no new art, no
  per-frame math in `update()` — keeps the zero-allocation-in-update contract intact.

## Vanish warning

Replace the current `despawnFlashHz` alpha-flicker (`CanisterPool.update()`) with a red-tint
flicker at the same 8Hz cadence. The canister already carries its tier color via
`setTint(TIER_TINT[tier])` from `eject()`, and that identity must stay visible outside the red
phase — so the flicker alternates `setTint(0xff0000)` against `setTint(TIER_TINT[tier])` (read
back via the existing `tier` data field / `CanisterPool.tier()` helper), **not** `clearTint()`,
which would drop the tier color to white for the "off" phase instead of restoring it.

## Lifetime

`CANISTER.lifetimeMs`: 15000 → 20000.
`CANISTER.despawnWarnMs`: 4000 → 5000 (red-flash starts at the 15s mark, runs to despawn at 20s).

## Config changes summary (`src/game/config.ts`)

```ts
export const PLAYER = { ..., radius: 20, displaySize: 100 } as const;
export const SWARMER = { ..., displaySize: 90 } as const; // currently inline in EnemyPool.ts, moves here
export const BRUTE = { ..., displaySize: 120 } as const;
export const DETONATOR = { ..., displaySize: 100 } as const;
export const CANISTER = {
  ...,
  lifetimeMs: 20000,
  despawnWarnMs: 5000,
  displaySize: 60,
} as const;
export const TREE = { phaseSizes: [0, 160, 240, 320, 400] } as const; // new export
```

`Player.ts`, `EnemyPool.ts`, and `ArenaScene.ts` switch from literals to these config reads.
The tree size is set in two separate spots in `ArenaScene.ts` — the initial
`this.#treeSprite.setDisplaySize(64, 64)` at scene creation, and the `phaseSize` array read every
`update()` (`[0, 64, 96, 128, 160]`) — both must be changed to `TREE.phaseSizes` or the tree will
render at the old size for one frame before its first `update()` tick corrects it.

## Testing

No test runner in this repo. Verify manually via `npm run dev`:

- Visual check: player/enemies/canister/tree render at new sizes without clipping the HUD or
  overlapping the aura ring awkwardly.
- Kill an enemy near a drop-eligible radius, confirm canister bounces once on landing.
- Let a canister sit 15s+ and confirm it flashes red (not dim/bright) for the last 5s, then
  despawns at 20s.
- Confirm melee/bullet hit detection still feels fair at the new, larger hitbox sizes (player and
  enemies get hit/land hits at correspondingly greater range — expected, not a regression).
