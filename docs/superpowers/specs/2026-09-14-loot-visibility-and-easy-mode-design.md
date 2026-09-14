# Loot Visibility & Easy Mode Tuning — Design

## Context

Two independent small tuning changes, bundled because both are config/gate tweaks
discovered in the same session:

1. Players killing enemies while defending the tree saw no catalyst drops at all.
   This was partly a real bug (canister pool never rendered — fixed separately,
   commit `56ea718`) and partly by design: delta-spec 4
   (`docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md`)
   deliberately makes kills within `auraRadius + BARREN_MARGIN` (340px base) drop
   nothing, so defending the tree can't cash in catalysts without a carry step.
   That radius is larger than the tether/aura radius (220px) itself, so it reads
   as "loot never drops" to a player who mostly fights near the tree.
2. Easy mode's spawn pressure is tuned close to medium (`baseThreat` 1.8 vs 2.4,
   `threatPerSec` 0.1 vs 0.133) and needs to be meaningfully lighter for players
   who want an easy mode to actually be easy.

## 1. Shrink the no-drop dead zone

**Current gate** (`ArenaScene.ts#handleKillDrop`): a kill within
`auraRadius + BARREN_MARGIN` of the tree (340px at base aura 220px) produces a
dust-puff and no canister, and does not advance the pity miss-streak.

**New gate:** shrink the no-drop radius to `auraRadius * DEADZONE_RADIUS_FRACTION`
(`DEADZONE_RADIUS_FRACTION = 0.5`, i.e. 110px at base aura). Kills at or beyond
this radius roll pity and drop exactly as they do today — no changes to
`PityDropSystem`, `CanisterPool.eject()`, or tier weighting.

The radius scales with the live aura radius (`auraRadius` already includes the
Wider Canopy upgrade bonus), matching how the old barren radius scaled.

**Canister rest-position physics is unchanged.** `CanisterPhysics.computeCanisterRest`
still uses `auraRadius + BARREN_MARGIN` (340px) as its "can't rest closer than
this" clamp — that clamp only bites for kills that started beyond it. For a kill
in the newly-eligible 110–340px band, `homeDist < barrenRadius` in the physics
module, so `maxAllowedTravel` clamps to 0: the canister spawns and stays exactly
where the enemy died. Since the player was fighting at that spot, the existing
90px magnet radius (`CANISTER.magnetRadius`, doubled by the Vacuum Coils upgrade)
picks it up almost immediately. No new magnet mechanic is needed.

**Visual fix required:** `#barrenSprite`, the ring drawn at
`(auraRadius + BARREN_MARGIN) * 2` to show the player where drops stop, must be
resized to the new `(auraRadius * DEADZONE_RADIUS_FRACTION) * 2` so the ring
matches the real boundary. Leaving it at the old size would show a false
boundary to the player.

### Config change

`src/game/config.ts`:

```ts
export const DEADZONE_RADIUS_FRACTION = 0.5;
```

`BARREN_MARGIN` is kept as-is (still drives the physics rest-clamp).

### Code changes

- `ArenaScene.ts#handleKillDrop`: replace
  `const barrenRadius = this.#auraRadius + BARREN_MARGIN;` with
  `const deadZoneRadius = this.#auraRadius * DEADZONE_RADIUS_FRACTION;` and gate
  on `homeDist < deadZoneRadius`.
- `ArenaScene.ts` (`#barrenSprite` sizing, both at creation and anywhere it's
  resized on aura-radius change): use
  `(this.#auraRadius * DEADZONE_RADIUS_FRACTION) * 2` instead of
  `(this.#auraRadius + BARREN_MARGIN) * 2`.
- `ArenaScene.ts#handleKillDrop`'s doc-comment (currently: "Delta spec 4: a
  kill inside barrenRadius produces no canister at all...") must be reworded
  to describe the new `deadZoneRadius` gate instead of citing the old
  barren-radius rule verbatim, so the comment doesn't contradict the code
  beneath it.

### Out of scope

- No change to `CanisterPhysics.ts`, `PityDropSystem.ts`, `CanisterPool.ts`.
- No change to the aura ring (`#auraSprite`) or tether mechanics.
- No new magnet behavior — existing magnet radius is sufficient given the new
  drop-gate radius is inside where the player is already standing.

## 2. Easy mode: aggressively lighter spawn pressure

**Current** (`DIRECTOR_PRESETS.easy` in `src/game/config.ts`):

```ts
easy: {
  baseThreat: 1.8,
  threatPerSec: 0.1,
  maxSpawnsPerSecond: 2,
  unlockAtSec: { swarmer: 0, detonator: 75, brute: 150 },
},
```

**New:**

```ts
easy: {
  baseThreat: 1.0,
  threatPerSec: 0.05,
  maxSpawnsPerSecond: 2,
  unlockAtSec: { swarmer: 0, detonator: 140, brute: 260 },
},
```

- `baseThreat`: 1.8 → 1.0 (~44% lower starting threat budget).
- `threatPerSec`: 0.1 → 0.05 (ramp takes twice as long to reach any given
  threat level).
- `unlockAtSec.detonator`: 75s → 140s; `unlockAtSec.brute`: 150s → 260s (both
  enemy types stay off the table much longer).
- `maxSpawnsPerSecond` unchanged (2) — this caps burst spawning, not overall
  pressure, and wasn't part of the ask.

No change to `medium`, `hard`, `DIRECTOR` (the shared HP/damage ramp-per-60s),
or any player-side stat (tree decay rate, ammo regen, damage taken, HP) — scope
is spawn pressure only, per explicit confirmation.

### Out of scope

- `medium`/`hard` presets untouched.
- Player-facing systems (tether/decay, ammo, tree growth rate) untouched.

## Testing

- `SpawnDirector.test.ts` hardcodes the *current* easy-mode numbers as
  assertions and **will break** once the preset changes:
  - `'unlocks the Bio-Detonator at 75 seconds on Easy'` (line 112) asserts
    `spawned` contains `'detonator'` at `t=75`; with the new 140s unlock this
    fails and must be updated to `t=140`.
  - `'does not unlock the Bio-Detonator before 75 seconds on Easy'` (line 102)
    stays passing (still true, just a weaker check now) but should be updated
    to assert against the new 140s boundary for clarity.
  - The comment on line 123 (`targetThreat(60) on Easy = 1.8 + 60*0.1 = 7.8`)
    is stale prose, not an assertion, but must be corrected to
    `1.0 + 60*0.05 = 4.0` to avoid misleading future readers. The assertion
    itself (`easy.update(0, 10).length` is `0`) still holds under the new
    numbers since 4.0 < 10, so no logic change needed there.
- No existing test covers the drop-gate radius directly (`ArenaScene` isn't
  unit-tested — it's exercised via manual play, per this session's debug-log
  approach). Manual verification: kill an enemy at a measured distance between
  110px and 340px from the tree and confirm a canister appears at the kill
  spot instead of a dust puff.
