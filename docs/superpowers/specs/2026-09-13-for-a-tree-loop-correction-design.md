# For a Tree — Core Loop Correction

**Document Version:** 1.0
**Date:** 2026-09-13
**Status:** Approved for implementation
**Relationship to the SRS:** This document is a **delta** against `docs/For_a_Tree_SRS.md` v2.0.
Where the two disagree, this document wins. Every SRS value not named here is unchanged.

---

## Table of contents

1. [Why this document exists](#1-why-this-document-exists)
2. [Growth ceiling](#2-growth-ceiling)
3. [Dash](#3-dash)
4. [The barren zone](#4-the-barren-zone)
5. [Grace as a meter](#5-grace-as-a-meter)
6. [Event bus changes](#6-event-bus-changes)
7. [HUD changes](#7-hud-changes)
8. [Card pool changes](#8-card-pool-changes)
9. [Corrections to smaller defects](#9-corrections-to-smaller-defects)
10. [Revised loop timing](#10-revised-loop-timing)
11. [Asset manifest](#11-asset-manifest)
12. [Budget impact](#12-budget-impact)
13. [Acceptance criteria](#13-acceptance-criteria)
14. [Rejected alternatives](#14-rejected-alternatives)

---

## 1. Why this document exists

SRS v2.0 states that the game is "the negotiation between two failures" — the player who never
leaves the tree stalls, and the player who abandons it bleeds out. Under v2.0's numbers the first
of those failures does not exist, so the negotiation does not either.

### 1.1 The defect

Base tethered growth is `1.2 %/s`, so maturity reaches 100% in **83.3 s with zero catalysts**.
The SRS's own target of "the first Generation lands at roughly 70–85 s" is precisely the
no-sortie number. Catalysts are therefore optional surplus, not income.

Worse, a sortie is negative expected value. A 10 s excursion costs:

```text
grace          1.0 s  at 0 %/s     =   0.0 %
decay          9.0 s  at -0.6 %/s  =  -5.4 %
foregone growth 10.0 s at 1.2 %/s  = -12.0 %
                                     -------
total swing                          -17.4 %
```

Expected catalyst value is `0.6 x 5 + 0.3 x 10 + 0.1 x 20 = 8 %`. Break-even needs 2.2 canisters
per 10 s sortie, and carry capacity is 3. SRS 3.3 claims the trip is worth making, but its
arithmetic omits foregone growth — the dominant term.

Three further systems reinforce standing still:

- Carbine reserve regenerates at `8.0/s` against a fire rate of `4.0/s`, so a tethered player has
  effectively infinite ammunition.
- Enemies aggro exclusively onto the player, so remaining at the tree brings the fight to the tree.
- Score rewards generations and elapsed time. Neither requires leaving.

The optimal strategy in v2.0 is to stand on the tree and never move. That inverts design pillar 1.

### 1.2 The second defect

Making sorties mandatory is only half a fix, because v2.0 sorties are neither dangerous nor
completable.

Global invulnerability frames of `0.5 s` cap incoming damage at roughly two hits per second
regardless of crowd size. Two Dune Swarmers and fifty Dune Swarmers both deal `12 dmg/s`. Crowd
size is not a threat.

The return trip, however, is close to impossible. A player carrying three catalysts moves at
`220 x 0.85 = 187 px/s` against a Dune Swarmer's `180 px/s` — a 4% margin, with no dash and an
Aegis battery of capacity 1 that cannot bank charges. A surrounded player is not killed; they are
held in place and ground down. That is a slow strangle, and it reads as unfair rather than tense.

### 1.3 The two changes

Section 2 makes catalysts mandatory. Section 3 makes the sortie a skill test instead of a dice
roll. Everything else in this document follows from those two, or repairs a defect found while
checking them.

---

## 2. Growth ceiling

Supersedes SRS 3.2.

```text
GROWTH_CEILING = 60.0 %

maturity <  GROWTH_CEILING : tethered growth = +1.2 %/s x (1 + 0.06 x generation)
maturity >= GROWTH_CEILING : tethered growth = 0
decay                      : -0.6 %/s while untethered, at any maturity, unchanged
```

The run acquires two legible phases.

| Phase       | Maturity        | Behaviour                                                           |
| :---------- | :-------------- | :------------------------------------------------------------------ |
| Cultivation | `0` to `60%`    | Hug the tree. Growth runs, reserves refill. A sortie is a net loss. |
| Sortie      | `60%` to `100%` | Growth is frozen. Delivered catalysts are the only progress.        |

Above the ceiling a tethered player has zero growth **and** zero decay. They are frozen, not safe:
`targetThreat(t) = 3 + t/6` keeps climbing whether or not they move. Parking is a slow loss.

### 2.1 Why the ceiling rather than a growth-rate cut

Cutting base growth (the considered alternative, section 14) leaves foregone growth as a cost on
every sortie, so the trip stays marginal and the design keeps fighting itself. The ceiling
**removes the opportunity cost entirely above 60%**: growth is already zero, so the only cost of
leaving is decay, which a single Hydrated Silt more than repays. Sorties become strictly correct
in exactly the phase that demands them, and tree-hugging stays correct in the phase that rewards
it. One constant, no re-tuning of the growth curve, and it reads on the gauge as a tick mark.

### 2.2 Interaction with existing systems

- Catalysts delivered below the ceiling apply normally and simply shorten the cultivation phase.
  They are never wasted and never capped.
- `Bio-Surge` (+30% maturity immediately) can push through the ceiling. This is intended; it is a
  burst card and skipping most of a sortie phase is a fair payoff.
- Ammunition regeneration is unchanged and still tethered-only. It now matters, because the
  player spends roughly two-thirds of each generation away from the tree.

### 2.3 Overflow past 100%

A single delivery can exceed the remaining maturity — five Phyto-Hormones under `Vacuum Coils`
with `Rhizome Splice` taken is `125%` in one cash-in. Excess is **carried over, never discarded**:

```text
maturity += delivered
if maturity >= 100:
    trigger exactly one Generation this frame
    maturity -= 100            // remainder seeds the next cultivation phase
```

At most one Generation resolves per frame; any further excess simply sits as starting maturity for
the next cycle. A player is never punished for a large delivery, and the draft never fires twice
from one pickup.

This supersedes step 4 of the Generation cycle in SRS 3.2, which resets maturity to `0.0%`. The
reset becomes `maturity -= 100`. The tree sprite is then whatever 9.2's ranges give for the
remainder — usually Sprout, but a large overflow can leave it as a Sapling. Do not force the
sprite to Sprout on Generation; drive it from maturity alone, or the two will disagree.

### 2.4 Falling back below the ceiling

Decay applies at any maturity, so a player who leaves at `62%` can decay back under `60%`. Growth
then resumes normally until the ceiling is reached again. This is deliberate: the ceiling is a
gate, not a ratchet, and re-crossing it costs only the time to regrow.

---

## 3. Dash

New. Extends SRS 3.1.

| Property        | Value                                                              |
| :-------------- | :----------------------------------------------------------------- |
| Input           | `Shift`                                                            |
| Distance        | 180 px                                                             |
| Duration        | 0.15 s                                                             |
| Cooldown        | 1.6 s, measured from dash start                                    |
| Invulnerability | Full, for the 0.15 s of travel                                     |
| Collision       | Passes through enemies; player remains clamped to arena bounds     |
| Direction       | Current movement input vector; if no input, the current aim vector |
| Visual          | Three alpha-decayed copies of the player frame at 0.05 s intervals |
| Audio           | `snd_dash`                                                         |

### 3.1 Why a dash and not more damage

The `0.5 s` invulnerability window is the rail that stops the player melting, and it should stay.
Its cost is that crowd size stops being a damage threat. The dash resolves this by making crowd
size a **positional** threat instead: a swarm is a wall to be cut through, not a damage race. That
keeps the anti-melt guarantee, gives the return trip a skill expression, and preserves the
`-5%` per carried catalyst movement penalty as meaningful weight — heavier cargo means more dashes
needed to get home — rather than as a death sentence.

### 3.2 Tuning note

`180 px / 1.6 s` is a sustained contribution of `112 px/s` on top of a `220 px/s` base. It is an
escape tool, not a travel tool: spamming it toward the tree is slower than dashing through a
blockade at the moment it forms.

---

## 4. The barren zone

Supersedes the ejection portion of SRS 3.6, and adds a drop-eligibility rule to SRS 3.5.

Under section 2 catalysts are the bottleneck resource, so where they can be _obtained_ decides
whether the ceiling has any force. Enemies aggro exclusively onto the player, which means a player
who never leaves the tree still generates kills — inside the aura. Their canisters would settle
inside the aura and cash in instantly under SRS 3.3, so the tree-hugger would farm catalysts
without ever breaking tether and the ceiling would accomplish nothing.

SRS 1 already states the intended rule in prose: catalysts "grow only where the monsters are".
This section makes it mechanical.

```text
BARREN_MARGIN = 120 px
barrenRadius  = auraRadius + BARREN_MARGIN     // 340 px at base aura

DROP ELIGIBILITY
    if distance(killPos, treePos) < barrenRadius:
        the kill produces no canister at all
        the pity counter n is NOT incremented

SETTLING (eligible kills only)
    eject along normalize(treePos - killPos) at 450-600 px/s, drag 300 px/s^2
    clamp travel so the canister settles no closer than barrenRadius to the tree
```

Ground near the tree is barren. To earn anything the player must fight at least `340 px` out, and
every canister comes to rest on or outside that ring — close enough that loot still pulls the
player homeward, far enough that collecting it is a genuine excursion. A round trip is at least
`~3 s` of travel before any fighting.

Two consequences worth stating:

- The pity counter is not advanced by barren kills, so defending the tree never silently burns the
  player's accumulated pity. Pity tracks sortie effort only.
- `normalize(0, 0)` can no longer be evaluated, because a kill on the tree is barren and never
  ejects. The NaN latent in SRS 3.6 is removed by construction rather than by a special case.

`auraRadius` is the live value, so `Wider Canopy` moves the barren ring outward with the aura while
keeping the carry distance beyond it constant at `120 px`. The card still shortens every carry in
absolute terms.

## 5. Grace as a meter

Supersedes the grace-period portion of SRS 3.2.

SRS v2.0 states that re-entering the aura "resets the state to `tethered` immediately" and that
grace is a fresh `1.0 s`. A player oscillating across the boundary on a 0.9 s period therefore
never decays, while fighting outside the aura the whole time. That is a dominant exploit.

Grace becomes a depleting budget rather than a resettable timer.

```text
GRACE_MAX    = 1.0 s
DRAIN_RATE   = 1.0 per second   (while untethered)
REFILL_RATE  = 0.5 per second   (while tethered)

untethered and grace > 0 : state = grace,     grace -= dt
untethered and grace = 0 : state = decaying,  maturity -= decayRate * dt
tethered                 : state = tethered,  grace = min(GRACE_MAX, grace + 0.5 * dt)
```

Restoring a full second of grace costs two seconds of tethering. Boundary-dancing no longer buys
free time. The implementation is one float and the three existing states; no new states are added,
and the HUD beacon in SRS 6.1 is unchanged.

---

## 6. Event bus changes

Extends SRS 2.2. Additive only — no existing event is renamed or removed.

```typescript
export type GameEvents = {
  // ...all existing v2.0 events unchanged...

  // changed payload
  TREE_GROWTH_TICK: {
    maturityPct: number;
    generation: number;
    ratePerSec: number;  // 0 while maturity >= ceilingPct
    ceilingPct: number;  // NEW — lets the HUD draw the ceiling tick mark
  };

  // new, edge-triggered
  DASH_STATUS: { cooldownRemainingMs: number; ready: boolean };
  GROWTH_STALLED: { ceilingPct: number };
};
```

- `TREE_GROWTH_TICK` remains at 10 Hz.
- `DASH_STATUS` is edge-triggered: emitted once when the dash fires (`ready: false`) and once when
  the cooldown completes (`ready: true`). React animates the intervening sweep in CSS.
- `GROWTH_STALLED` is emitted on each **upward** crossing of the ceiling, not once per generation.
  Per 2.4 maturity can decay back below the ceiling and re-cross it, and the HUD must follow.
  `snd_growth_stalled` is rate-limited to one playback per 3 s so repeated boundary crossings
  cannot machine-gun the cue.

---

## 7. HUD changes

Extends SRS 6.1.

### 7.1 Maturity gauge

- A tick mark is drawn at `ceilingPct` on the gauge.
- Below the ceiling the fill is growth-coloured and the readout shows the live `+X.X %/s` rate.
- At or above the ceiling the fill switches to the catalyst colour and the rate readout is
  replaced with the label `CATALYST REQUIRED`.

That single swap is the whole tutorial for section 2, and it satisfies design pillar 4: a judge
sees the bar stop, sees the label, and understands that they have to go outside.

### 7.2 Dash indicator

Bottom-left, beside the Aegis badge. A radial sweep on a `[SHIFT]` glyph, dimmed while on
cooldown, driven by a CSS animation seeded from `DASH_STATUS`.

### 7.3 The barren ring must be visible

Section 4 silently voids every kill inside `barrenRadius`. Without a visual the player cannot learn
the rule — they see kills produce nothing and read it as a bug or a drop drought, which is exactly
the confusion SRS 3.5's pity system exists to prevent.

Render a second ring on the sand at `barrenRadius`, in the Phaser layer, as `fx_aura_ring` scaled
to `680 px` at roughly `25%` alpha and desaturated. It sits outside the bright aura ring and reads
as a faint boundary rather than a second aura. No new art, one extra sprite, and it scales with
`auraRadius` alongside the aura it follows.

`680 px` from a `512 px` cell is a `1.33x` upscale, which 11.1 avoids for the bright aura ring. It
is accepted here: the ring is desaturated and drawn at `25%` alpha, so softening reads as depth
rather than as a blur artifact. This is noted so it is not later "fixed" by adding a frame.

When a barren kill occurs, emit a short grey dust puff (`fx_particle`, grey tint, no chime) where
a canister would otherwise have ejected. The absence becomes legible as a deliberate outcome
instead of a missing drop.

---

## 8. Card pool changes

Extends SRS 5.3. One card is added; no existing card's values change.

| Card           | Effect                        | Repeatable |
| :------------- | :---------------------------- | :--------- |
| Rhizome Splice | Delivered catalyst value +25% | Yes        |

`Rhizome Splice` stacks **multiplicatively** — `x1.25` per copy — under the rule in SRS 5.3. Two
copies yield `x1.5625`, not `x1.5`. It multiplies the catalyst's face value at the moment of
delivery, so it is applied after the carry stack is summed and before section 2.3's overflow.

Catalysts are now the bottleneck and no card in the v2.0 pool touched them. The pool becomes
thirteen cards. Draw rules in SRS 5.2 are unchanged.

### 8.1 Re-reading the existing pool under the ceiling

No values change, but several cards shift in worth. Recorded here so the balance pass does not
"correct" them.

| Card           | Change in role                                                                           |
| :------------- | :--------------------------------------------------------------------------------------- |
| Heartwood      | Stops being a trap. Untethered time is mandatory now, so decay reduction always applies. |
| Wider Canopy   | Now doubly good — a larger aura also shortens every carry, per section 4.                |
| Deep Roots     | Weaker. Only affects the cultivation phase, which is roughly a third of a generation.    |
| Munitions Loom | Stronger. The player is away from the regeneration source far more often.                |
| Bio-Surge      | Strong burst. Can punch through the ceiling; see 2.2.                                    |

---

## 9. Corrections to smaller defects

Each of these was found while verifying the above. None depends on sections 2 or 3.

### 9.1 Aegis countdown ring

SRS 6.1 specifies "a bright countdown ring while active", but SRS 2.2 declares `AEGIS_STATUS`
edge-triggered, so React never receives the intervening values and cannot animate it.

Resolution: emit `AEGIS_STATUS` once on activation carrying `activeRemainingMs: 8000`, and let
React run a CSS animation of that duration locally. No new bus traffic, and the two sections stop
contradicting each other.

### 9.1.1 Locally animated indicators must freeze on pause

The Aegis ring and the dash sweep (7.2) both run on CSS timelines that the simulation does not
drive. SRS 8 pauses the scene on `Esc`, on `P`, and on window `blur`, and section 5.2 pauses it
during the draft. Any such indicator must carry `animation-play-state: paused` whenever React holds
a paused or drafting state, or it will drift out of sync with the scene clock and display a
countdown that already expired.

### 9.2 Tree phase boundaries

SRS 3.2 lists phases as `0–25`, `26–65`, `66–99`, `100`. Maturity is a float, so `25.5%` falls in
no phase. Redefined as half-open intervals:

| Phase         | Range         | Sprite                               | Size   |
| :------------ | :------------ | :----------------------------------- | :----- |
| 1 — Sprout    | `[0, 25)`     | `tree_sprout`                        | 64 px  |
| 2 — Sapling   | `[25, 65)`    | `tree_sapling`                       | 96 px  |
| 3 — Bio-Arbor | `[65, 100)`   | `tree_sapling` tinted, veins pulsing | 128 px |
| 4 — Apex      | `100` exactly | `tree_sapling` bloom and spore burst | 160 px |

### 9.3 Carbine versus Mag-Rail — no change, recorded reasoning

Burst damage favours the Mag-Rail (96 dps piercing against the Carbine's 88 dps single-target),
which looks like the Carbine is obsolete. It is not, because reserve regeneration gates sustain:

| Weapon          | Burst dps | Sustained dps (regen-limited)           |
| :-------------- | :-------- | :-------------------------------------- |
| Kinetic Carbine | 88        | 88, fire-rate-capped before regen binds |
| Mag-Rail Staker | 96        | 48 (`0.4 spikes/s x 120`)               |

The Carbine is the sustain weapon and the Mag-Rail is the burst weapon. Working as intended. This
is recorded so a later balance pass does not "fix" a non-problem.

---

## 10. Revised loop timing

Generation 0, competent play, roughly 12 s sorties, carry capacity 3.

```text
0 -> 60 %     50 s tethered, reserves refill               ->  60 %
sortie 1      -6.6 % decay, +24 % delivered (3 catalysts)  ->  77 %
sortie 2      -6.6 % decay, +24 % delivered (3 catalysts)  ->  95 %
sortie 3      partial, +8 % (1 catalyst)                   -> 100 %  GENERATION
                                                   total       ~95 s
```

The first Generation lands at **90–110 s**. This supersedes the "70–85 s" figure in SRS 3.2, which
was the no-sortie number and is exactly the defect described in section 1.1.

The split is roughly one-third cultivation and two-thirds sortie. Because growth scales `+6%` per
generation while the ceiling is fixed, the cultivation phase compresses over the run — 50 s at
generation 0, about 31 s by generation 10 — so the sortie share rises naturally. No second
escalating variable is needed; `targetThreat(t)` already supplies the difficulty ramp.

---

## 11. Asset manifest

Supersedes SRS 6.3.

### 11.1 Blocker in the shipped sheet

The existing `src/assets/spritesheet.png` is `1254 x 1254`. Divided into a 4x4 grid that yields
`313.5 px` cells, and Phaser requires integer `frameWidth` and `frameHeight`. The sheet cannot be
loaded as specified and must be rebuilt.

Target: **`2048 x 2048`, 4x4, `512 px` cells.** The aura ring displays at 440 px, so 256 px cells
would upscale and blur it.

### 11.2 Frames

Three v2.0 frames were dead — a targeting reticle referenced by no system, a supply crate
referenced by no system, and the Acid Spitter, which section 12 cuts. Two effects the design
requires had no art at all: a particle texture (SRS 6.2 needs one for spore bursts, splatter,
explosions, and the Generation bloom) and a muzzle flash. The dead frames pay for them.

| Index | Key               | Display px     | Notes                                                 |
| :---- | :---------------- | :------------- | :---------------------------------------------------- |
| 0     | `player_mech`     | 40             | Centered on body pivot, barrel facing `+X`            |
| 1     | `fx_aegis_dome`   | 120            | Additive blend, slow rotation                         |
| 2     | `fx_aura_ring`    | 440 base       | Authored greyscale; tinted cyan, amber, rust-red      |
| 3     | `fx_particle`     | 8–48           | New. Featureless white radial blob, tinted per use    |
| 4     | `enemy_swarmer`   | 36             | Faces `+X`                                            |
| 5     | `enemy_brute`     | 56             | Faces `+X`                                            |
| 6     | `enemy_detonator` | 40             | Faces `+X`, flashes white for 0.6 s before detonating |
| 7     | `fx_muzzle_flash` | 24             | New. Replaces the cut Acid Spitter. 60 ms life        |
| 8     | `bullet_carbine`  | 20 x 8         | Travels `+X`                                          |
| 9     | `bullet_scatter`  | 12 x 6         | Travels `+X`                                          |
| 10    | `bullet_rail`     | 48 x 10        | Travels `+X`                                          |
| 11    | `canister`        | 24             | Authored greyscale; tinted per catalyst tier          |
| 12    | `tree_sprout`     | 64             | Phase 1                                               |
| 13    | `tree_sapling`    | 96 / 128 / 160 | Phases 2, 3, 4 by scale and tint                      |
| 14    | `fx_ground_decal` | 64–160         | New. Replaces the supply crate. Scorch left by deaths |
| 15    | `sand_decal`      | 48–128         | Arena dressing                                        |

### 11.3 Authoring rules

- Every sprite centered in its cell; rotation origin is the cell centre. An off-centre pivot makes
  the player wobble while aiming.
- At least 40 px of transparent margin on all four sides of each 512 px cell. The v2.0 sheet had
  glow bleeding across cell borders, which shows as fringing on neighbouring frames.
- Anything tinted at runtime must be authored white or greyscale: `fx_aura_ring`, `fx_particle`,
  `canister`, `fx_muzzle_flash`. Coloured source art tints muddy.
- Everything directional faces `+X`, that is, 0 radians.

### 11.4 Separate files

| File                    | Specification                  | Purpose                                  |
| :---------------------- | :----------------------------- | :--------------------------------------- |
| `src/assets/ground.png` | 512 x 512, seamlessly tileable | Desert floor, tiled once at scene create |

No art is required for the dash; it is three alpha-decayed copies of frame 0.

### 11.5 Audio

SRS 7 stands, plus two entries.

| Key                  | Description                                                            |
| :------------------- | :--------------------------------------------------------------------- |
| `snd_dash`           | Short airy whoosh, about 120 ms                                        |
| `snd_growth_stalled` | Soft descending two-note, once when maturity first reaches the ceiling |

All effects stay under 0.4 s and are normalised to about -6 dBFS so simultaneous playback does not
clip.

---

## 12. Budget impact

The dash costs roughly one hour in Sprint 3. It is paid for by **cutting E-04 Acid Spitter
outright** rather than retaining it as a stretch item. SRS 10 moves it from stretch to deleted.

Every other change in this document is a constant, a clamp, or a payload field, and fits inside
the sprint that already owns the system it touches.

| Change                                              | Sprint |
| :-------------------------------------------------- | :----- |
| Growth ceiling, `GROWTH_STALLED`, gauge tick        | 2      |
| Grace meter                                         | 2      |
| Dash and `DASH_STATUS`                              | 3      |
| Barren zone, settling clamp, barren ring, dust puff | 5      |
| Rhizome Splice card                                 | 6      |
| Aegis ring, tree phase ranges                       | 6      |

---

## 13. Acceptance criteria

The correction has worked if all of the following hold in playtest.

1. A player who never leaves the aura stalls permanently at 60% maturity and eventually dies to
   the difficulty ramp. They never reach a Generation.
2. A player who never returns to the aura reaches 0% maturity and never reaches a Generation.
3. Competent play reaches Generation 1 between 90 and 110 seconds.
4. At least two sorties are required per generation at generation 0.
5. A player carrying three catalysts can escape a formed blockade of six or more Dune Swarmers
   using one dash.
6. Oscillating across the aura boundary at any period does not indefinitely prevent decay.
7. No canister ever comes to rest within `barrenRadius` of the tree, and kills inside that radius
   produce no canister and do not advance the pity counter.
8. The maturity gauge visibly changes state at 60% without any text tutorial.
9. A delivery that overshoots 100% carries its remainder into the next cycle and fires exactly one
   draft.
10. Pausing while Aegis is active and resuming leaves the countdown ring agreeing with the scene's
    remaining duration.
11. A first-time player who kills enemies beside the tree understands within three such kills that
    the ground there is barren, without being told in text.

---

## 14. Rejected alternatives

Recorded so they are not revisited.

| Alternative                                                   | Why rejected                                                                                                                                                                                                                                             |
| :------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cut base growth to about `0.35 %/s`                           | Catalysts become the main income, but foregone growth still taxes every sortie, so the trip stays marginal. The ceiling removes that tax outright.                                                                                                       |
| Ceiling that falls per generation, `60 - 4 x gen`             | Adds a third escalating variable on top of the growth scalar and `targetThreat(t)`. Tuning risk with no gain; the cultivation phase already compresses on its own.                                                                                       |
| Reduce global invulnerability to `0.35 s`                     | Makes crowds lethal without giving any tool to escape them, which worsens the return-trip strangle rather than fixing it.                                                                                                                                |
| Move risk onto cargo — hits drop a carried catalyst           | Cheap and thematic, but removing the movement penalty makes sorties fast and consequence-free, so greed stops being punished.                                                                                                                            |
| Enemies attack the tree                                       | Already rejected in SRS 10 and still correct. It needs a second AI state and a tree health bar; decay delivers the same stakes for free.                                                                                                                 |
| Clamp canisters to the aura edge, but let kills anywhere drop | The first draft of section 4. It only constrained kills made _outside_ the aura; kills inside it left their canister where it fell, so a tree-hugger farmed catalysts without breaking tether and the ceiling had no force. The barren zone replaces it. |
| Let barren kills still advance the pity counter               | Would make defending the tree drain the player's pity reserve, so the first real sortie would start with worse drop odds for having survived. Inverts the intent of SRS 3.5.                                                                             |
