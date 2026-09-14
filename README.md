# For a Tree

A top-down sci-fi survival action game about keeping one sapling alive on a dead world.

The alien fauna aggro **only onto you** — they never touch the tree and the tree cannot be
destroyed. The threat to the tree is your absence: the sapling metabolises only inside its own
bio-aura, and the catalysts that feed it only grow where the monsters are.

```text
IN AURA    maturity grows + ammunition reserves regenerate
           ...but the swarm converges on you, because you are the target

OUTSIDE    maturity DECAYS and no resupply occurs
           ...but catalysts and safe kiting space exist only out there

THE LOOP   sortie -> kill -> collect catalyst -> sprint home -> deliver
           -> reach 100% maturity -> Generation -> Aegis charge + upgrade draft
```

The run is endless. You are scored in **Generations**: how many times the tree reached full
maturity before you fell.

## Status

Playable. The core loop — player, tree/maturity, tether/grace, three weapons, three mutant
types, the spawn director, draft upgrades, HUD, pause/restart, and procedural audio — is
implemented and wired through the event bus. Ongoing work is a polish pass; see
`docs/superpowers/specs/2026-09-13-polish-pass-design.md` and the other dated specs in
`docs/superpowers/specs/` for the current punch list.

New to the game? Start with [WALKTHROUGH.md](WALKTHROUGH.md).

The full design — balance numbers, formulas, entity stats, and the implementation roadmap —
lives in [docs/For_a_Tree_SRS.md](docs/For_a_Tree_SRS.md).

## Stack

| Layer      | Choice                                   |
| :--------- | :--------------------------------------- |
| Build      | Vite 8                                   |
| Simulation | Phaser 4 (Arcade Physics, WebGL)         |
| Interface  | React 19 + Tailwind CSS v4               |
| Language   | TypeScript 6, `strict: true`, zero `any` |
| Bridge     | `mitt` typed event bus                   |
| Tests      | Vitest                                   |

React and Phaser are fully decoupled: React never reads Phaser state directly, Phaser never
touches the DOM, and all traffic crosses the typed event bus defined in section 2.2 of the SRS.

## Getting started

```bash
npm install
npm run dev
```

Pick a difficulty on the title screen (Easy / Medium / Hard) and the run begins.

## Scripts

| Command              | Purpose                                                       |
| :------------------- | :------------------------------------------------------------ |
| `npm run dev`        | Vite dev server with HMR                                      |
| `npm run build`      | Type-check (`tsc -b`) then produce a static bundle in `dist/` |
| `npm run preview`    | Serve the production bundle locally                           |
| `npm run lint`       | ESLint across the project                                     |
| `npm run test`       | Run the Vitest suite once                                     |
| `npm run test:watch` | Vitest in watch mode                                          |

## Layout

```text
docs/For_a_Tree_SRS.md          specification; source of truth for all balance
docs/superpowers/specs/         delta/design specs that win where they disagree with the SRS
index.html                      design-resolution host page
src/main.tsx                    React entry point
src/App.tsx                     application shell, hosts #phaser-root, holds difficulty state
src/game/config.ts               every balance constant, sourced from the SRS + delta specs
src/game/createGame.ts          Phaser game factory
src/game/usePhaserGame.ts       React hook that mounts/tears down the Phaser game
src/game/eventBus.ts            typed mitt event bus, the only React <-> Phaser bridge
src/game/scenes/ArenaScene.ts   the single Phaser scene: simulation, physics, spawning
src/game/entities/              pooled bullets, enemies, canisters, and the player
src/game/systems/               tree growth, tether/grace, ammo, carry, score, upgrades, etc.
src/game/audio/                 procedural sound effects
src/hud/                        React HUD, modals (draft/pause/game-over), title screen
src/index.css                   Tailwind v4 import and @theme design tokens
src/assets/                     spritesheet.png — the entire MVP art budget, one 4x4 sheet
public/favicon.svg              sprout mark
```

## Conventions

- **Styling is Tailwind utilities only.** Shared design tokens go in the `@theme` block in
  `src/index.css`, not in a `tailwind.config.ts`.
- **No `any`.** Prefer `unknown` and narrow with type guards.
- **Pooling is a requirement, not an optimisation.** Bullets, enemies, canisters, and particles
  are pooled; no allocation inside `update` at 60 enemies / 200 projectiles.
- Code is formatted with Prettier (`.prettierrc.json`); Markdown must pass
  `npx markdownlint-cli2 "**/*.md"`.
