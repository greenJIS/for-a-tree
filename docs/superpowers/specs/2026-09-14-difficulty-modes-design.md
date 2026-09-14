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

`DIRECTOR` in `src/game/config.ts` becomes a map of three presets instead of one flat object:

```ts
export const DIRECTOR = {
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

export type DifficultyMode = keyof typeof DIRECTOR;
```

Medium and Easy are Hard scaled to 80% and 60% pressure respectively (`baseThreat` and
`threatPerSec` multiplied; `unlockAtSec` divided by the same factor so variety unlocks land at
proportionally later times, then rounded to the nearest second).

## SpawnDirector

`SpawnDirector`'s constructor gains a second, optional parameter:

```ts
constructor(rng: () => number = Math.random, config: DirectorConfig = DIRECTOR.hard)
```

`rng` stays the first parameter so every existing test (`new SpawnDirector(scriptedRng([...]))`)
keeps compiling and keeps testing Hard's numbers unchanged. `update()` reads `this.#config`
instead of the module-level `DIRECTOR` constant it currently imports directly.

## Mode selection flow

1. **New `TitleScreen` component** (`src/hud/` or a new top-level location) renders instead of
   the game. Same visual chrome as the rest of the game (sand-950 background, growth/decay
   accent colors, uppercase tracked-out labels — matching `PauseModal`/`GameOverCard`). Three
   buttons: Easy, Medium, Hard. Medium is the pre-highlighted default (a returning/new player
   lands on a balanced tuning, not the dev-tuned Hard).
2. **`App.tsx`** holds `const [mode, setMode] = useState<DifficultyMode | null>(null)`. While
   `mode` is `null`, render only `TitleScreen`. Once a mode is picked, mount
   `usePhaserGame(mode)` and `Hud` as today.
3. **`usePhaserGame`** takes the mode and passes it to `createGame(container, mode)`.
   `createGame` sets `game.registry.set('difficulty', mode)` before the scene starts.
4. **`ArenaScene`** reads `this.game.registry.get('difficulty') as DifficultyMode` and
   constructs `new SpawnDirector(Math.random, DIRECTOR[mode])`, both in `create()` and in the
   existing `RESTART_SIMULATION` handler that currently does `this.#director = new
   SpawnDirector()`.
5. **Restart** (pause modal → Restart) keeps the same mode: the registry lives on the `Game`
   object, not the scene, so it survives scene restart untouched.
6. **Redeploy** (game-over card) keeps its current `window.location.reload()` — a full reload
   returns to the title screen, so mode must be re-picked. This is the desired behavior, not a
   gap.

## Testing

`SpawnDirector.test.ts` needs no changes — its calls only ever pass `rng`, so they continue
exercising `DIRECTOR.hard` via the new default parameter. Optionally, add one or two tests that
pass `DIRECTOR.easy`/`DIRECTOR.medium` explicitly to confirm the scaled unlock timings, but this
is not required for the feature to be correct.

No test coverage exists for `TitleScreen` or `App.tsx` today (no test runner is wired for React
components); manual verification in the browser is sufficient, matching how `PauseModal` and
`GameOverCard` were verified.
