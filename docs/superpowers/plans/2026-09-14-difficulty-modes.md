# Difficulty Modes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Easy/Medium/Hard difficulty modes, selected on a new title screen before a run
starts, that scale only the spawn director's pacing (Hard is today's unchanged tuning).

**Architecture:** `DIRECTOR_PRESETS` (new export in `config.ts`) holds the three per-mode spawn
configs; `SpawnDirector` takes one as an optional constructor argument. A new `TitleScreen`
React component gates the game behind a mode pick; the picked mode flows through
`usePhaserGame` → `createGame` → `Phaser.Game`'s registry → `ArenaScene`, which reads it back out
to construct the right `SpawnDirector`.

**Tech Stack:** TypeScript, Phaser 4 (Arcade Physics scene + `game.registry`), React 19,
Tailwind v4, Vitest.

## Global Constraints

- No `any` anywhere; prefer `unknown` narrowed with type guards; avoid `as` type assertions
  (project `CLAUDE.md`).
- Tailwind utility classes only — no CSS files/modules/CSS-in-JS.
- `npm run build` (`tsc -b` + bundle) is the real type check; `npm run lint` does not
  type-check.
- Enemy stats, tree/grace/growth numbers, weapons, and drafts are unaffected by mode — only
  `DIRECTOR_PRESETS`' `baseThreat`, `threatPerSec`, and `unlockAtSec` differ per mode.
  `maxSpawnsPerSecond` stays `2` in every mode.
- Exact preset values (spec-approved):
  - `easy`: `baseThreat: 1.8, threatPerSec: 0.1, unlockAtSec: { swarmer: 0, detonator: 75, brute: 150 }`
  - `medium`: `baseThreat: 2.4, threatPerSec: 2 / 15, unlockAtSec: { swarmer: 0, detonator: 60, brute: 120 }`
  - `hard`: `baseThreat: 3, threatPerSec: 1 / 6, unlockAtSec: { swarmer: 0, detonator: 45, brute: 90 }`
- `DIRECTOR`'s existing `hpRampPer60s`/`dmgRampPer60s` fields are untouched and stay under the
  `DIRECTOR` name — `EnemyPool.ts:89-90` reads them directly and must keep compiling unchanged.
- Medium is the pre-highlighted/recommended default button on the title screen; all three modes
  are always clickable.
- Commit message format: `type(scope): short summary`, blank line, then a short body explaining
  *why* when it isn't obvious (project `CLAUDE.md`). Each task below ends with its own commit —
  that convention applies once the user has approved executing this plan.

Spec: `docs/superpowers/specs/2026-09-14-difficulty-modes-design.md`

---

### Task 1: Split `DIRECTOR` into ramp config + `DIRECTOR_PRESETS`

**Files:**
- Modify: `src/game/config.ts:113-125`

**Interfaces:**
- Consumes: nothing new.
- Produces: `DIRECTOR_PRESETS` (a `Record<'easy' | 'medium' | 'hard', {baseThreat: number,
  threatPerSec: number, maxSpawnsPerSecond: number, unlockAtSec: {swarmer: number, detonator:
  number, brute: number}}>`), `DifficultyMode` (`'easy' | 'medium' | 'hard'`), `DirectorConfig`
  (the value type of one preset), `isDifficultyMode(value: unknown): value is DifficultyMode`.
  `DIRECTOR` keeps existing name but shrinks to `{ hpRampPer60s: number, dmgRampPer60s: number
  }`.

- [ ] **Step 1: Replace the `DIRECTOR` block in `config.ts`**

Replace lines 113-125:

```ts
/** Spawn director. SRS 5.1. */
export const DIRECTOR = {
  baseThreat: 3,
  threatPerSec: 1 / 6,
  maxSpawnsPerSecond: 2,
  unlockAtSec: {
    swarmer: 0,
    detonator: 45,
    brute: 90,
  },
  hpRampPer60s: 0.1,
  dmgRampPer60s: 0.06,
} as const;
```

with:

```ts
/** Spawn director stat ramp. SRS 5.1. Shared across every difficulty mode. */
export const DIRECTOR = {
  hpRampPer60s: 0.1,
  dmgRampPer60s: 0.06,
} as const;

/** Spawn director pacing, one config per difficulty mode. SRS 5.1; mode
 * scaling is the loop-correction delta spec's difficulty-modes addendum. */
export const DIRECTOR_PRESETS = {
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
  medium: {
    baseThreat: 2.4,
    threatPerSec: 2 / 15,
    maxSpawnsPerSecond: 2,
    unlockAtSec: {
      swarmer: 0,
      detonator: 60,
      brute: 120,
    },
  },
  hard: {
    baseThreat: 3,
    threatPerSec: 1 / 6,
    maxSpawnsPerSecond: 2,
    unlockAtSec: {
      swarmer: 0,
      detonator: 45,
      brute: 90,
    },
  },
} as const;

export type DifficultyMode = keyof typeof DIRECTOR_PRESETS;
export type DirectorConfig = (typeof DIRECTOR_PRESETS)[DifficultyMode];

const DIFFICULTY_MODES: readonly DifficultyMode[] = Object.keys(
  DIRECTOR_PRESETS,
) as DifficultyMode[];

export function isDifficultyMode(value: unknown): value is DifficultyMode {
  return (
    typeof value === 'string' &&
    (DIFFICULTY_MODES as readonly string[]).includes(value)
  );
}
```

- [ ] **Step 2: Type-check the whole project**

Run: `npm run build`
Expected: FAILS, with errors only in `src/game/systems/SpawnDirector.ts` (it still reads
`DIRECTOR.baseThreat`/`threatPerSec`/`maxSpawnsPerSecond`/`unlockAtSec`, which no longer exist on
the shrunk `DIRECTOR` — Task 2 fixes this file next). Confirm there are no errors anywhere else,
particularly not in `EnemyPool.ts` — that file's `DIRECTOR.hpRampPer60s`/`DIRECTOR.dmgRampPer60s`
reads must still compile clean, since those fields didn't move.

- [ ] **Step 3: Commit**

```bash
git add src/game/config.ts
git commit -m "$(cat <<'EOF'
feat(config): split spawn director into per-mode presets

DIRECTOR's ramp fields (hpRampPer60s/dmgRampPer60s) are read directly by
EnemyPool and apply regardless of mode, so they stay put. The pacing
fields (baseThreat/threatPerSec/unlockAtSec) that actually differ by
difficulty move into a new DIRECTOR_PRESETS map, one config per mode.
EOF
)"
```

---

### Task 2: `SpawnDirector` takes a per-mode config

**Files:**
- Modify: `src/game/systems/SpawnDirector.ts`
- Modify: `src/game/systems/SpawnDirector.test.ts`

**Interfaces:**
- Consumes: `DIRECTOR_PRESETS`, `DirectorConfig` from `../config` (Task 1).
- Produces: `SpawnDirector`'s constructor signature becomes
  `constructor(rng: () => number = Math.random, config: DirectorConfig = DIRECTOR_PRESETS.hard)`.
  All existing public methods (`update(dtSec, aliveThreat): MutantKind[]`,
  `static threatOf(kind): number`) keep their exact signatures.

- [ ] **Step 1: Write the failing tests for Easy's later unlock timing**

Add to the end of `src/game/systems/SpawnDirector.test.ts` (after the existing last test, before
the closing `});` of the `describe` block):

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
    const hard = new SpawnDirector(
      scriptedRng(new Array(20).fill(0)),
      DIRECTOR_PRESETS.hard,
    );
    const easy = new SpawnDirector(
      scriptedRng(new Array(20).fill(0)),
      DIRECTOR_PRESETS.easy,
    );
    for (let t = 0; t < 60; t += 1) {
      hard.update(1, 100);
      easy.update(1, 100);
    }
    expect(hard.update(0, 10).length).toBeGreaterThan(0);
    expect(easy.update(0, 10).length).toBe(0);
  });
```

Add the import at the top of the file:

```ts
import { DIRECTOR_PRESETS } from '../config';
```

- [ ] **Step 2: Run the tests to verify the new ones fail**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts`
Expected: MOST tests FAIL at this point, not just the three new ones — and that's expected, not
a mistake. `SpawnDirector.ts` still reads `DIRECTOR.baseThreat`/`threatPerSec`/
`maxSpawnsPerSecond`/`unlockAtSec` directly (Step 3 fixes this), but Task 1 already removed those
fields from `DIRECTOR`. Vitest transpiles with esbuild and does not type-check, so this doesn't
error — every one of those reads silently evaluates to `undefined`, `targetThreat` becomes `NaN`,
and `aliveThreat < NaN` is always `false`, so `update()` returns `[]` unconditionally regardless
of input. Concretely: tests asserting an empty/bounded result (e.g. "spawns nothing when alive
threat already meets target", "never spawns more than 2 per second") still pass, since `[]`
trivially satisfies them, but every test asserting an actual spawn happens (e.g. "spawns Swarmers
to close the gap", "unlocks the Bio-Detonator at 45 seconds") now fails. Step 3's fix is what
brings the whole suite back to green — don't stop to investigate these failures as a bug.

- [ ] **Step 3: Update `SpawnDirector.ts` to consume a config**

Replace the import and field/constructor block:

```ts
import { DIRECTOR_PRESETS, type DirectorConfig } from '../config';
```

```ts
export class SpawnDirector {
  readonly #rng: () => number;
  readonly #config: DirectorConfig;
  #elapsedSec = 0;
  #currentSecond = 0;
  #spawnedThisSecond = 0;

  constructor(
    rng: () => number = Math.random,
    config: DirectorConfig = DIRECTOR_PRESETS.hard,
  ) {
    this.#rng = rng;
    this.#config = config;
  }
```

Replace the body of `update()`'s `targetThreat` line and the spawn-cap check:

```ts
    const targetThreat =
      this.#config.baseThreat + elapsedBeforeUpdate * this.#config.threatPerSec;
    const unlocked = this.#unlockedKinds();

    const spawned: MutantKind[] = [];
    let projectedThreat = aliveThreat;

    while (
      projectedThreat < targetThreat &&
      this.#spawnedThisSecond + spawned.length < this.#config.maxSpawnsPerSecond
    ) {
```

Replace `#unlockedKinds()`:

```ts
  #unlockedKinds(): MutantKind[] {
    return UNLOCK_ORDER.filter(
      (kind) => this.#elapsedSec >= this.#config.unlockAtSec[kind],
    );
  }
```

- [ ] **Step 4: Run the tests to verify everything passes**

Run: `npx vitest run src/game/systems/SpawnDirector.test.ts`
Expected: all tests PASS, including the three new ones and every pre-existing one (which never
pass a `config` argument, so they keep exercising `DIRECTOR_PRESETS.hard` via the default
parameter).

- [ ] **Step 5: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/game/systems/SpawnDirector.ts src/game/systems/SpawnDirector.test.ts
git commit -m "$(cat <<'EOF'
feat(spawn): let SpawnDirector take a per-mode pacing config

Constructor gains an optional second parameter (default
DIRECTOR_PRESETS.hard), so existing callers and tests that only pass an
rng are unaffected. update() now reads pacing from the instance's config
instead of the DIRECTOR module constant.
EOF
)"
```

---

### Task 3: `TitleScreen` component

**Files:**
- Create: `src/hud/TitleScreen.tsx`

**Interfaces:**
- Consumes: `DifficultyMode` from `../game/config` (Task 1).
- Produces: `TitleScreen({ onSelect }: { onSelect: (mode: DifficultyMode) => void }): JSX.Element`
  — a default export is NOT used; it's a named export, matching every other file in `src/hud/`.

- [ ] **Step 1: Create the component**

```tsx
/** Difficulty-select screen shown before a run starts. Fills the game's
 * aspect-video frame the same way Hud's modals do, but has no game to lay
 * over yet -- it renders in place of the Phaser canvas + Hud, not on top of
 * them. SRS 2.1. */
import type { DifficultyMode } from '../game/config';

const MODE_ORDER: readonly DifficultyMode[] = ['easy', 'medium', 'hard'];

const MODE_COPY: Record<DifficultyMode, { label: string; body: string }> = {
  easy: {
    label: 'Easy',
    body: 'Lighter mutant pressure. Learn the loop.',
  },
  medium: {
    label: 'Medium',
    body: 'Balanced pressure. Recommended.',
  },
  hard: {
    label: 'Hard',
    body: 'Full mutant pressure from the start.',
  },
};

type Props = {
  onSelect: (mode: DifficultyMode) => void;
};

export function TitleScreen({ onSelect }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-10 bg-sand-950">
      <h1 className="text-3xl font-bold tracking-[0.3em] text-growth uppercase">
        For a Tree
      </h1>
      <div className="flex gap-4">
        {MODE_ORDER.map((mode) => {
          const isRecommended = mode === 'medium';
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className={
                isRecommended
                  ? 'flex w-40 cursor-pointer flex-col items-center gap-2 border border-growth bg-growth/10 px-6 py-4 text-center text-xs font-semibold tracking-widest text-growth uppercase transition-colors hover:bg-growth hover:text-sand-950'
                  : 'flex w-40 cursor-pointer flex-col items-center gap-2 border border-sand-700 bg-sand-950/60 px-6 py-4 text-center text-xs font-semibold tracking-widest text-white/70 uppercase transition-colors hover:border-growth hover:bg-growth/10 hover:text-growth'
              }
            >
              <span>{MODE_COPY[mode].label}</span>
              <span className="text-[10px] font-normal normal-case tracking-normal text-white/50">
                {MODE_COPY[mode].body}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds. (`TitleScreen` isn't imported anywhere yet, so this only proves the file
itself is well-typed — Task 5 wires it in and is where it's actually exercised in the browser.)

- [ ] **Step 3: Commit**

```bash
git add src/hud/TitleScreen.tsx
git commit -m "feat(hud): add TitleScreen difficulty-select component"
```

---

### Task 4: `createGame` and `usePhaserGame` take a mode

**Files:**
- Modify: `src/game/createGame.ts`
- Modify: `src/game/usePhaserGame.ts`

**Interfaces:**
- Consumes: `DifficultyMode` from `./config` (Task 1).
- Produces: `createGame(parent: HTMLElement, mode: DifficultyMode): Phaser.Game` (was
  `createGame(parent: HTMLElement): Phaser.Game`); `usePhaserGame(mode: DifficultyMode | null):
  React.RefObject<HTMLDivElement | null>` (was `usePhaserGame(): React.RefObject<...>`).

- [ ] **Step 1: Update `createGame.ts`**

Replace the full file:

```ts
/**
 * Phaser.Game construction. Fixed 1280x720 with Scale.FIT and CENTER_BOTH,
 * so the arena letterboxes intact. SRS 2.3 and 8.
 */
import Phaser from 'phaser';
import { ARENA, type DifficultyMode } from './config';
import { ArenaScene } from './scenes/ArenaScene';

export function createGame(
  parent: HTMLElement,
  mode: DifficultyMode,
): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA.width,
    height: ARENA.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [ArenaScene],
  });
  game.registry.set('difficulty', mode);
  return game;
}
```

- [ ] **Step 2: Update `usePhaserGame.ts`**

Replace the full file:

```ts
/**
 * Mounts Phaser into a div once a difficulty mode is chosen, and destroys
 * it on unmount. Waits on `mode` rather than being called conditionally --
 * Rules of Hooks forbid calling a hook only after a mode is picked, so this
 * hook is always called and no-ops internally until `mode` is non-null.
 *
 * React StrictMode double-invokes effects in development, so the ref guard
 * is load-bearing — without it two Phaser.Game instances are created.
 */
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from './createGame';
import type { DifficultyMode } from './config';

export function usePhaserGame(
  mode: DifficultyMode | null,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mode === null || gameRef.current) return;

    gameRef.current = createGame(container, mode);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [mode]);

  return containerRef;
}
```

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: fails at `src/App.tsx`, the only remaining caller of `usePhaserGame()` with no
argument — that's expected here and gets fixed in Task 5. Confirm the only error is in
`App.tsx` (a "expected 1 argument, got 0" or similar), not in `createGame.ts` or
`usePhaserGame.ts` themselves.

- [ ] **Step 4: Commit**

```bash
git add src/game/createGame.ts src/game/usePhaserGame.ts
git commit -m "$(cat <<'EOF'
feat(game): thread difficulty mode through createGame/usePhaserGame

usePhaserGame now takes mode: DifficultyMode | null and waits for a
non-null mode before mounting Phaser, instead of mounting unconditionally
on first render. createGame stamps the chosen mode onto game.registry
before the scene starts. App.tsx (next commit) is the only caller and
currently fails to build against this new signature until it's updated.
EOF
)"
```

---

### Task 5: Wire `TitleScreen` into `App.tsx`

**Files:**
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `TitleScreen` (Task 3), `usePhaserGame(mode)` (Task 4), `DifficultyMode` (Task 1).
- Produces: nothing further downstream — this is the top of the tree.

- [ ] **Step 1: Update `App.tsx`**

Replace the full file:

```tsx
/**
 * Application shell.
 *
 * React owns the page chrome, HUD and modal layers; Phaser owns the
 * simulation and mounts into #phaser-root. The two communicate only through
 * the typed event bus. SRS 2.1.
 */
import { useState } from 'react';
import { usePhaserGame } from './game/usePhaserGame';
import type { DifficultyMode } from './game/config';
import { Hud } from './hud/Hud';
import { TitleScreen } from './hud/TitleScreen';

function App() {
  const [mode, setMode] = useState<DifficultyMode | null>(null);
  const containerRef = usePhaserGame(mode);

  return (
    <main className="flex h-full w-full items-center justify-center bg-sand-950">
      <div
        className="relative aspect-video w-full max-w-[1280px] overflow-hidden
          border border-sand-800 bg-sand-900 shadow-2xl shadow-black/60"
      >
        {mode === null ? (
          <TitleScreen onSelect={setMode} />
        ) : (
          <>
            <div
              id="phaser-root"
              ref={containerRef}
              className="absolute inset-0 z-10"
            />
            <Hud />
          </>
        )}
      </div>
    </main>
  );
}

export default App;
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual verification — title screen renders and gates the game**

Run: `npm run dev`, open the printed local URL in a browser.

Confirm:
- The page shows "For a Tree" and three buttons (Easy, Medium, Hard) — no Phaser canvas, no HUD.
- Medium's button is visually distinct (growth-colored border/fill) from Easy and Hard.
- Clicking any button replaces the title screen with the running game (canvas + HUD visible,
  player controllable).

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
feat(app): gate the game behind a difficulty title screen

The game no longer auto-starts on page load. App now renders TitleScreen
until a mode is picked, then mounts Phaser + the HUD.
EOF
)"
```

---

### Task 6: `ArenaScene` builds its `SpawnDirector` from the chosen mode

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DIRECTOR_PRESETS`, `DifficultyMode`, `isDifficultyMode` from `../config` (Task 1);
  `SpawnDirector`'s new `(rng, config)` constructor (Task 2); `this.game.registry` (set by
  `createGame`, Task 4).
- Produces: nothing further downstream — this is the last task.

- [ ] **Step 1: Add the import and a private mode-reader method**

In the import block near the top of `src/game/scenes/ArenaScene.ts` (currently importing
`AEGIS, ARENA, AURA_RADIUS_BASE, ...` from `'../config'`), add `DIRECTOR_PRESETS` and
`isDifficultyMode` to that same import list, and add `type DifficultyMode` as a separate
type-only import line:

```ts
import {
  AEGIS,
  ARENA,
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  CARBINE,
  CATALYST_VALUE,
  DETONATOR,
  DIRECTOR_PRESETS,
  GROWTH_CEILING,
  isDifficultyMode,
  MELEE_COOLDOWN_MS,
  MUZZLE_OFFSET,
  PLAYER,
  RAIL,
  SCATTER,
  TICK_INTERVAL_MS,
  TREE_POS,
  UPGRADE_EFFECTS,
} from '../config';
import type { DifficultyMode } from '../config';
```

Add this private method to the class, near the other small private helpers (e.g. right after
the `#auraRadius` getter):

```ts
  #difficultyMode(): DifficultyMode {
    const value: unknown = this.game.registry.get('difficulty');
    return isDifficultyMode(value) ? value : 'hard';
  }
```

- [ ] **Step 2: Use it when constructing `SpawnDirector` in `create()`**

Replace the line `this.#director = new SpawnDirector();` inside `create()` with:

```ts
    this.#director = new SpawnDirector(
      Math.random,
      DIRECTOR_PRESETS[this.#difficultyMode()],
    );
```

(Leave the class field initializer `#director = new SpawnDirector();` near the top of the class
as-is — it runs once at scene construction, before `create()` ever runs, and `create()`
immediately overwrites it on every scene start including the first, so its default value is
never actually used.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification — mode affects pacing, Hard is unchanged**

Run: `npm run dev`, open the browser.

- Pick **Hard**. Play for ~50 seconds. Confirm mutants appear immediately and Bio-Detonators
  (the shambling enemy that telegraphs an explosion) appear by 45s — same as before this
  feature existed.
- Reload, pick **Easy**. Play for ~50 seconds. Confirm noticeably fewer enemies on screen at any
  given time than Hard, and no Bio-Detonator yet (it unlocks at 75s on Easy).
- Reload, pick **Medium**, restart mid-run via the pause menu's Restart button. Confirm the game
  restarts still on Medium's pacing (not reset to Hard) — e.g. Bio-Detonators still unlock
  around 60s post-restart's elapsed time, not 45s.

- [ ] **Step 5: Run the full test suite one more time**

Run: `npx vitest run`
Expected: all tests PASS (this repo-wide run catches any other file that imported the old flat
`DIRECTOR` shape and wasn't caught by `npm run build`'s type errors, since Vitest also exercises
runtime behavior, not just types).

- [ ] **Step 6: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(arena): build SpawnDirector from the selected difficulty mode

ArenaScene now reads the mode createGame stamped onto game.registry and
looks up the matching DIRECTOR_PRESETS entry, both on initial create()
and on scene restart. Falls back to 'hard' if the registry value is
somehow missing or malformed, so the game never crashes on a bad read.
EOF
)"
```
