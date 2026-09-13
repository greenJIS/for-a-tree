# Polish Pass — Design

## Context

Core loop (SRS v2.0 + the loop-correction delta spec) is fully implemented and playable: player,
dash, tree/maturity, tether/grace, carry/deliver, aegis, pity drops, 3 weapons, 3 mutants, spawn
director, 13-card draft, scoring, full HUD, pause/restart, procedural SFX, pooling. Two audit
passes (spec-gap analysis + correctness audit) found a set of remaining items before this is
launch-ready: a scoring-correctness bug, dead event wiring, a spec-required visual/audio layer
that was never started (particles, ground, music), and a few pooling/input edge-case bugs. This
spec folds all of it into one pass since most items are small and several share the same new
subsystem (particles).

## Scope

In scope: everything listed below. Out of scope: the SFX dead-alias cleanup (cosmetic, no
behavior change, not worth spec'ing) and any new gameplay/balance changes beyond what's needed to
match the existing spec exactly.

## 1. Bug — barren-zone radius doesn't track live aura radius

`ArenaScene.#handleKillDrop` and `CanisterPhysics.ts` both compute barren radius from the fixed
`AURA_RADIUS_BASE + BARREN_MARGIN` constant. The delta spec (§4) states aura radius is live and
`Wider Canopy` should move the barren ring outward with it — the aura sprite already resizes on
that upgrade, but the barren check and the barren ring `Graphics` never do.

**Fix:** `CanisterPhysics` and `#handleKillDrop` take a live aura-radius value (read from
`ArenaScene`'s existing `#auraRadius`, the same value used to resize `#auraSprite`) instead of the
constant. The barren ring `Graphics` object is redrawn in the `wider-canopy` upgrade handler
alongside the aura sprite resize, instead of drawn once in `create()`.

## 2. Bug — Detonator explosion kills never counted (HIGH — score correctness)

`#explodeDetonator` (`ArenaScene.ts:967-1000`) kills the detonator itself and any enemies caught
in its blast radius via `EnemyPool.kill(...)`, but never increments `#kills` — unlike every other
kill path (bullet overlap, Aegis retaliation), which does `this.#kills += 1` right after. This
undercounts `ScoreSystem.calculate`'s `perKill` term and the `kills` field in `GAME_OVER`,
specifically for detonator chain-kills — a tactic the code's own comments call out as intended
play ("bait them into a crowd").

**Fix:** increment `#kills` for the detonator's own death and for each enemy killed by its blast,
same as the other two kill paths.

## 3. Bug — stale alpha-tween leaks onto recycled enemy pool slot

`#updateDetonators` starts a `{alpha: 0.3, yoyo: true, repeat: 2}` tween (720ms total) directly on
the enemy game object when a Detonator locks in its telegraph. If the detonator is killed early
(e.g. shot 50ms into its 600ms telegraph), `EnemyPool.kill` disables the body but never stops or
completes the tween, and `EnemyPool.spawn()` never resets `alpha` or clears pending tweens on
reuse. Under sustained spawn pressure, the pool can hand that same object to a freshly spawned
enemy while the orphaned tween is still running, causing an unrelated enemy to visibly flicker.

**Fix:** in `EnemyPool.spawn()`, call `this.scene.tweens.killTweensOf(enemy)` and `enemy.setAlpha(1)`
as part of the existing reset block (alongside frame/size/tint/data reset).

## 4. Bug — manual reload has no full-clip guard

`WeaponInventory.startReload()` only checks `reloadRemainingMs[id] > 0`, not whether the clip is
already full. Pressing `R` on a full magazine starts a real reload cycle (1.1s–2s depending on
weapon) that transfers zero ammo and blocks firing for no benefit.

**Fix:** `startReload()` returns early if `clip[id] >= WEAPON_CONFIGS[id].magSize`, in addition to
the existing in-progress check.

## 5. Bug — SpawnDirector unlock boundary off-by-one

`SpawnDirector` unlock filter uses `elapsedSec > unlockAtSec[kind]`, so an enemy documented as
"unlocks at 45s" actually unlocks the first tick *after* 45s. Low severity (sub-frame in
practice) but should match the documented boundary exactly.

**Fix:** change to `>=`.

## 6. Dead event wiring (data already flows, no consumer)

- **`DASH_STATUS`** → new `DashIndicator.tsx` in `src/hud/`, mounted beside `AegisBadge` in
  `Hud.tsx`. Shows ready/cooling state (icon + cooldown fill), per delta spec §7.2 placement.
- **`GROWTH_STALLED`** → `MaturityGauge.tsx` switches from re-deriving stall state off raw
  `maturityPct`/`ceilingPct` to consuming the event directly (it's the actual signal). Add
  `SoundEffects.growthStalled()`, fired once per stall event (edge-triggered).
- **`WEAPON_SWITCHED`** → `AmmoReadout.tsx` subscribes for the weapon name instead of reading it
  off the `AMMO_UPDATED` payload. Separately: `WeaponInventory.getAmmo()` and both
  `AMMO_UPDATED` emit sites in `ArenaScene.ts` already send a real `reloading: boolean` (from
  `isReloading`) — `AmmoReadout.tsx`'s local `Ammo` type just omits the field, so the component
  silently ignores it and re-derives a `clip===0 && reserve>0` heuristic instead. Fix is
  UI-only: add `reloading` to `AmmoReadout`'s `Ammo` type and use `ammo.reloading` directly. No
  change needed to `WeaponInventory` or the emit sites.
- **`CATALYSTS_DELIVERED`** → floating "+N" text burst near the tree, spawned through the new
  particle system (§7) rather than a separate HUD component.

## 7. Particle system

New `src/game/systems/ParticleFX.ts`: one `Phaser.GameObjects.Particles.ParticleEmitter` per
effect type, created once at scene `create()`, fired as one-shot `explode()` bursts (not
continuous emission). All effects reuse existing spritesheet frames per CLAUDE.md's "tints,
scales, alpha tweens, particle emitters on existing frames — no custom shaders, no new art":

- Red-tinted splatter (`FRAME.particle`) on enemy death.
- Green-tinted spore burst (`FRAME.particle`) on catalyst delivery — also the visual for the
  `CATALYSTS_DELIVERED` event from §6.
- Grey-tinted dust puff (`FRAME.particle`), no sound, on a barren-zone kill that produces no
  canister drop — makes the "why didn't that drop" moment legible per the delta spec's own framing.
- White muzzle flash (`FRAME.muzzleFlash`), spawned at the gun-tip offset on every shot fired
  from `BulletPool`'s fire calls.
- Generation sequence in `#triggerGeneration`: full-screen white-green camera flash + an
  expanding, fading ring (scaled/tweened `Graphics` circle, not a particle emitter) + a 0.5s hold
  before the draft modal fades in.

## 8. Ground tiling

`ground.png` (512x512, seamlessly tileable, per delta spec §11.4) exists on disk but is never
loaded. `ArenaScene.preload()` adds `this.load.image('ground', groundUrl)`; `create()` adds a
static `this.add.tileSprite(640, 360, 1280, 720, 'ground')` at a depth below all sprites,
replacing the current flat `setBackgroundColor` call. No scrolling — arena is static per
CLAUDE.md (no camera panning).

## 9. Music bed

SRS §7 wants a looping dark synth drone, low-pass filtered, active during combat/drafts. Extend
`SoundEffects.ts` with a looping music method: two detuned oscillators → `BiquadFilterNode`
(lowpass) → gain, started once at scene create, filter cutoff automated via the existing
pause/draft event hooks already on the bus (lower cutoff during pause/draft, higher during
combat). Matches the existing procedural, zero-asset-file approach already used for all SFX.

## 10. Test coverage gap

All bugs in §2–4 live in `ArenaScene`'s collision/kill/explosion orchestration, which has zero
test coverage — every pure `systems/*` module is well-tested, but the scene-level glue code that
actually wires kills, explosions, and pool reuse together was never exercised. No dedicated
Phaser test harness exists yet. Out of scope to build one in this pass; noted here so the
follow-up plan can decide whether to add lightweight scene-level tests (e.g. extracting
kill-counting and detonator-explosion logic into a plain function that can be unit tested without
a full Phaser scene) alongside the bug fixes in §2–3.

## 11. Cleanup

Update `CLAUDE.md`: remove the stale "pre-implementation, Phaser not yet mounted" framing, and
add a pointer to `docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md` as
co-authoritative (it wins over the SRS where they conflict) — several core mechanics
(growth ceiling, dash, barren zone, grace-as-meter) are only correctly documented there.

## Verification

- `npm run build` — type-check passes.
- Existing unit tests (`TreeSystem`, `TetherSystem`, `SpawnDirector`, `PityDropSystem`, etc.)
  still pass; add tests for the full-clip reload guard (§4) and the `>=` unlock boundary (§5)
  since both are pure-logic and already covered by existing test files for those modules.
- Manual playtest via `npm run dev`: confirm ground renders, particles fire on death/delivery/
  muzzle/generation/barren-void-kill, dash indicator shows cooldown, growth-stalled cue fires once
  per ceiling hit, weapon switch updates HUD name, reload does nothing on a full clip, detonator
  chain-kills increment the score/kill HUD, `Wider Canopy` visibly moves the barren boundary with
  the aura ring, music loop plays and audibly darkens during pause/draft.
