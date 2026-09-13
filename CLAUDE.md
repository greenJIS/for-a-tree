# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"For a Tree" — a top-down sci-fi survival action game for desktop browsers. Hackathon scope:
solo developer, 36 hours, art already complete.

**The repository is pre-implementation.** The specification is finished and the shell builds;
the Phaser engine is not yet mounted. `src/App.tsx` renders a placeholder over an empty
`#phaser-root`.

## The SRS is the source of truth

`docs/For_a_Tree_SRS.md` (v2.0) is authoritative for every number, formula, entity stat, event
name, and scope decision. Read the relevant section before implementing a system, and do not
invent balance values — if a value is missing, it is a spec gap worth raising, not a judgement
call to make silently.

Section 11 is a change log from v1.2 explaining _why_ eighteen earlier decisions were reversed.
Consult it before "restoring" something that looks missing: Bio-Scrap, the Arc Welder, the
Bio-Acid Sprayer, the Sand Stalker, enemies that attack the tree, and the wave state machine
were all deliberately cut, and section 10 lists them as deleted rather than deferred.

## Commands

| Command                           | Purpose                                                        |
| :-------------------------------- | :------------------------------------------------------------- |
| `npm run dev`                     | Vite dev server with HMR                                       |
| `npm run build`                   | `tsc -b` then a static bundle in `dist/` — the real type check |
| `npm run preview`                 | Serve the production bundle                                    |
| `npm run lint`                    | ESLint across the project                                      |
| `npx prettier --write .`          | Format; config in `.prettierrc.json`, no hook is wired         |
| `npx markdownlint-cli2 "**/*.md"` | Lint Markdown; config in `.markdownlint-cli2.jsonc`            |

There is no test runner yet. Vitest is the intended choice when one is added.

`npm run lint` does not type-check — use `npm run build` for that.

## Architecture

The design splits along one hard boundary, and most mistakes in this codebase will be boundary
violations.

- **Phaser 4** owns the simulation: rendering, Arcade Physics, pursuit vectors, object pools,
  particles, audio. It mounts into `#phaser-root` and is the single source of truth for game
  state.
- **React 19 + Tailwind v4** owns every pixel of interface as DOM layered over the canvas — the
  HUD (`z-20`, `pointer-events: none`), the Phaser canvas (`z-10`), and the modal layer
  (`z-30`, `pointer-events: auto`).

Rules that follow from that split:

- React never reads Phaser state directly; Phaser never touches the DOM.
- All traffic crosses a typed `mitt` event bus (`src/game/eventBus.ts`, defined in SRS 2.2).
  React holds a mirror of game state for rendering only.
- High-frequency events (`TREE_GROWTH_TICK`, `DIFFICULTY_TICK`, `SCORE_UPDATED`) are emitted at
  **10 Hz**, not per frame. Everything else is edge-triggered — emitted only on actual change.
- The arena is a fixed 1280x720 design resolution with `Scale.FIT` + `CENTER_BOTH`. No camera
  panning. Do not introduce responsive game-space layout.

### The core loop, and why systems are shaped the way they are

Enemies aggro only onto the player and cannot damage the tree. The tree's stake is the player's
_absence_: maturity grows while the player is inside the 220 px aura and decays outside it.

Every economy is deliberately tuned to pull the player back toward the tree — ammunition
reserves regenerate only while tethered, catalysts must be carried home and delivered inside the
aura, and upgrade drafts fire on Generation (100% maturity) rather than on a wave counter. If a
change makes it viable to ignore the tree, it has broken the game, regardless of what the
numbers say locally.

There is no wave state machine. A spawn director maintains continuous threat-budget pressure
scaled to elapsed time (SRS 5.1); the HUD "Wave" number is cosmetic and drives nothing.

## Conventions

- **Tailwind utilities only.** No CSS files, modules, or CSS-in-JS. Shared tokens go in the
  `@theme` block in `src/index.css` (tether/grace/decay/growth colours are referenced by both
  the React HUD and the Phaser aura tint, so they belong there).
- **No `any`.** `strict: true`; prefer `unknown` and narrow with type guards. Avoid `as`.
- **Pooling is a requirement, not an optimisation.** Bullets, enemies, canisters, and particles
  are pooled; target zero allocation inside `update` at 60 enemies and 200 projectiles.
- All MVP art is one 4x4 spritesheet at `src/assets/spritesheet.png` (SRS 6.3). Effects are
  tints, scales, alpha tweens, and particle emitters on existing frames — no custom shaders, no
  new art.

## Commit conventions

`type(scope): short summary`, blank line, then a short body explaining _why_ when it is not
obvious. Types: `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `ci`, `build`, `perf`,
`style`, `revert`. Commit only when explicitly asked. Commitlint and Husky are not yet installed.
