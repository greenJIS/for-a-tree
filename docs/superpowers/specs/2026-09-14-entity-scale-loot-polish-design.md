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
| Swarmer             |           36 |       90 | hardcoded literal in `EnemyPool.ts`     | `SWARMER.displaySize` in `config.ts`    |
| Brute               |           48 |      120 | `BRUTE.displaySize`                     | `BRUTE.displaySize` (updated)           |
| Detonator           |           40 |      100 | `DETONATOR.displaySize`                 | `DETONATOR.displaySize` (updated)       |
| Canister            |           24 |       60 | `CANISTER.displaySize`                  | `CANISTER.displaySize` (updated)        |
| Tree phase 1 (sprout) |         64 |      160 | literal `64` in `ArenaScene.ts`         | `TREE.phaseSizes[0]` in `config.ts`     |
| Tree phase 2         |           96 |      240 | literal in `phaseSize` array            | `TREE.phaseSizes[1]`                    |
| Tree phase 3         |          128 |      320 | literal in `phaseSize` array            | `TREE.phaseSizes[2]`                    |
| Tree phase 4         |          160 |      400 | literal in `phaseSize` array            | `TREE.phaseSizes[3]`                    |

Note: at full growth the tree (400px) approaches the aura ring diameter (440px, unchanged). This is
an accepted visual tradeoff of "bigger" — the tree becomes a dominant landmark rather than a small
icon. Aura radius, dash ghost trail, aegis dome, and hitbox/collision radii (`PLAYER.radius`,
enemy physics bodies) are **not** touched by this change — only visual `displaySize`. If a
`setCircle`/body-radius call derives from `displaySize` anywhere, it must be checked during
implementation so hitboxes don't silently balloon to 2.5x.

## Loot drop bounce animation

On `CanisterPool.eject()`, after computing the rest position, chain a Phaser tween on top of the
existing move-to-rest tween:

- Vertical rise: sprite's render `y` offsets upward ~20px and back to baseline (simulates a pop/arc),
  eased `Quad.easeOut` on the way up, `Quad.easeIn` on the way down.
- Squash: `scaleY` dips to 0.8x at the peak of the fall and rebounds to 1.0x on landing, giving a
  cartoon "3D" landing weight cue.
- One-shot only — plays once during the eject/settle sequence, then the canister is static (per
  the "once on drop" decision). No continuous idle bob.
- Implemented as a tween on the existing canister sprite; no new pooled objects, no new art, no
  per-frame math in `update()` — keeps the zero-allocation-in-update contract intact.

## Vanish warning

Replace the current `despawnFlashHz` alpha-flicker (`CanisterPool.update()`) with a red-tint
flicker: alternate `setTint(0xff0000)` / `clearTint()` at the existing 8Hz flash rate, instead of
alternating alpha 1/0.3. Same cadence logic, different visual channel — tint instead of alpha.

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

`Player.ts`, `EnemyPool.ts`, and `ArenaScene.ts` (tree phase array) switch from literals to these
config reads.

## Testing

No test runner in this repo. Verify manually via `npm run dev`:

- Visual check: player/enemies/canister/tree render at new sizes without clipping the HUD or
  overlapping the aura ring awkwardly.
- Kill an enemy near a drop-eligible radius, confirm canister bounces once on landing.
- Let a canister sit 15s+ and confirm it flashes red (not dim/bright) for the last 5s, then
  despawns at 20s.
- Confirm hitboxes/collision behavior is unchanged (enemies still take the same number of hits to
  die at the same range; player collision box doesn't feel bigger than the sprite).
