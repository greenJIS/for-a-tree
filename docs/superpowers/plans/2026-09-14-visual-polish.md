# Visual Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix oversized/non-rotating particle effects and off-center bullet spawn, wrap the HUD
in a consistent "organic glass" panel style, complete the bottom-left action-key indicators, and
darken/vignette the ground tile for sprite contrast.

**Architecture:** Six small, independent-ish changes against the existing Phaser scene
(`ArenaScene.ts`, `ParticleFX.ts`) and React HUD (`src/hud/*`), following the spec at
`docs/superpowers/specs/2026-09-14-visual-polish-design.md`. No new systems, no new event-bus
messages, no new dependencies — pure changes to rendering/visuals on top of already-wired game
state.

**Tech Stack:** Phaser 4 (Arcade Physics, `GameObjects.Particles`, `Textures.CanvasTexture`),
React 19 + Tailwind v4, TypeScript strict.

## Global Constraints

- No `any` anywhere; `strict: true`. Prefer `unknown` + narrowing over `as` (per
  `CLAUDE.md`).
- Tailwind utility classes only — no new CSS files, modules, or CSS-in-JS. Any new shared token
  goes in the `@theme` block in `src/index.css` if reused across components (not needed for this
  plan — every color used already exists as a theme token: `--color-growth`, `--color-tether`,
  `--color-grace`, `--color-sand-900`, `--color-sand-950`, `--color-decay`).
- No new art, no shaders — every visual change is a tint, scale, particle-emitter tweak, or CSS
  panel treatment on existing assets/frames, per `CLAUDE.md`'s art constraint.
- React never reads Phaser state directly; all cross-boundary data still flows through the
  existing typed `mitt` event bus (`src/game/eventBus.ts`) — this plan adds zero new bus events,
  it only adds two new *consumers* of the existing `AMMO_UPDATED` event.
- This codebase has no test coverage for Phaser scene glue code or React HUD components (see
  `docs/superpowers/specs/2026-09-13-polish-pass-design.md` §10 — noted and accepted as an
  existing gap, not something this plan fixes). Every task below is verified with `npm run
  build` (the real type-check, per `CLAUDE.md`'s Commands table) plus a manual playtest step via
  `npm run dev` — there is no unit-testable logic introduced by this plan (no new pure functions,
  no changes to any `systems/*.ts` module).

---

### Task 1: Add the shared `MUZZLE_OFFSET` constant

**Files:**
- Modify: `src/game/config.ts`

**Interfaces:**
- Produces: `export const MUZZLE_OFFSET = 24;` — a plain number (px), consumed by Task 2
  (`ParticleFX.muzzleFlash`) and Task 3 (`ArenaScene`'s fire handler) so both compute the exact
  same gun-tip distance from a single source of truth.

- [ ] **Step 1: Add the constant**

Open `src/game/config.ts`. Find the existing `export const BARREN_MARGIN = 120;` (around line
21). Add the new constant directly after it:

```ts
export const BARREN_MARGIN = 120;

/** Distance from player center to the gun muzzle, used for bullet spawn and muzzle-flash
 * placement so both originate from the same point. */
export const MUZZLE_OFFSET = 24;
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors (this is an additive, unused-so-far export — `tsc` won't
complain about an unused top-level export).

- [ ] **Step 3: Commit**

```bash
git add src/game/config.ts
git commit -m "$(cat <<'EOF'
chore(game): add shared MUZZLE_OFFSET constant

Single source of truth for the gun-tip distance so the muzzle flash and
bullet spawn point (next tasks) stay in sync instead of duplicating the
same magic number in two files.
EOF
)"
```

---

### Task 2: Fix particle scale and add muzzle-flash rotation

**Files:**
- Modify: `src/game/systems/ParticleFX.ts`

**Interfaces:**
- Consumes: `MUZZLE_OFFSET` from `../config` (Task 1).
- Produces: `ParticleFX.muzzleFlash(x, y, rotation)` — same signature as before, now also
  rotates the flash sprite to match `rotation`. No other public method signature changes
  (`splatter`, `sporeBurst`, `dustPuff` keep their existing signatures — only their internal
  `scale.start` values change).

- [ ] **Step 1: Update imports and rescale the four emitters**

Open `src/game/systems/ParticleFX.ts`. Two of the four emitters currently share the identical
line `scale: { start: 0.6, end: 0 },` (spore and muzzle) — find/replacing that line alone is
ambiguous, so replace the whole constructor body instead, which is unique in the file.

Replace the imports:

```ts
import Phaser from 'phaser';
import { FRAME } from '../frames';
```

with:

```ts
import Phaser from 'phaser';
import { MUZZLE_OFFSET } from '../config';
import { FRAME } from '../frames';
```

Then replace the entire `constructor(scene: Phaser.Scene) { ... }` body:

```ts
  constructor(scene: Phaser.Scene) {
    this.#splatter = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 300,
        speed: { min: 60, max: 160 },
        scale: { start: 0.5, end: 0 },
        quantity: 10,
        tint: 0xdc2626,
        emitting: false,
      })
      .setDepth(20);

    this.#spore = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 500,
        speed: { min: 40, max: 120 },
        scale: { start: 0.6, end: 0 },
        quantity: 12,
        tint: 0x3ddc84,
        emitting: false,
      })
      .setDepth(20);

    this.#dust = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 400,
        speed: { min: 20, max: 60 },
        scale: { start: 0.4, end: 0 },
        alpha: { start: 0.5, end: 0 },
        quantity: 6,
        tint: 0x6b7280,
        emitting: false,
      })
      .setDepth(20);

    this.#muzzle = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.muzzleFlash,
        lifespan: 80,
        speed: 0,
        scale: { start: 0.6, end: 0 },
        quantity: 1,
        tint: 0xffffff,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(20);
  }
```

with:

```ts
  constructor(scene: Phaser.Scene) {
    this.#splatter = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 300,
        speed: { min: 60, max: 160 },
        scale: { start: 0.06, end: 0 },
        quantity: 10,
        tint: 0xdc2626,
        emitting: false,
      })
      .setDepth(20);

    this.#spore = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 500,
        speed: { min: 40, max: 120 },
        scale: { start: 0.07, end: 0 },
        quantity: 12,
        tint: 0x3ddc84,
        emitting: false,
      })
      .setDepth(20);

    this.#dust = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 400,
        speed: { min: 20, max: 60 },
        scale: { start: 0.05, end: 0 },
        alpha: { start: 0.5, end: 0 },
        quantity: 6,
        tint: 0x6b7280,
        emitting: false,
      })
      .setDepth(20);

    this.#muzzle = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.muzzleFlash,
        lifespan: 80,
        speed: 0,
        scale: { start: 0.08, end: 0 },
        quantity: 1,
        tint: 0xffffff,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(20);
  }
```

Summary of the scale change, per emitter (all previously sized as if `FRAME.particle`/
`FRAME.muzzleFlash` were small sprites, not native 512×512 spritesheet cells):

| Emitter  | Old `scale.start` | New `scale.start` (~px at 512 frame) |
| -------- | ------------------ | -------------------------------------- |
| splatter | 0.5                 | 0.06 (~30px)                           |
| spore    | 0.6                 | 0.07 (~36px)                           |
| dust     | 0.4                 | 0.05 (~26px)                           |
| muzzle   | 0.6                 | 0.08 (~41px)                           |

- [ ] **Step 2: Rotate the muzzle flash to match aim, using the shared offset**

Replace the `muzzleFlash` method:

```ts
/** White muzzle flash at the gun tip, offset from the player along their aim. */
muzzleFlash(x: number, y: number, rotation: number): void {
  const offset = 24;
  this.#muzzle.explode(
    1,
    x + Math.cos(rotation) * offset,
    y + Math.sin(rotation) * offset,
  );
}
```

with:

```ts
/** White muzzle flash at the gun tip, offset from the player along their aim. */
muzzleFlash(x: number, y: number, rotation: number): void {
  this.#muzzle.setConfig({ rotate: Phaser.Math.RadToDeg(rotation) });
  this.#muzzle.explode(
    1,
    x + Math.cos(rotation) * MUZZLE_OFFSET,
    y + Math.sin(rotation) * MUZZLE_OFFSET,
  );
}
```

(`ParticleEmitter.explode(count?, x?, y?)` has no rotation argument in Phaser 4 — `rotate` must
be set on the emitter's config via `setConfig()` before the burst fires, so each call picks up
the current aim angle.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the printed local URL.
- Fire the carbine while standing still, aiming in at least 3 different directions (e.g. right,
  up, down-left). Confirm the white flash burst visibly points along the aim direction each
  time, not always the same way.
- Confirm the flash, and (after killing an enemy or delivering a catalyst) the red splatter and
  green spore burst, are all small — roughly enemy-sized (~30-40px), not covering a large area
  of the screen.

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/ParticleFX.ts
git commit -m "$(cat <<'EOF'
fix(fx): rescale particle bursts and rotate muzzle flash to aim

Every emitter sized scale.start as if FRAME.particle/FRAME.muzzleFlash
were small sprites, but both are native 512x512 spritesheet cells --
the muzzle flash alone rendered at ~300px, large enough to cover a
36px enemy for its entire on-screen lifetime. Also wires up rotation:
the flash asset is a directional cone, not a radial burst, but the
emitter never set `rotate`, so it always rendered pointing the same
way regardless of aim.
EOF
)"
```

---

### Task 3: Spawn bullets from the gun tip, not player center

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:6-22` (import), `src/game/scenes/ArenaScene.ts:715-753`
  (fire handler)

**Interfaces:**
- Consumes: `MUZZLE_OFFSET` from `../config` (Task 1); `BulletPool.fireCarbine(x, y, rotation,
  damageMult)`, `fireScatter(x, y, rotation, damageMult)`, `fireRail(x, y, rotation, damageMult)`
  (unchanged signatures, already defined in `src/game/entities/BulletPool.ts`).
- Produces: no new interface — this only changes what values `ArenaScene` passes into the
  existing `BulletPool` and `ParticleFX.muzzleFlash` calls.

- [ ] **Step 1: Import the shared constant**

Open `src/game/scenes/ArenaScene.ts`. In the existing multi-line import from `'../config'`
(lines 6-22), add `MUZZLE_OFFSET` to the alphabetically-sorted list:

```ts
import {
  AEGIS,
  ARENA,
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  CARBINE,
  CATALYST_VALUE,
  DETONATOR,
  GROWTH_CEILING,
  MELEE_COOLDOWN_MS,
  MUZZLE_OFFSET,
  PLAYER,
  RAIL,
  SCATTER,
  TICK_INTERVAL_MS,
  TREE_POS,
  UPGRADE_EFFECTS,
} from '../config';
```

- [ ] **Step 2: Compute the gun-tip point once per shot and use it for every bullet call**

Find the fire-input block (around line 715-753):

```ts
    const pointer = this.input.activePointer;
    if (
      pointer.leftButtonDown() &&
      this.time.now >= this.#nextShotAtMs &&
      this.#weapons.tryFire()
    ) {
      const activeId = this.#weapons.activeWeaponId;
      this.#nextShotAtMs = this.time.now + 1000 / WEAPON_FIRE_RATES[activeId];
      this.#particles.muzzleFlash(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
      if (activeId === 'carbine') {
        this.#bullets.fireCarbine(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.carbine();
      } else if (activeId === 'scatter') {
        this.#bullets.fireScatter(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.scatter();
      } else if (activeId === 'rail') {
        this.#bullets.fireRail(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.rail();
      }
    }
```

Replace it with:

```ts
    const pointer = this.input.activePointer;
    if (
      pointer.leftButtonDown() &&
      this.time.now >= this.#nextShotAtMs &&
      this.#weapons.tryFire()
    ) {
      const activeId = this.#weapons.activeWeaponId;
      this.#nextShotAtMs = this.time.now + 1000 / WEAPON_FIRE_RATES[activeId];
      const rotation = this.#player.sprite.rotation;
      const muzzleX = this.#player.x + Math.cos(rotation) * MUZZLE_OFFSET;
      const muzzleY = this.#player.y + Math.sin(rotation) * MUZZLE_OFFSET;
      this.#particles.muzzleFlash(this.#player.x, this.#player.y, rotation);
      if (activeId === 'carbine') {
        this.#bullets.fireCarbine(
          muzzleX,
          muzzleY,
          rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.carbine();
      } else if (activeId === 'scatter') {
        this.#bullets.fireScatter(
          muzzleX,
          muzzleY,
          rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.scatter();
      } else if (activeId === 'rail') {
        this.#bullets.fireRail(
          muzzleX,
          muzzleY,
          rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.rail();
      }
    }
```

(`ParticleFX.muzzleFlash` still receives the raw player position, not `muzzleX`/`muzzleY` — it
computes its own identical offset internally using the same `MUZZLE_OFFSET` constant, per Task
2. Passing the already-offset point here would double-offset the flash.)

- [ ] **Step 3: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification**

Run: `npm run dev`.
- Fire the carbine while rotating the player in a full circle (mouse aim). Confirm bullets
  visibly leave from a point offset from the player's center, in the direction the player is
  facing, matching where the muzzle flash appears.
- Switch to Scatter (`2`) and Rail (`3`), confirm the same for each.

- [ ] **Step 5: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
fix(weapons): spawn bullets from the gun tip, not player center

BulletPool.fireCarbine/fireScatter/fireRail all received the raw
player position with no offset, while the muzzle flash already offset
by MUZZLE_OFFSET -- bullets visibly originated from a different point
than the flash. Both now share the same computed muzzle point.
EOF
)"
```

---

### Task 4: Ground contrast — tint and vignette

**Files:**
- Modify: `src/game/scenes/ArenaScene.ts:224-230` (ground tile creation, inside `create()`)

**Interfaces:**
- Produces: no new public interface — purely visual additions inside `create()`. Uses
  `this.textures.createCanvas` (Phaser's `TextureManager` API) and `ARENA.width`/`ARENA.height`
  (already imported).

- [ ] **Step 1: Tint the ground tile and add a radial vignette above it**

Open `src/game/scenes/ArenaScene.ts`. Find the ground tile creation inside `create()`:

```ts
    this.add.tileSprite(
      ARENA.width / 2,
      ARENA.height / 2,
      ARENA.width,
      ARENA.height,
      'ground',
    );
```

Replace it with:

```ts
    this.add
      .tileSprite(ARENA.width / 2, ARENA.height / 2, ARENA.width, ARENA.height, 'ground')
      .setTint(0xb0a68f);

    if (!this.textures.exists('ground-vignette')) {
      const vignetteTexture = this.textures.createCanvas(
        'ground-vignette',
        ARENA.width,
        ARENA.height,
      );
      if (vignetteTexture) {
        const ctx = vignetteTexture.context;
        const radius = Math.hypot(ARENA.width / 2, ARENA.height / 2);
        const gradient = ctx.createRadialGradient(
          ARENA.width / 2,
          ARENA.height / 2,
          0,
          ARENA.width / 2,
          ARENA.height / 2,
          radius,
        );
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.6)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, ARENA.width, ARENA.height);
        vignetteTexture.refresh();
      }
    }
    this.add.image(ARENA.width / 2, ARENA.height / 2, 'ground-vignette');
```

This must stay immediately after the ground tile and before the `#barrenSprite`/player/entity
creation later in `create()` — `ArenaScene` never calls `setDepth()` on the ground, player,
enemies, or bullets (all default to depth 0, ordered by insertion into the display list), so the
vignette image's position in `create()` — right after the ground, before everything else — is
what places it above the ground and below every gameplay sprite. Moving this block later in
`create()` would put the vignette on top of the player/enemies instead.

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`.
- Confirm the ground reads darker and less orange/saturated than before.
- Confirm the arena edges are visibly darker than the center (vignette), and that the player,
  tree, aura ring, and any enemies still render on top of both the ground and the vignette (not
  hidden behind them).

- [ ] **Step 4: Commit**

```bash
git add src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
fix(fx): darken and vignette the ground tile

Ground rendered at full brightness/saturation, competing with player/
enemy/bullet sprites for attention and making enemies hard to spot
against the busy cracked-earth texture.
EOF
)"
```

---

### Task 5: Create the shared `HudPanel` wrapper

**Files:**
- Create: `src/hud/HudPanel.tsx`

**Interfaces:**
- Produces:
  - `export type HudPanelTone = 'neutral' | 'growth' | 'tether' | 'grace' | 'idle';`
  - `export function HudPanel(props: { tone?: HudPanelTone; className?: string; children: ReactNode }): JSX.Element`
    — `tone` defaults to `'neutral'`. Every later HUD task (6-11) wraps its component's return
    value in this.

- [ ] **Step 1: Write the component**

Create `src/hud/HudPanel.tsx`:

```tsx
/**
 * Shared "organic glass" HUD chrome: translucent dark panel, backdrop blur,
 * rounded corners, soft green glow border -- echoes the aura ring's woven-
 * vine look. `tone` swaps the border/glow/background color for components
 * with live state (ready/active/idle) without duplicating the frame classes
 * in every component.
 */
import type { ReactNode } from 'react';

export type HudPanelTone = 'neutral' | 'growth' | 'tether' | 'grace' | 'idle';

const TONE_STYLE: Record<HudPanelTone, string> = {
  neutral: 'border-growth/40 shadow-[0_0_10px_rgba(61,220,132,0.15)]',
  growth: 'border-growth/70 shadow-[0_0_14px_rgba(61,220,132,0.3)]',
  tether: 'border-tether/60 bg-tether/10 shadow-[0_0_14px_rgba(34,211,238,0.3)]',
  grace: 'border-grace/60 bg-grace/10 shadow-[0_0_14px_rgba(251,191,36,0.3)]',
  idle: 'border-sand-800 bg-sand-950/60 shadow-none',
};

export function HudPanel({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: HudPanelTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-sand-900/45 px-3 py-1.5 backdrop-blur-sm transition-colors ${TONE_STYLE[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors (component isn't used anywhere yet, so no visual change).

- [ ] **Step 3: Commit**

```bash
git add src/hud/HudPanel.tsx
git commit -m "$(cat <<'EOF'
feat(hud): add shared HudPanel organic-glass wrapper

Every HUD component currently renders bare text/bars with no
background chrome. HudPanel centralizes the validated "organic glass"
treatment (dark translucent bg, blur, rounded corners, green vine-glow
border) with a `tone` prop so components with live state (ready/
active/idle) can recolor the glow without duplicating frame classes.
EOF
)"
```

---

### Task 6: Wrap the stateless HUD components in `HudPanel`

**Files:**
- Modify: `src/hud/HealthBar.tsx`, `src/hud/MaturityGauge.tsx`, `src/hud/TetherBeacon.tsx`,
  `src/hud/CarriedCatalystPips.tsx`, `src/hud/WaveLabel.tsx`, `src/hud/ScoreReadout.tsx`,
  `src/hud/AmmoReadout.tsx`

**Interfaces:**
- Consumes: `HudPanel` from `./HudPanel` (Task 5), default `tone="neutral"` (all seven of these
  components have no live ready/active/idle state worth recoloring the border for — the
  existing colored *text* inside each, e.g. `text-tether`/`text-grace`/`text-decay`, is
  untouched).
- Produces: no interface change — same exported component names, same props (all are already
  zero-prop), same event subscriptions.

For each file below, the change is the same shape: import `HudPanel`, replace the outermost
`<div className="...">...</div>` with `<HudPanel className="...">...</HudPanel>` using the same
className string, and add `HudPanel` (and any type it needs) to the imports.

- [ ] **Step 1: `src/hud/HealthBar.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className="flex w-56 flex-col gap-1">
      <div className="h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className="h-full bg-decay transition-[width] duration-150"
          style={{ width: `${(hp.current / hp.max) * 100}%` }}
        />
      </div>
      <span className="text-xs tracking-widest text-white/70 uppercase">
        HP {Math.round(hp.current)} / {hp.max}
      </span>
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className="flex w-56 flex-col gap-1">
      <div className="h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className="h-full bg-decay transition-[width] duration-150"
          style={{ width: `${(hp.current / hp.max) * 100}%` }}
        />
      </div>
      <span className="text-xs tracking-widest text-white/70 uppercase">
        HP {Math.round(hp.current)} / {hp.max}
      </span>
    </HudPanel>
  );
```

- [ ] **Step 2: `src/hud/MaturityGauge.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace the outer `<div className="flex w-80 flex-col gap-1">` / closing `</div>` (the whole
return block) so it reads:

```tsx
  return (
    <HudPanel className="flex w-80 flex-col gap-1">
      <div className="flex justify-between text-xs tracking-widest uppercase">
        <span className="text-white/70">Maturity</span>
        <span className="text-growth">Gen {generation}</span>
      </div>

      <div
        className={`relative h-3 w-full overflow-hidden rounded-sm bg-black/60 ${
          justStalled ? 'animate-pulse' : ''
        }`}
      >
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${
            stalled ? 'bg-grace' : 'bg-growth'
          }`}
          style={{ width: `${Math.min(100, maturityPct)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80"
          style={{ left: `${ceilingPct}%` }}
        />
      </div>

      <div className="text-center text-[10px] tracking-widest uppercase">
        {stalled ? (
          <span className="text-grace">Catalyst required</span>
        ) : (
          <span className="text-white/50">+{ratePerSec.toFixed(2)} %/s</span>
        )}
      </div>
    </HudPanel>
  );
```

(Only the outermost element changed from `div` to `HudPanel` — every inner element is
byte-for-byte identical to the current file.)

- [ ] **Step 3: `src/hud/TetherBeacon.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className={`text-xs tracking-widest uppercase ${STYLE[state]}`}>
      {LABEL[state]}
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className={`text-xs tracking-widest uppercase ${STYLE[state]}`}>
      {LABEL[state]}
    </HudPanel>
  );
```

- [ ] **Step 4: `src/hud/CarriedCatalystPips.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className="flex gap-1">
      {Array.from({ length: cap }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < tiers.length ? TIER_COLOR[tiers[i]] : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className="flex gap-1">
      {Array.from({ length: cap }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < tiers.length ? TIER_COLOR[tiers[i]] : 'bg-white/20'
          }`}
        />
      ))}
    </HudPanel>
  );
```

- [ ] **Step 5: `src/hud/WaveLabel.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className="text-xs tracking-[0.25em] text-white/70 uppercase">
      WAVE {wave}
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className="text-xs tracking-[0.25em] text-white/70 uppercase">
      WAVE {wave}
    </HudPanel>
  );
```

- [ ] **Step 6: `src/hud/ScoreReadout.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-xs tracking-widest text-white/50 uppercase">
        HI: {highScore}
      </span>
      <span className="text-sm tracking-widest text-growth uppercase">
        SCORE: {score}
      </span>
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-xs tracking-widest text-white/50 uppercase">
        HI: {highScore}
      </span>
      <span className="text-sm tracking-widest text-growth uppercase">
        SCORE: {score}
      </span>
    </HudPanel>
  );
```

- [ ] **Step 7: `src/hud/AmmoReadout.tsx`**

Add the import:

```ts
import { HudPanel } from './HudPanel';
```

Replace:

```tsx
  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {ammo.reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </div>
  );
```

with:

```tsx
  return (
    <HudPanel className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {ammo.reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </HudPanel>
  );
```

- [ ] **Step 8: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 9: Manual verification**

Run: `npm run dev`.
- Confirm all seven elements (HP top-left, maturity/tether/pips/wave top-center, score
  top-right, ammo bottom-right) now render inside a rounded, translucent, green-glow-bordered
  panel instead of bare text/bars.
- Confirm their screen positions haven't moved (still top-left, top-center stack, top-right,
  bottom-right — unchanged from before this task).

- [ ] **Step 10: Commit**

```bash
git add src/hud/HealthBar.tsx src/hud/MaturityGauge.tsx src/hud/TetherBeacon.tsx \
  src/hud/CarriedCatalystPips.tsx src/hud/WaveLabel.tsx src/hud/ScoreReadout.tsx \
  src/hud/AmmoReadout.tsx
git commit -m "$(cat <<'EOF'
feat(hud): wrap stateless HUD elements in HudPanel

Health, maturity, tether, catalyst pips, wave, score, and ammo all
rendered as bare text/bars. Wraps each in the shared organic-glass
panel at the default neutral tone -- positions and inner content are
unchanged, only the chrome around them.
EOF
)"
```

---

### Task 7: Recolor `AegisBadge` with `HudPanel` tone

**Files:**
- Modify: `src/hud/AegisBadge.tsx`

**Interfaces:**
- Consumes: `HudPanel`, `HudPanelTone` from `./HudPanel` (Task 5).
- Produces: no interface change — same export, same subscription to `AEGIS_STATUS`.

- [ ] **Step 1: Replace the component body**

Open `src/hud/AegisBadge.tsx`. Only the import list and the final `return` change — the
`useState`/`useEffect` block and `isActive`/`isCharged`/`seconds`/`text` computations are
unchanged. Simplest to apply correctly: replace the entire file with the following (shown in
full so nothing is ambiguous about what stays the same):

```tsx
/** Aegis Pulse Battery status badge. SRS 6.1, bottom-left. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import { HudPanel, type HudPanelTone } from './HudPanel';

type AegisPayload = {
  charges: number;
  capacity: number;
  activeRemainingMs: number;
};

export function AegisBadge() {
  const [status, setStatus] = useState<AegisPayload>({
    charges: 0,
    capacity: 1,
    activeRemainingMs: 0,
  });

  useEffect(() => {
    const onStatus = (e: AegisPayload) => setStatus(e);
    bus.on('AEGIS_STATUS', onStatus);
    return () => bus.off('AEGIS_STATUS', onStatus);
  }, []);

  const isActive = status.activeRemainingMs > 0;
  const isCharged = status.charges > 0;

  const seconds = Math.ceil(status.activeRemainingMs / 1000);

  const text = isActive
    ? `[SPACE] AEGIS ${seconds}s`
    : isCharged
      ? `[SPACE] AEGIS x${status.charges}`
      : '[SPACE] AEGIS OFFLINE';

  const tone: HudPanelTone = isActive || isCharged ? 'tether' : 'idle';
  const textStyle = isActive
    ? 'text-tether font-semibold'
    : isCharged
      ? 'text-tether animate-pulse'
      : 'text-white/40';

  return (
    <HudPanel
      tone={tone}
      className={`text-xs tracking-widest uppercase ${textStyle}`}
    >
      {text}
    </HudPanel>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`.
- Confirm the Aegis badge shows the idle/grey-bordered panel when offline, and switches to the
  cyan-glow `tether` tone once charged (kill enemies until a charge is granted) and while active
  (press Space with a charge available).

- [ ] **Step 4: Commit**

```bash
git add src/hud/AegisBadge.tsx
git commit -m "$(cat <<'EOF'
feat(hud): move AegisBadge onto the shared HudPanel

Preserves the existing offline/charged/active text-color states,
moving the border/background chrome onto HudPanel's tone prop instead
of a locally duplicated border/bg class string.
EOF
)"
```

---

### Task 8: Recolor `DashIndicator` with `HudPanel` tone

**Files:**
- Modify: `src/hud/DashIndicator.tsx`

**Interfaces:**
- Consumes: `HudPanel` from `./HudPanel` (Task 5).
- Produces: no interface change — same export, same subscription to `DASH_STATUS`.

- [ ] **Step 1: Replace the component body**

Open `src/hud/DashIndicator.tsx`. Only the import list and the final `return` change — the
`useState`/`useEffect` block is unchanged. Simplest to apply correctly: replace the entire file
with the following (shown in full so nothing is ambiguous about what stays the same):

```tsx
/** Dash cooldown indicator. Delta spec 7.2, bottom-left beside Aegis. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { GameEvents } from '../game/eventBus';
import { HudPanel } from './HudPanel';

type DashPayload = GameEvents['DASH_STATUS'];

export function DashIndicator() {
  const [ready, setReady] = useState(true);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const onStatus = (e: DashPayload) => {
      setReady(e.ready);
      if (!e.ready) {
        setCooldownMs(e.cooldownRemainingMs);
        setPulseKey((k) => k + 1);
      }
    };
    bus.on('DASH_STATUS', onStatus);
    return () => bus.off('DASH_STATUS', onStatus);
  }, []);

  return (
    <HudPanel
      tone={ready ? 'growth' : 'idle'}
      className={`relative overflow-hidden text-xs tracking-widest uppercase ${
        ready ? 'text-growth' : 'text-white/40'
      }`}
    >
      {!ready && (
        <div
          key={pulseKey}
          className="absolute inset-0 origin-left bg-white/10"
          style={{ animation: `dash-cooldown ${cooldownMs}ms linear forwards` }}
        />
      )}
      <span className="relative">
        {ready ? '[SHIFT] DASH READY' : '[SHIFT] DASH'}
      </span>
    </HudPanel>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`.
- Confirm the Dash panel shows the bright `growth`-tone glow when ready, switches to the dim
  `idle` tone with the cooldown sweep animation while on cooldown, and the sweep still visually
  clips to the panel's rounded corners (not spilling outside them).

- [ ] **Step 4: Commit**

```bash
git add src/hud/DashIndicator.tsx
git commit -m "$(cat <<'EOF'
feat(hud): move DashIndicator onto the shared HudPanel

Preserves the existing ready/cooling text-color and cooldown-sweep
animation, moving the border/background chrome onto HudPanel's tone
prop.
EOF
)"
```

---

### Task 9: Add `ReloadIndicator`

**Files:**
- Create: `src/hud/ReloadIndicator.tsx`

**Interfaces:**
- Consumes: `HudPanel` from `./HudPanel` (Task 5); `bus`, `GameEvents` from `../game/eventBus`
  (existing `AMMO_UPDATED` event, `{ weaponId: string; clip: number; clipMax: number; reserve:
  number; reloading: boolean }` — no new event, no changes to `WeaponInventory` or `ArenaScene`'s
  existing `AMMO_UPDATED` emit sites).
- Produces: `export function ReloadIndicator(): JSX.Element`, mounted in `Hud.tsx` by Task 11.

- [ ] **Step 1: Write the component**

Create `src/hud/ReloadIndicator.tsx`:

```tsx
/** Reload key indicator, bottom-left beside Aegis/Dash. Mirrors AmmoReadout's
 * existing `reloading` field off AMMO_UPDATED -- no new event needed. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { GameEvents } from '../game/eventBus';
import { HudPanel } from './HudPanel';

type AmmoPayload = GameEvents['AMMO_UPDATED'];

export function ReloadIndicator() {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onUpdate = (e: AmmoPayload) => setReloading(e.reloading);
    bus.on('AMMO_UPDATED', onUpdate);
    return () => bus.off('AMMO_UPDATED', onUpdate);
  }, []);

  return (
    <HudPanel
      tone={reloading ? 'grace' : 'neutral'}
      className={`text-xs tracking-widest uppercase ${
        reloading ? 'text-grace animate-pulse' : 'text-white/40'
      }`}
    >
      {reloading ? '[R] RELOADING' : '[R] RELOAD'}
    </HudPanel>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors (component created but not mounted yet, so no visual change
until Task 11).

- [ ] **Step 3: Commit**

```bash
git add src/hud/ReloadIndicator.tsx
git commit -m "$(cat <<'EOF'
feat(hud): add ReloadIndicator

Reload had no on-screen key indicator despite Aegis and Dash both
having one. Reuses AMMO_UPDATED's existing reloading field -- no new
event or WeaponInventory change needed.
EOF
)"
```

---

### Task 10: Add `ControlsReference`

**Files:**
- Create: `src/hud/ControlsReference.tsx`

**Interfaces:**
- Consumes: `HudPanel` from `./HudPanel` (Task 5).
- Produces: `export function ControlsReference(): JSX.Element`, mounted in `Hud.tsx` by Task 11.
  Static — no event-bus subscriptions, no props, no state.

- [ ] **Step 1: Write the component**

Create `src/hud/ControlsReference.tsx`:

```tsx
/** Static reference row for controls that never have cooldown/charge state
 * (unlike Aegis/Dash/Reload, which get their own live-state HudPanel).
 * Bottom-left, below the live-state panels. */
import { HudPanel } from './HudPanel';

export function ControlsReference() {
  return (
    <HudPanel className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tracking-widest text-white/50 uppercase">
      <span>[1-3] Weapon</span>
      <span>[WASD] Move</span>
      <span>[Mouse] Fire</span>
      <span>[Esc/P] Pause</span>
    </HudPanel>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/hud/ControlsReference.tsx
git commit -m "$(cat <<'EOF'
feat(hud): add ControlsReference static row

Weapon-select, move, fire, and pause had no on-screen indicator at
all. These never change state (unlike Aegis/Dash/Reload), so they
collapse into one compact static row instead of four separate panels.
EOF
)"
```

---

### Task 11: Wire `ReloadIndicator` and `ControlsReference` into the HUD

**Files:**
- Modify: `src/hud/Hud.tsx`

**Interfaces:**
- Consumes: `ReloadIndicator` from `./ReloadIndicator` (Task 9), `ControlsReference` from
  `./ControlsReference` (Task 10).
- Produces: no new interface — this is the final integration point; after this task the whole
  spec's HUD scope is live.

- [ ] **Step 1: Add the imports and mount both components**

Open `src/hud/Hud.tsx`. Add two imports, alongside the existing ones:

```tsx
import { AegisBadge } from './AegisBadge';
import { AmmoReadout } from './AmmoReadout';
import { CarriedCatalystPips } from './CarriedCatalystPips';
import { ControlsReference } from './ControlsReference';
import { DashIndicator } from './DashIndicator';
import { DecayVignette } from './DecayVignette';
import { DraftModal } from './DraftModal';
import { GameOverCard } from './GameOverCard';
import { HealthBar } from './HealthBar';
import { MaturityGauge } from './MaturityGauge';
import { PauseModal } from './PauseModal';
import { ReloadIndicator } from './ReloadIndicator';
import { ScoreReadout } from './ScoreReadout';
import { TetherBeacon } from './TetherBeacon';
import { WaveLabel } from './WaveLabel';
```

Replace the bottom-left `<div>`:

```tsx
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <AegisBadge />
        <DashIndicator />
      </div>
```

with:

```tsx
      <div className="absolute bottom-4 left-4 flex flex-col gap-2">
        <AegisBadge />
        <DashIndicator />
        <ReloadIndicator />
        <ControlsReference />
      </div>
```

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: succeeds with no errors.

- [ ] **Step 3: Full manual verification pass**

Run: `npm run dev` and play for a couple of minutes, confirming every item from the spec's
Verification section:

- Fire each of the 3 weapons while rotating the player: muzzle flash tracks aim direction,
  bullets visibly originate from the gun tip, not player center.
- Muzzle flash, death splatter, spore burst, and dust puff are all sized proportionate to the
  player/enemy sprites.
- Enemies are visible on screen during normal play, not just inferred from score/HP changes.
- Every HUD element (health, maturity, tether, pips, wave, score, aegis, dash, reload, controls
  reference, ammo) renders inside the organic-glass panel style.
- Bottom-left stack shows, top to bottom: Dash, Aegis, Reload as individual live panels, then one
  static reference row for weapon-select/move/fire/pause.
- Ground reads darker/less saturated with a visible center-to-edge vignette, and sprites are
  easier to distinguish against it than before.

- [ ] **Step 4: Commit**

```bash
git add src/hud/Hud.tsx
git commit -m "$(cat <<'EOF'
feat(hud): mount ReloadIndicator and ControlsReference

Completes the bottom-left action stack -- Dash, Aegis, and Reload as
individual live-state panels, plus one static reference row for
weapon-select/move/fire/pause. Closes out the visual-polish spec's HUD
scope.
EOF
)"
```
