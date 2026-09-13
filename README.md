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

Pre-implementation. The specification is complete; the engine is not yet mounted.

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

React and Phaser are fully decoupled: React never reads Phaser state directly, Phaser never
touches the DOM, and all traffic crosses the typed event bus defined in section 2.2 of the SRS.

## Getting started

```bash
npm install
npm run dev
```

## Scripts

| Command           | Purpose                                                       |
| :---------------- | :------------------------------------------------------------ |
| `npm run dev`     | Vite dev server with HMR                                      |
| `npm run build`   | Type-check (`tsc -b`) then produce a static bundle in `dist/` |
| `npm run preview` | Serve the production bundle locally                           |
| `npm run lint`    | ESLint across the project                                     |

## Layout

```text
docs/For_a_Tree_SRS.md   the specification; the source of truth for all balance
index.html               design-resolution host page
src/main.tsx             React entry point
src/App.tsx              application shell, hosts #phaser-root
src/index.css            Tailwind v4 import and @theme design tokens
src/assets/              spritesheet.png — the entire MVP art budget, one 4x4 sheet
public/favicon.svg       sprout mark
```

## Conventions

- **Styling is Tailwind utilities only.** Shared design tokens go in the `@theme` block in
  `src/index.css`, not in a `tailwind.config.ts`.
- **No `any`.** Prefer `unknown` and narrow with type guards.
- Code is formatted with Prettier (`.prettierrc.json`); Markdown must pass
  `npx markdownlint-cli2 "**/*.md"`.
