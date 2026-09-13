# Visual Polish — Design

## Context

The polish pass (`docs/superpowers/specs/2026-09-13-polish-pass-design.md`) landed particles,
ground tiling, and the HUD dead-event wiring. Playtesting the built version surfaced a set of
visual issues that pass didn't catch: the muzzle flash and other particle effects render far
larger than intended, the muzzle flash and bullets don't originate from (or track) the gun
muzzle, the HUD panels are flat/borderless, the bottom-left action indicators are incomplete,
and the ground tile's contrast makes enemies hard to spot. This spec covers all of it as one
pass since the fixes touch the same small set of files (`ParticleFX.ts`, `ArenaScene.ts`,
`src/hud/*`).

## 1. Bug — particle effects render far too large

`ParticleFX.ts` sizes every emitter's `scale.start` (0.4–0.6) as if `FRAME.particle` and
`FRAME.muzzleFlash` were small sprites, but both are native 512×512px cells in the spritesheet.
At scale 0.6 the muzzle flash renders at ~307px — roughly 7.5x the player's 40px display size —
large enough to visually cover a 36px enemy for its entire on-screen lifetime near the player,
which is also the likely explanation for "I never see enemies even though I'm scoring kills."

**Fix:** rescale every emitter in `ParticleFX.ts` so rendered size is proportionate to the
sprites it appears alongside (starting points, tuned in playtest):

| Emitter    | Current `scale.start` | New `scale.start` (~px at 512 frame) |
| ---------- | ---------------------- | ------------------------------------- |
| splatter   | 0.5                     | ~0.06 (~30px)                         |
| spore      | 0.6                     | ~0.07 (~36px)                         |
| dust       | 0.4                     | ~0.05 (~26px)                         |
| muzzle     | 0.6                     | ~0.08 (~41px)                         |

`scale.end` stays `0` in all four (shrink-to-nothing is the correct animation, only the start
size is wrong).

## 2. Bug — muzzle flash doesn't rotate to face aim direction

`FRAME.muzzleFlash` is a directional burst asset (a cone shape pointing right, i.e. drawn at
0°), not a radially-symmetric flash. `ParticleFX.muzzleFlash()` already offsets the emit
*position* by the player's aim rotation (`x + cos(rotation) * offset`, same for y), but the
emitter config never sets a `rotate` (or `angle`) value, so the sprite itself always renders at
its native 0° orientation regardless of where the player is aiming. Combined with bug #1's
oversized scale, this reads as "the flash just sits on the player and doesn't turn."

**Fix:** Phaser 4's `ParticleEmitter.explode(count?, x?, y?)` takes no rotation argument — `rotate`
is an emitter-config field, not an emit-time override — so `ParticleFX.muzzleFlash(x, y, rotation)`
must call `this.#muzzle.setConfig({ rotate: Phaser.Math.RadToDeg(rotation) })` immediately before
`this.#muzzle.explode(1, ...)` on every call, so each burst picks up the current aim angle. No
change to the offset math, which is already correct.

## 3. Bug — bullets spawn from player center, not the gun muzzle

`BulletPool.fireCarbine/fireScatter/fireRail` all take the raw `x, y` passed in, and
`ArenaScene`'s fire handler passes `this.#player.x, this.#player.y` (dead center) for both the
muzzle flash and every bullet call. The muzzle flash already computes a 24px offset internally;
bullets get none, so they visually originate from the player's center while the flash (once
fixed by #1/#2) sits further out at the muzzle.

**Fix:** compute one shared gun-tip point per shot in `ArenaScene`'s fire handler — the same
24px-along-`rotation` offset `ParticleFX.muzzleFlash` already uses — and pass that offset
`x, y` to `fireCarbine`/`fireScatter`/`fireRail` instead of the raw player position. Scatter's
pellet spread continues to fan out around this same offset origin (only the spread math's
center point moves, not the angles). `ParticleFX.muzzleFlash` keeps computing its own offset
internally (no API change needed there) since it already matches this value.

## 4. HUD — organic-glass panel treatment

Every HUD component currently renders as bare text/bars with no background chrome (`HealthBar`,
`MaturityGauge`, `TetherBeacon`, `CarriedCatalystPips`, `WaveLabel`, `ScoreReadout`,
`AegisBadge`, `DashIndicator`, `AmmoReadout`) — confirmed flat across all of them, not just the
screenshot's framing.

**Fix:** add a shared `HudPanel` wrapper component (`src/hud/HudPanel.tsx`) implementing the
"organic glass" style validated in the visual companion: translucent dark background
(`rgba` over `--color-sand-900`), `backdrop-blur`, rounded corners, and a soft glowing green
border (`--color-growth`) echoing the aura ring's woven-vine look already in the game. Each of
the 9 components above wraps its existing content in `<HudPanel>` — no prop/behavior changes,
purely a rendering wrapper. `Hud.tsx`'s positions (`top-4 left-4`, the top-center stack, etc.)
are unchanged; only the per-component chrome changes.

## 5. HUD — complete and reorganize the bottom-left action stack

Currently only Aegis (`[Space]`) and Dash (`[Shift]`) show key indicators; Reload (`[R]`),
weapon-select (`[1] [2] [3]`), Move (`[WASD]`), Aim/Fire (`[Mouse]`), and Pause (`[Esc]/[P]`)
have no on-screen indicator at all.

**Fix:** all seven live in the bottom-left stack, split by whether their state changes at
runtime:

- **Live-state panels** (own `HudPanel`, existing pattern): Dash, Aegis (already built), plus a
  new **Reload** indicator — shows `[R] Reload` normally, and a "reloading" state while
  `WeaponInventory.isReloading` is true for the active weapon (mirrors `AmmoReadout`'s existing
  `reloading` field, no new event needed).
- **Static reference row** (one `HudPanel`, single compact line, never changes): weapon-select
  `[1-3]`, Move `[WASD]`, Fire `[Mouse]`, Pause `[Esc/P]` (`ArenaScene` binds both `ESC` and `P`
  to pause — the label must show both, not just `Esc`) — these never have cooldown/charge state,
  so they collapse into one row instead of four separate panels.

New `src/hud/ReloadIndicator.tsx` (subscribes to `AMMO_UPDATED` for the active weapon's
`reloading` flag) and `src/hud/ControlsReference.tsx` (static JSX, no subscriptions). Both mount
in `Hud.tsx`'s existing bottom-left `<div>` alongside `AegisBadge` and `DashIndicator`.

## 6. Ground contrast

The ground `tileSprite` (`ArenaScene.ts` `create()`) renders at full brightness/saturation,
competing with player/enemy/bullet sprites for visual attention and contributing to the
"can't spot enemies" problem alongside bug #1.

**Fix:** two changes to the same `tileSprite`, combined per validated mockup:

- `setTint()` with a darker, desaturated tone (pulling the orange down in both brightness and
  saturation — exact hex tuned in-editor against the live tile, target roughly 65-75% of
  current brightness).
- A radial vignette: `Graphics.fillGradientStyle` only does 4-corner linear gradients, not
  radial, so generate a static radial-gradient `CanvasTexture` once in `create()` (black center
  alpha 0 fading to black alpha ~0.6 at the arena's far corners, sized `ARENA.width` x
  `ARENA.height`) and place it as one `Image` at arena center — cheaper than concentric
  `fillCircle` calls since the gradient is drawn once, not redrawn per frame. No `setDepth()`
  call needed: `ArenaScene` doesn't assign explicit depths to the ground, player, enemies, or
  bullets (all default to depth 0, ordered by insertion), so adding the vignette `Image`
  immediately after the ground `tileSprite` in `create()` — before every other `add.*` call —
  places it correctly above ground and below all gameplay sprites through insertion order alone,
  consistent with the rest of the scene.

## Verification

- `npm run build` — type-check passes.
- Manual playtest via `npm run dev`:
  - Fire each of the 3 weapons while rotating the player; confirm the muzzle flash tracks aim
    direction and bullets visibly originate from the gun tip, not player center.
  - Confirm muzzle flash, death splatter, spore burst, and dust puff are all sized proportionate
    to the player/enemy sprites (no longer dominate the screen).
  - Confirm enemies are visible on screen during normal play (not just inferred from score/HP
    changes).
  - Confirm every HUD element (health, maturity, tether, pips, wave, score, aegis, dash, reload,
    controls reference, ammo) renders inside the organic-glass panel style.
  - Confirm bottom-left stack shows: Dash, Aegis, Reload as individual live panels, plus one
    static reference row for weapon-select/move/fire/pause.
  - Confirm ground reads darker/less saturated with a visible center-to-edge vignette, and
    sprites are easier to distinguish against it than before.
