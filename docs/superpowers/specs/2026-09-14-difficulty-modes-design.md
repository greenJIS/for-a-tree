# Difficulty modes design

Date: 2026-09-14

## Problem

The game has one tuning: the current spawn-director config, informally "Hard". There is no
title screen — Phaser mounts and the run starts the instant the page loads. We want Easy,
Medium, and Hard, selectable before a run starts, with the current tuning preserved exactly as
Hard.

## Scope

Only the spawn director's pacing scales per mode: `baseThreat`, `threatPerSec`, and
`unlockAtSec`. Enemy stats (HP, damage, speed), tree/grace/growth numbers, weapons, and drafts
are unaffected by mode. `maxSpawnsPerSecond` (the burst cap) is also unaffected — it is a
per-second ceiling, not a pressure knob.

## Config shape

`DIRECTOR` in `src/game/config.ts` today holds two unrelated concerns: spawn pacing
(`baseThreat`, `threatPerSec`, `maxSpawnsPerSecond`, `unlockAtSec`), used only by
`SpawnDirector`, and stat ramping (`hpRampPer60s`, `dmgRampPer60s`), read directly by
`EnemyPool.spawn()` and out of scope for this feature (see Scope). Splitting `DIRECTOR` into a
mode-keyed map would break `EnemyPool`'s `DIRECTOR.hpRampPer60s`/`DIRECTOR.dmgRampPer60s` reads,
so the two concerns are separated instead: `DIRECTOR` keeps its current shape and its ramp
fields unchanged; the pacing fields move into a new `DIRECTOR_PRESETS` map.

```ts
export const DIRECTOR = {
  hpRampPer60s: 0.1,
  dmgRampPer60s: 0.06,
} as const;

export const DIRECTOR_PRESETS = {
  easy: {
    baseThreat: 1.8,
    threatPerSec: 0.1,
    maxSpawnsPerSecond: 2,
    unlockAtSec: { swarmer: 0, detonator: 75, brute: 150 },
  },
  medium: {
    baseThreat: 2.4,
    threatPerSec: 2 / 15,
    maxSpawnsPerSecond: 2,
    unlockAtSec: { swarmer: 0, detonator: 60, brute: 120 },
  },
  hard: {
    baseThreat: 3,
    threatPerSec: 1 / 6,
    maxSpawnsPerSecond: 2,
    unlockAtSec: { swarmer: 0, detonator: 45, brute: 90 },
  },
} as const;

export type DifficultyMode = keyof typeof DIRECTOR_PRESETS;
export type DirectorConfig = (typeof DIRECTOR_PRESETS)[DifficultyMode];
```

Medium and Easy are Hard scaled to 80% and 60% pressure respectively (`baseThreat` and
`threatPerSec` multiplied by the factor directly). `unlockAtSec` is scaled by the same intent —
variety should unlock proportionally later — but the results are hand-rounded to clean numbers
rather than the literal quotient: Easy's factor divides evenly (45/0.6=75, 90/0.6=150) but
Medium's does not (45/0.8=56.25, 90/0.8=112.5), so Medium's unlock times are rounded to 60/120
for a readable pacing beat instead of 56/113.

## SpawnDirector

`SpawnDirector`'s constructor gains a second, optional parameter:

```ts
constructor(rng: () => number = Math.random, config: DirectorConfig = DIRECTOR_PRESETS.hard)
```

`rng` stays the first parameter so every existing test (`new SpawnDirector(scriptedRng([...]))`)
keeps compiling and keeps testing Hard's numbers unchanged. `update()` reads `this.#config`
instead of the module-level `DIRECTOR` import it currently reads pacing fields from directly.
`EnemyPool.ts`'s existing `DIRECTOR.hpRampPer60s`/`DIRECTOR.dmgRampPer60s` reads are untouched.

## Mode selection flow

1. **New `TitleScreen` component** (`src/hud/` or a new top-level location) renders instead of
   the game. Same visual chrome as the rest of the game (sand-950 background, growth/decay
   accent colors, uppercase tracked-out labels — matching `PauseModal`/`GameOverCard`). Three
   buttons: Easy, Medium, Hard. Medium is the pre-highlighted default (a returning/new player
   lands on a balanced tuning, not the dev-tuned Hard).
2. **`App.tsx`** holds `const [mode, setMode] = useState<DifficultyMode | null>(null)`.
   `usePhaserGame(mode)` is still called unconditionally on every render (Rules of Hooks —
   it cannot be called only after a mode is picked); it no-ops internally until `mode` is
   non-null. The JSX conditionally renders either `TitleScreen` (mode is `null`) or the game
   container + `Hud` (mode is set) — the container `div` only exists in the DOM once a mode is
   picked, which is what actually gates `createGame` from running.
3. **`usePhaserGame`** takes `mode: DifficultyMode | null` and adds it to its effect's
   dependency array. The effect returns early while `mode` is `null` or the container ref isn't
   attached yet; once both are present it calls `createGame(container, mode)`, which sets
   `game.registry.set('difficulty', mode)` before the scene starts.
4. **`ArenaScene`** reads `this.game.registry.get('difficulty') as DifficultyMode` and
   constructs `new SpawnDirector(Math.random, DIRECTOR_PRESETS[mode])`, both in `create()` and in the
   existing `RESTART_SIMULATION` handler that currently does `this.#director = new
   SpawnDirector()`.
5. **Restart** (pause modal → Restart) keeps the same mode: the registry lives on the `Game`
   object, not the scene, so it survives scene restart untouched.
6. **Redeploy** (game-over card) keeps its current `window.location.reload()` — a full reload
   returns to the title screen, so mode must be re-picked. This is the desired behavior, not a
   gap.

## Testing

`SpawnDirector.test.ts` needs no changes — its calls only ever pass `rng`, so they continue
exercising `DIRECTOR_PRESETS.hard` via the new default parameter. Optionally, add one or two tests
that pass `DIRECTOR_PRESETS.easy`/`DIRECTOR_PRESETS.medium` explicitly to confirm the scaled
unlock timings, but this is not required for the feature to be correct.

No test coverage exists for `TitleScreen` or `App.tsx` today (no test runner is wired for React
components); manual verification in the browser is sufficient, matching how `PauseModal` and
`GameOverCard` were verified.
