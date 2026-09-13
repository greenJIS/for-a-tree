# Software Requirements Specification (SRS)

## Project: For a Tree

**Document Version:** 2.0
**Supersedes:** v1.2
**Target Delivery:** Hackathon MVP, solo developer, 36 hours
**Target Platform:** Web — modern desktop browsers (Chrome, Firefox, Edge, Safari)
**Tech Stack:** Vite 8, React 19, TypeScript 6, Tailwind CSS v4, Phaser 4
**Status:** Approved for implementation

---

## Table of Contents

1. [Product Vision](#1-product-vision)
2. [Architecture](#2-architecture)
3. [Core Mechanics](#3-core-mechanics)
4. [Entities and Balance](#4-entities-and-balance)
5. [Progression](#5-progression)
6. [Interface and Visual Design](#6-interface-and-visual-design)
7. [Audio](#7-audio)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Implementation Roadmap](#9-implementation-roadmap)
10. [Out of Scope](#10-out-of-scope)
11. [Appendix A — Changes from v1.2](#11-appendix-a--changes-from-v12)

---

## 1. Product Vision

"For a Tree" is a top-down, single-screen sci-fi survival action game set in a desiccated
post-ecological alien desert. The player is an armed bio-guardian assigned to raise a sacred
terraforming sapling.

The indigenous fauna aggro **exclusively onto the player** — they never attack the tree and the
tree cannot be destroyed. The threat to the tree is the player's own absence. The sapling only
metabolises inside its own bio-aura, and it is fed by catalysts that grow only where the
monsters are.

This produces the central tension:

```text
IN AURA    maturity grows + ammunition reserves regenerate
           ...but the swarm converges on you, because you are the target

OUTSIDE    maturity DECAYS and no resupply occurs
           ...but catalysts and safe kiting space exist only out there

THE LOOP   sortie -> kill -> collect catalyst -> sprint home -> deliver
           -> reach 100% maturity -> Generation -> Aegis charge + upgrade draft
           -> the swarm scales up -> repeat
```

Every system in this document is designed to pull the player back toward the tree. A player who
abandons the tree to survive safely watches their progress drain away; a player who never leaves
runs out of catalysts and stalls. The game is the negotiation between those two failures.

The run is endless. Success is measured in **Generations**: the number of times the tree reached
full maturity before the guardian fell.

### 1.1 Design Pillars

1. **The tether is the game.** Every currency, cooldown, and reward is gated on proximity.
2. **One clock.** Tree maturity drives upgrades, Aegis charges, and the sense of progress.
   Elapsed time drives difficulty. Nothing else keeps score.
3. **No dead ends.** The player can always recover: ammunition regenerates, maturity floors at
   zero, and Generations already earned can never be lost.
4. **Readable in ten seconds.** A judge who has never seen the game should understand the aura
   ring, the decay vignette, and the maturity gauge without being told.

---

## 2. Architecture

### 2.1 Hybrid Runtime (React 19 + Phaser 4)

Simulation and interface are fully decoupled.

- **Phaser 4** owns the real-time loop inside a single React-mounted container
  (`<div id="phaser-root" />`): WebGL rendering, Arcade Physics, projectile pooling, pursuit
  vectors, particle emission, and audio playback.
- **React 19 + Tailwind v4** owns every pixel of interface as DOM layered over the canvas: the
  HUD, the draft modal, the pause overlay, and the game-over scorecard.

React never reads Phaser state directly and Phaser never touches the DOM. All traffic crosses a
typed event bus (`mitt`).

```text
+--------------------------------------------------------------------------+
|                          Vite + React 19 host                            |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  | HUD layer            z-20   pointer-events: none                   |  |
|  | HP | maturity + generation | tether beacon | carried catalysts     |  |
|  | weapon + magazine + reserve | aegis charges | wave label | score   |  |
|  +--------------------------------------------------------------------+  |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  | Phaser 4 canvas      z-10   1280x720 design resolution, Scale.FIT  |  |
|  |                                                                    |  |
|  |            (o) tree @ (400, 360), aura r=220                       |  |
|  |             |                                                      |  |
|  |        [player] <--------------- [pursuit vectors, all 4 edges]    |  |
|  |                                                                    |  |
|  |  bullet pool | enemy pool | canister pool | particle emitters      |  |
|  +--------------------------------------------------------------------+  |
|                                                                          |
|  +--------------------------------------------------------------------+  |
|  | Modal layer          z-30   pointer-events: auto                   |  |
|  | Generation draft (3 cards) | pause | game over + restart           |  |
|  +--------------------------------------------------------------------+  |
+--------------------------------------------------------------------------+
```

### 2.2 State Synchronisation Bridge

```typescript
// src/game/eventBus.ts
import mitt from 'mitt';

export type TetherState = 'tethered' | 'grace' | 'decaying';

export type CatalystTier = 'silt' | 'nitrate' | 'phyto';

export type UpgradeCard = {
  id: string;
  name: string;
  body: string;
  effect: string;
  repeatable: boolean;
};

export type GameEvents = {
  // Phaser -> React
  PLAYER_HP_CHANGED: { current: number; max: number };
  AMMO_UPDATED: { weaponId: string; clip: number; clipMax: number; reserve: number };
  WEAPON_SWITCHED: { weaponId: string; unlocked: string[] };
  TREE_GROWTH_TICK: { maturityPct: number; generation: number; ratePerSec: number };
  TETHER_STATE_CHANGED: { state: TetherState };
  CATALYSTS_CARRIED: { tiers: CatalystTier[]; cap: number };
  CATALYSTS_DELIVERED: { totalPct: number; count: number };
  GENERATION_REACHED: { generation: number; cards: UpgradeCard[] };
  AEGIS_STATUS: { charges: number; capacity: number; activeRemainingMs: number };
  DIFFICULTY_TICK: { elapsedMs: number; waveLabel: number; aliveEnemies: number };
  SCORE_UPDATED: { score: number };
  GAME_OVER: { score: number; generation: number; kills: number; survivedMs: number };

  // React -> Phaser
  APPLY_UPGRADE_SELECTION: { cardId: string };
  RESUME_FROM_DRAFT: void;
  TOGGLE_PAUSE: void;
  RESTART_SIMULATION: void;
};

export const bus = mitt<GameEvents>();
```

Rules:

- Phaser emits `TREE_GROWTH_TICK`, `DIFFICULTY_TICK`, and `SCORE_UPDATED` at **10 Hz**, not every
  frame, to avoid thrashing React.
- All other events are edge-triggered — emitted only when the value actually changes.
- The Phaser scene is the single source of truth. React holds a mirror for rendering only.

### 2.3 Arena Layout and Scaling

Design resolution is a fixed 1280x720 with no camera panning. The canvas uses
`Phaser.Scale.FIT` with `autoCenter: CENTER_BOTH`, so the arena letterboxes intact on a
1366x768 laptop.

```text
(0,0) ------------------------------------------------------------ (1280,0)
|                                                                        |
|                                                                        |
|                  .--''--.                                              |
|                 /        \        tree anchor (400, 360)               |
|                |   (o)    |       aura radius 220 px                   |
|                 \        /        entire aura on playfield             |
|                  '--..--'                                              |
|                                                                        |
|             player spawn (400, 360), standing on the tether            |
|                                                                        |
(0,720) ---------------------------------------------------------- (1280,720)

spawn band: any screen edge, inset 24 px, minimum 120 px from the player
```

- **Tree anchor:** `(400, 360)`. Left of centre so the mature 160 px canopy never occludes the
  middle of the playfield, but far enough in that the full 220 px aura sits on the arena.
- **Player spawn:** `(400, 360)` — the run begins tethered.
- **Enemy spawn:** all four edges. There is no safe corner. The only constraint is that a spawn
  point must be at least 120 px from the player so nothing materialises in their face.
- **Bounds:** the player is clamped to the arena rectangle. Enemies are not clamped while
  off-screen but are culled if they somehow exit beyond 200 px.

---

## 3. Core Mechanics

### 3.1 Player Entity

| Attribute      | Value                                         |
| :------------- | :-------------------------------------------- |
| Hit points     | 100 (game over at 0)                          |
| Move speed     | 220 px/s, 8-direction, instant response       |
| Movement input | `WASD` / arrow keys                           |
| Aim            | Normalised vector from player to mouse cursor |
| Fire           | Left mouse, hold to auto-fire                 |
| Weapon swap    | `Q` or mouse wheel, 2 equipped slots          |
| Reload         | Automatic on empty, `R` to reload manually    |
| Aegis          | `Spacebar`                                    |
| Pause          | `Esc` or `P`                                  |

**Damage safety rails** (absent from v1.2, required to stop instant melting):

- Taking any damage grants **0.5 s of invulnerability** with a sprite flicker at 12 Hz.
- An individual enemy can land at most **one melee tick per 0.8 s**, tracked per enemy.
- The player does not regenerate HP passively. Healing comes only from draft cards.

### 3.2 The Tree — Aura Tether, Growth and Decay

The tree is invulnerable and is ignored by all enemies. It is not defended; it is **maintained**.

| Property         | Value                                                       |
| :--------------- | :---------------------------------------------------------- |
| Maturity         | Floating point, 0.0% to 100.0%                              |
| Aura radius      | 220 px base, modified by draft cards                        |
| Tethered growth  | `+1.2 %/s x (1 + 0.06 x generation)`                        |
| Untethered decay | `-0.6 %/s`, flat, never scales with generation              |
| Grace period     | 1.0 s after leaving the aura before decay starts            |
| Floor            | Maturity clamps at 0.0%. Earned Generations are never lost. |

`tethered` is `distance(player, tree) <= auraRadius`.

**Tether state machine:**

```text
tethered --(leave aura)--> grace (1.0 s) --(timer expires)--> decaying
   ^                          |                                   |
   +------(re-enter aura)-----+-----------(re-enter aura)---------+
```

The grace period exists so that dancing on the aura boundary during a fight does not chip away
at maturity on every frame. Re-entering the aura at any point resets the state to `tethered`
immediately.

**Why decay and not tree health:** the v1.2 model made leaving the aura merely _slower_ (a 89%
growth penalty), which meant an optimal player simply never entered it. Decay makes absence
actively destructive without requiring a second enemy AI state, a tree health bar, or any new
art — which is the correct trade for a 36-hour solo build.

**Visual evolution states:**

| Phase         | Maturity         | Sprite                               | Size   |
| :------------ | :--------------- | :----------------------------------- | :----- |
| 1 — Sprout    | 0–25%            | `tree_sprout`                        | 64 px  |
| 2 — Sapling   | 26–65%           | `tree_sapling`                       | 96 px  |
| 3 — Bio-Arbor | 66–99%           | `tree_sapling` tinted, veins pulsing | 128 px |
| 4 — Apex      | 100% (momentary) | `tree_sapling` bloom + spore burst   | 160 px |

Phases 2–4 reuse the same spritesheet frame at different scales and tints. No new art required.

**Generation cycle.** Reaching 100.0% maturity immediately:

1. Increments the `generation` counter.
2. Grants **1 Aegis charge** (up to battery capacity).
3. Emits `GENERATION_REACHED` with 3 drafted upgrade cards; the simulation pauses.
4. Plays the Apex bloom, then resets maturity to 0.0% and the tree to Sprout.
5. Adds `+6%` to the tethered growth rate multiplier, permanently.

The first Generation is tuned to land at roughly **70–85 s** of competent play.

### 3.3 Catalyst Carry and Delivery

Catalysts are the only way to accelerate growth beyond the base rate, and they spawn where the
enemies die — away from the tree. They are not consumed on pickup. They are **cargo**.

| Property              | Value                                                        |
| :-------------------- | :----------------------------------------------------------- |
| Carry capacity        | 3 (raised to 5 by the Vacuum Coils card)                     |
| Movement penalty      | `-5%` move speed per carried catalyst (max `-15%`)           |
| Delivery              | Entering the aura cashes in the entire carried stack at once |
| Pickup while tethered | Cashes in instantly, no carry step                           |
| On death              | Carried catalysts are lost (the run is over regardless)      |

This is the sortie loop. A 10-second excursion costs 6% maturity to decay; a single Nitrate
Capsule returns 10%. The sortie is worth making, but it is never free, and a greedy player who
overstays loses more than they collect.

Carried catalysts render as pips on the HUD and as small glowing motes orbiting the player
sprite.

### 3.4 Aegis Pulse Battery

| Property    | Value                                                          |
| :---------- | :------------------------------------------------------------- |
| Capacity    | 1 charge (2 with the Second Wind card)                         |
| Earned      | 1 charge per Generation                                        |
| Input       | `Spacebar`                                                     |
| Duration    | 8.0 s                                                          |
| Effect      | Player takes zero damage from all sources                      |
| Retaliation | Player body deals 80 damage/s to contacting enemies            |
| Knockback   | 250 px/s away from the player                                  |
| Visual      | `fx_aegis_dome` hexagonal shell, additive blend, slow rotation |

Because charges now arrive with every Generation (roughly every 70–90 s) rather than once per
full maturity cycle from a standing start, Aegis is a usable panic button rather than a
once-a-run lottery. It is the intended answer to being swarmed _inside_ the aura, where the
player most wants to stay.

### 3.5 Pity-Weighted Drop System

Drops must never drought, because catalysts are the only growth accelerator.

- `n` = number of consecutive kills that produced no drop.
- Drop probability on the next kill: `P(n) = min(1.0, 0.20 + 0.15 * n)`
- Therefore: `P(0)=0.20`, `P(1)=0.35`, `P(3)=0.65`, `P(5)=0.95`, `P(6)=1.00`.
- The 7th consecutive kill without a drop is **guaranteed** to drop.
- Any drop resets `n` to 0.

v1.2 specified `P0 + 0.05n` alongside a claim that the 7th kill was guaranteed; those two
statements contradicted each other (`0.20 + 6 x 0.05 = 0.50`). The coefficient above makes the
formula and the hard-pity guarantee the same rule.

**Tier roll** (once a drop is confirmed):

| Tier            | Weight |
| :-------------- | :----- |
| Hydrated Silt   | 60%    |
| Nitrate Capsule | 30%    |
| Phyto-Hormone   | 10%    |

### 3.6 Canister Ejection and Magnet

Canisters do not rest where the enemy died. They are thrown toward the tree, so the world itself
nudges the player home.

| Property        | Value                                                      |
| :-------------- | :--------------------------------------------------------- |
| Ejection vector | `normalize(treePos - killPos)`                             |
| Ejection speed  | Random 450–600 px/s                                        |
| Drag            | 300 px/s^2, so travel distance is roughly 350–500 px       |
| Arc             | 0.45 s hop with a single bounce, then settles              |
| Lifetime        | 15.0 s                                                     |
| Despawn warning | Flashes at 8 Hz for the final 4.0 s                        |
| Magnet radius   | 90 px (x2 with Vacuum Coils)                               |
| Magnet pull     | Accelerates to 500 px/s toward the player                  |
| On contact      | Absorbed into the carry stack, chime, floating combat text |

v1.2 used 120–180 px/s over 0.5 s, which moved a canister about 75 px — visually an ejection,
mechanically nothing. The values above actually relocate loot toward the aura.

---

## 4. Entities and Balance

### 4.1 Weapons

Three weapons ship. The Kinetic Carbine is the starting loadout; the other two are unlocked by
draft cards. All three bullet sprites already exist in the spritesheet.

| ID   | Weapon          | Delivery          | Damage  | Fire rate | Mag | Reload | Role                   |
| :--- | :-------------- | :---------------- | :------ | :-------- | :-- | :----- | :--------------------- |
| W-01 | Kinetic Carbine | Single projectile | 22      | 4.0 /s    | 24  | 1.1 s  | Accurate default       |
| W-02 | Scatter Pulser  | 6 pellets, 28 deg | 10 each | 1.1 /s    | 6   | 1.6 s  | Swarm clear, knockback |
| W-03 | Mag-Rail Staker | Piercing beam     | 120     | 0.8 /s    | 3   | 2.0 s  | Pierces all in line    |

Knockback: Carbine 60 px/s, Scatter 220 px/s per pellet, Mag-Rail 0 (it passes through).

### 4.2 Ammunition Regeneration

Reserve ammunition regenerates **only while tethered**. This is the second reason to come home,
and it removes the softlock that v1.2 guaranteed by pairing finite pools with a 10-wave refill
cadence.

| Weapon          | Regen while tethered | Reserve cap |
| :-------------- | :------------------- | :---------- |
| Kinetic Carbine | +8.0 rounds/s        | 240         |
| Scatter Pulser  | +1.2 shells/s        | 48          |
| Mag-Rail Staker | +0.4 spikes/s        | 24          |

Rules:

- Regeneration fills the **reserve** only. The magazine is filled by reloading.
- Regeneration is paused entirely while `grace` or `decaying`.
- All three weapons regenerate simultaneously, whether equipped or not.
- The Munitions Loom card multiplies all three rates by 1.4 per copy taken.

The relative rates are the balance lever: the Carbine refills a full reserve in 30 s of
tethering, so it is effectively always available, while a full Mag-Rail reserve takes a minute
of dedicated hugging. Burst power stays precious; baseline survival never runs dry.

### 4.3 Mutant Bestiary

All mutants compute a live Euclidean pursuit vector toward the player. None of them can see or
damage the tree.

| ID   | Mutant         | Speed    | HP  | Melee     | Threat | Behaviour                                    |
| :--- | :------------- | :------- | :-- | :-------- | :----- | :------------------------------------------- |
| E-01 | Dune Swarmer   | 180 px/s | 25  | 6         | 1      | Fast, fragile, arrives in numbers            |
| E-02 | Carapace Brute | 75 px/s  | 120 | 20        | 4      | Armoured: 25% ballistic reduction            |
| E-03 | Bio-Detonator  | 130 px/s | 35  | 40 AoE    | 2      | Suicide unit, see below                      |
| E-04 | Acid Spitter   | 90 px/s  | 45  | 15 ranged | 3      | **Stretch only.** Halts at 240 px, lobs bile |

**Bio-Detonator detail:** on closing within 45 px of the player it locks in place, flashes white
for **0.6 s**, then explodes for 40 damage in a 70 px radius. The explosion also damages other
mutants, which makes baiting detonators into the swarm a real tactic. Killing it during the
telegraph prevents the explosion entirely.

`Threat` is the spawn-budget cost consumed by the spawn director in section 5.1.

### 4.4 Bio-Catalysts

Canisters contain exactly one catalyst. There is no secondary currency.

| Catalyst        | Maturity on delivery |
| :-------------- | :------------------- |
| Hydrated Silt   | +5%                  |
| Nitrate Capsule | +10%                 |
| Phyto-Hormone   | +20%                 |

**Bio-Scrap is removed.** In v1.2 it was described as the currency spent during drafts, but the
draft was a free pick-one-of-three, so it was never spent on anything. It has been cut rather
than given a contrived sink.

---

## 5. Progression

### 5.1 Spawn Director

There is no wave state machine. A director maintains continuous pressure that scales with
elapsed run time, which removes both the "waiting for the last straggler" dead air and the
undefined overlap behaviour of v1.2.

Let `t` be elapsed run seconds, excluding pause and draft time.

```text
targetThreat(t) = 3 + t / 6

while (aliveThreat < targetThreat) and (spawnedThisSecond < 2):
    pick an unlocked mutant type, weighted
    spawn it at a random screen edge, >= 120 px from the player
    aliveThreat += mutant.threat
```

**Type unlocks:**

| Mutant                 | Unlocks at |
| :--------------------- | :--------- |
| Dune Swarmer           | t = 0 s    |
| Bio-Detonator          | t = 45 s   |
| Carapace Brute         | t = 90 s   |
| Acid Spitter (stretch) | t = 150 s  |

**Stat ramp**, applied at spawn time and fixed for that mutant's lifetime:

- HP multiplier: `1 + 0.10 * floor(t / 60)`
- Damage multiplier: `1 + 0.06 * floor(t / 60)`

**Caps and guards:**

- Hard cap of 60 concurrent enemies for frame-rate safety.
- Spawn rate capped at 2 units/s so a difficulty spike cannot dump 20 mutants at once.
- The HUD "Wave" number is `floor(t / 30) + 1` and is purely cosmetic — it exists so that
  spectators have a legible progress number, and it drives nothing.

### 5.2 Generation-Driven Draft

The draft fires on **Generation**, not on a wave counter. The tree is the progression engine:
hug it harder, upgrade sooner.

1. Maturity reaches 100.0%.
2. Phaser pauses the scene and emits `GENERATION_REACHED` with 3 drafted cards.
3. React renders the modal; keys `1` / `2` / `3` or a click select a card.
4. `APPLY_UPGRADE_SELECTION` applies the effect inside the scene.
5. The player presses **Deploy** and React emits `RESUME_FROM_DRAFT`.

Because the first Generation lands at roughly 70–85 s, the first upgrade arrives inside the
first minute and a half rather than at the five-minute mark v1.2 implied.

**Draw rules:**

- Draw 3 distinct cards from the eligible pool.
- `repeatable: false` cards are removed from the pool once taken.
- On Generations 1 and 2, the two weapon-requisition cards receive triple weight, so the player
  reliably acquires a second weapon early.

### 5.3 Draft Card Pool

Twelve cards, replacing the three hardcoded examples in v1.2.

| Card                | Effect                                | Repeatable |
| :------------------ | :------------------------------------ | :--------- |
| Bio-Surge           | +30% maturity immediately             | Yes        |
| Deep Roots          | Tethered growth rate +15%             | Yes        |
| Heartwood           | Untethered decay rate -40%            | Yes        |
| Wider Canopy        | Aura radius +30 px                    | Yes        |
| Munitions Loom      | Ammunition regen rate x1.4            | Yes        |
| Hollow-Point        | All weapon damage +15%                | Yes        |
| Kinetic Dampers     | Max HP +25 and heal to full           | Yes        |
| Nano-Suture Kit     | Restore 50 HP, move speed +8%         | Yes        |
| Vacuum Coils        | Magnet radius x2, carry capacity to 5 | No         |
| Scatter Requisition | Unlock Scatter Pulser, fill reserve   | No         |
| Rail Requisition    | Unlock Mag-Rail Staker, fill reserve  | No         |
| Second Wind         | Aegis battery capacity to 2           | No         |

Multiplicative effects stack multiplicatively; additive effects stack additively. `Heartwood`
taken three times yields a decay rate of `-0.6 * 0.6^3 = -0.13 %/s`, which is intentionally
strong — it is the build that lets a player live outside the aura, at the cost of every other
card they did not take.

### 5.4 Score and Persistence

One formula, stated once. v1.2 awarded generation points in two different places with two
different coefficients.

```text
score = kills * 50
      + floor(elapsedSeconds / 30) * 250
      + generations * 2500
      + catalystsDelivered * 25
```

The best score of any run is persisted to `localStorage` under the key `foratree.highscore` and
displayed in the HUD and on the game-over card. There is no server and no account.

---

## 6. Interface and Visual Design

### 6.1 HUD Layout

React DOM over the canvas, `pointer-events: none`, Tailwind utility classes only.

| Region       | Contents                                                      |
| :----------- | :------------------------------------------------------------ |
| Top-left     | HP bar, numeric `HP 100 / 100`                                |
| Top-centre   | Maturity gauge, `GEN 3`, tether beacon, carried-catalyst pips |
| Top-right    | Wave label, elapsed time, current score, best score           |
| Bottom-left  | Aegis badge with charge count                                 |
| Bottom-right | Active weapon, magazine, reserve, reload indicator            |

**Tether beacon** renders the three states explicitly:

| State      | Beacon                                                            |
| :--------- | :---------------------------------------------------------------- |
| `tethered` | Cyan, steady, label `TETHERED`                                    |
| `grace`    | Amber, pulsing, label `LEAVING`                                   |
| `decaying` | Red, fast pulse, label `DECAYING` with the live `-0.6 %/s` figure |

**Aegis badge:** grey `[SPACE] AEGIS OFFLINE` at zero charges; pulsing cyan
`[SPACE] AEGIS x1` when charged; a bright countdown ring while active.

Bio-Scrap has no readout, because it no longer exists.

### 6.2 Feedback and Juice

- **Aura ring:** `fx_aura_ring` on the sand, scaled to the live radius. Cyan and bright while
  tethered, desaturating to amber during grace, rust-red and flickering while decaying.
- **Decay vignette:** a rust-red screen-edge vignette fades in over 0.4 s when decay begins. It
  is the primary out-of-corner-of-the-eye signal that the run is bleeding.
- **Delivery burst:** cashing in catalysts fires a green spore burst from the tree, floating
  combat text (`+20%`), and a rising chime scaled to the delivered total.
- **Impact:** 4 px screen shake for 80 ms on player damage, white flash on mutant hit, splatter
  particles on death.
- **Generation bloom:** a full-screen white-green flash, a spore ring expanding from the tree,
  and a 0.5 s hold before the draft modal fades in.

No custom shaders. Every effect is a tint, scale, alpha tween, or particle emitter on an
existing spritesheet frame.

### 6.3 Art Assets

A single 4x4 spritesheet at `src/assets/spritesheet.png` covers the entire MVP:

| Row | Frames                                                        |
| :-- | :------------------------------------------------------------ |
| 1   | Player mech, Aegis dome, aura ring (green), aura ring (amber) |
| 2   | Dune Swarmer, Carapace Brute, Bio-Detonator, Acid Spitter     |
| 3   | Carbine bolt, Scatter pellet, Mag-Rail spike, canister        |
| 4   | Tree sprout, tree sapling, supply crate, sand decal           |

No additional art is required to ship the MVP.

---

## 7. Audio

- **Engine:** Phaser 4 Web Audio manager.
- **Effects** (generated with jsfxr):

| Key                | Description                               |
| :----------------- | :---------------------------------------- |
| `snd_carbine_fire` | Sharp punchy crack                        |
| `snd_shotgun_fire` | Heavy resonant spread blast               |
| `snd_rail_fire`    | High-voltage hum and crack                |
| `snd_alien_splat`  | Squishy organic crunch                    |
| `snd_aegis_on`     | Resonant forcefield charge                |
| `snd_pickup`       | Clean crystalline chime                   |
| `snd_deliver`      | Rising three-note growth chime            |
| `snd_decay_warn`   | Low descending drone, once on decay onset |
| `snd_generation`   | Full bloom fanfare                        |

- **Music:** one looping dark synth drone. Low-pass filtered during combat; the filter opens
  during drafts and while the player is tethered with no enemies alive.

---

## 8. Non-Functional Requirements

| Requirement | Target                                                                                     |
| :---------- | :----------------------------------------------------------------------------------------- |
| Frame rate  | 60 fps with 60 concurrent enemies and 200 live projectiles                                 |
| Pooling     | Bullets, enemies, canisters, and particles are pooled; zero runtime allocation in `update` |
| Pause       | `Esc` / `P` pauses the scene, and the window `blur` event auto-pauses                      |
| Restart     | `RESTART_SIMULATION` resets every system to initial state with no page reload              |
| Scaling     | `Scale.FIT` + `CENTER_BOTH`; playable from 1024x576 up to 4K                               |
| Input       | Keyboard and mouse only. No gamepad, no touch.                                             |
| Persistence | `localStorage` high score only. No backend, no analytics, no accounts.                     |
| Type safety | `strict: true`, zero uses of `any`                                                         |
| Build       | Static bundle deployable to GitHub Pages                                                   |

---

## 9. Implementation Roadmap

Solo developer, 36 hours, art already complete.

| Sprint | Hours | Deliverables                                                                                                       |
| :----- | :---- | :----------------------------------------------------------------------------------------------------------------- |
| 1      | 00–05 | Vite + React 19 + Tailwind v4 + Phaser 4 mount, typed event bus, `Scale.FIT`, arena, player movement and mouse aim |
| 2      | 05–11 | Tree, aura ring, growth and decay with grace period, tether state machine, maturity HUD, decay vignette            |
| 3      | 11–18 | Carbine, bullet pool, Dune Swarmer pursuit, collisions, damage, i-frames, death, game over                         |
| 4      | 18–24 | Spawn director, Bio-Detonator, Carapace Brute, stat ramp, wave label                                               |
| 5      | 24–29 | Drop pity, canister arc, magnet, carry and delivery, Generation event, Aegis                                       |
| 6      | 29–34 | Draft modal and 12-card pool, Scatter Pulser, Mag-Rail Staker, score, high score, pause, restart                   |
| 7      | 34–36 | jsfxr audio, screen shake, hit flashes, particles, balance pass, GitHub Pages deploy                               |

**Sequencing rule:** the vertical slice through Sprint 3 must be playable and fun on its own. If
time runs out, every later sprint is an additive layer that can be dropped without breaking the
build.

---

## 10. Out of Scope

Cut to protect the 36-hour budget. These are not deferred features; they are deleted.

| Item                          | Reason                                                                |
| :---------------------------- | :-------------------------------------------------------------------- |
| W-04 Arc Welder               | Chain-target logic and beam rendering cost a sprint; no sprite exists |
| W-05 Bio-Acid Sprayer         | Puddle DoT needs a new entity type and area-damage ticks              |
| E-05 Sand Stalker             | Burrow and re-emerge is a third AI state machine                      |
| Bio-Scrap currency            | Had no sink; the economy already closes without it                    |
| Custom WebGL shaders          | Tints, tweens, and particles achieve the same read                    |
| Enemies attacking the tree    | Decay delivers the same stakes with no new AI                         |
| Gamepad, touch, mobile layout | Desktop browser only                                                  |
| Online leaderboard            | No backend                                                            |

E-04 Acid Spitter is the single stretch item, attempted only if Sprint 7 finishes early. Its
sprite already exists, and it is additive to the spawn director rather than structural.

---

## 11. Appendix A — Changes from v1.2

### 11.1 Design-Breaking Issues Resolved

| #   | v1.2 problem                                                | v2.0 resolution                                                    |
| :-- | :---------------------------------------------------------- | :----------------------------------------------------------------- |
| 1   | Tree invulnerable and ignored, so nothing was ever at stake | Maturity decays outside the aura; absence is destructive (3.2)     |
| 2   | Catalyst drops rewarded fighting far from the tree          | Catalysts must be carried home and delivered inside the aura (3.3) |
| 3   | Finite ammo, no drops, 10-wave refill — guaranteed softlock | Reserves regenerate while tethered (4.2)                           |
| 4   | Bio-Scrap was a currency with nothing to buy                | Removed (4.4)                                                      |
| 5   | Aegis arrived once per ~222 s cycle; unusable as a tool     | One charge per Generation, roughly every 70–90 s (3.4)             |
| 6   | First upgrade at wave 10 (~5 min); only 3 cards existed     | Drafts fire on Generation (~80 s); 12-card pool (5.2, 5.3)         |

### 11.2 Specification Defects Corrected

| #   | v1.2 defect                                                | v2.0 correction                                      |
| :-- | :--------------------------------------------------------- | :--------------------------------------------------- |
| 7   | Generations scored twice, at 1000x and 2500x               | One formula, one coefficient (5.4)                   |
| 8   | Pity formula gave `P(6) = 0.50` while claiming a guarantee | `P(n) = min(1, 0.20 + 0.15n)` (3.5)                  |
| 9   | "30 s or all slain" left survivor behaviour undefined      | Wave machine replaced by a continuous director (5.1) |
| 10  | Targeted Phaser 3; `phaser@4.2.1` is installed             | Retargeted to Phaser 4 (2.1)                         |
| 11  | Fixed 1280x720 with no scale mode                          | `Scale.FIT` + `CENTER_BOTH` (2.3)                    |
| 12  | No spawns at `X < 120` with the tree at `X = 180`          | Tree at `(400, 360)`, spawns on all edges (2.3)      |
| 13  | No i-frames, reload times, or melee tick cadence           | All three specified (3.1, 4.1)                       |
| 14  | HUD showed a high score that was never persisted           | `localStorage` key `foratree.highscore` (5.4)        |
| 15  | No pause, blur handling, or restart-state definition       | Specified (8)                                        |
| 16  | Mag-Rail had 24 shots for an entire run                    | Reserve regenerates at 0.4/s while tethered (4.2)    |
| 17  | Canister ejection travelled roughly 75 px                  | 450–600 px/s with drag, roughly 350–500 px (3.6)     |
| 18  | LaTeX markup was corrupted throughout the document         | Plain inline notation and code blocks only           |
