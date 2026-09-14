# Walkthrough

A player-facing guide to "For a Tree". For balance numbers and formulas, see
[docs/For_a_Tree_SRS.md](docs/For_a_Tree_SRS.md) and the delta spec in
`docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md`.

## Controls

| Input       | Action                       |
| :---------- | :--------------------------- |
| `WASD`      | Move                         |
| Mouse       | Aim / fire                   |
| `1` `2` `3` | Switch weapon                |
| `Shift`     | Dash                         |
| `Space`     | Trigger Aegis (once charged) |
| `R`         | Reload                       |
| `Esc` / `P` | Pause                        |

## Starting a run

The title screen offers three difficulty modes: **Easy** (lighter mutant pressure, good for
learning the loop), **Medium** (recommended), and **Hard** (full pressure from the start).
Picking one starts the run immediately — the tree is a bare sprout, and the player spawns beside
it.

## The loop

1. **Stay tethered while you can.** Inside the 220 px bio-aura, tree maturity climbs and your
   ammunition reserves regenerate. Mutants converge on you regardless of where you stand, so
   fighting near the tree is not automatically safe — it's just where your resources recover.
2. **Growth stalls at 60%.** Tethered growth only takes maturity to the growth ceiling. Past
   that, the tree needs catalysts, which only drop outside the aura and beyond the barren zone
   ring around it.
3. **Leave to hunt.** Kill mutants for a chance at a catalyst canister (silt, nitrate, or phyto —
   phyto is worth the most maturity). Canisters eject, then sit until picked up or their lifetime
   expires — a red flash warns you before one despawns.
4. **Watch your Grace.** Outside the aura, maturity decays and your ammo reserves stop
   regenerating. Grace is a short buffer, not infinite kiting time; treat it as a countdown to
   get back or lose ground.
5. **Carry catalysts home.** You have limited carry capacity, and each catalyst carried slows you
   down slightly. Sprint back, cross the aura boundary, and delivery converts them into maturity
   automatically.
6. **Generation.** Reaching 100% maturity triggers a Generation: an Aegis charge and a draft of
   upgrade cards to pick from. The tree resets to begin growing toward the next Generation, and
   the run continues — there is no ending wave, only escalating pressure.

If a change to your strategy makes it viable to ignore the tree entirely, you're fighting the
game's intent rather than playing it — the tree is always the objective, never just a spawn
point.

## Combat basics

- **Kinetic Carbine** (`1`) — your starting weapon. Reliable rate of fire, moderate damage,
  no drawback. Always available.
- **Scatter Pulser** (`2`) — unlocked via a draft card. Short-range multi-pellet spread, heavy
  knockback, small magazine.
- **Mag-Rail Staker** (`3`) — unlocked via a draft card. Slow-firing, very high single-target
  damage, punches through Brute armor reduction.
- **Dash** (`Shift`) — a short burst of invulnerable movement on a cooldown. Use it to escape
  Bio-Detonator telegraphs and Brute melee windows, not just to close distance.
- **Aegis** (`Space`) — once charged (from a Generation, or the Second Wind upgrade card raising
  capacity to 2), triggers a retaliation burst around the player and knocks nearby mutants back.
  Save it for when you're surrounded, not for a single target.

## Enemies

| Enemy          | Behavior                                                          |
| :------------- | :---------------------------------------------------------------- |
| Dune Swarmer   | Fast, fragile, low damage. Comes in numbers — the early pressure. |
| Carapace Brute | Slow, tanky, heavy melee, resists ballistic damage.               |
| Bio-Detonator  | Locks on at close range, telegraphs, then explodes in an area.    |

None of them can damage the tree. They exist only to kill you, and only while you're in reach.

## Reading the HUD

- **Maturity gauge** — current tree growth toward 100%. Color communicates growth vs. decay.
- **Tether/Grace indicator** — how much buffer you have left outside the aura before decay bites
  harder.
- **Ammo readout / reload indicator** — current weapon's magazine and reserve, and reload
  progress.
- **Carried catalyst pips** — how many canisters you're holding and your remaining capacity.
- **Dash indicator** — cooldown state for `Shift`.
- **Aegis badge** — charge count and readiness for `Space`.
- **Score readout** — running score from kills, time survived, Generations, and catalysts
  delivered.
- **Wave label** — cosmetic elapsed-pressure indicator. There is no wave state machine behind
  it; the spawn director scales continuously with time, not with a wave counter.

## Upgrades

Each Generation offers a draft of upgrade cards (see `src/game/config.ts` → `UPGRADE_CARDS` for
the full, current list — card text there is authoritative). Cards fall into two groups:

- **Repeatable stat boosts** — tether growth rate, decay reduction, aura radius, ammo regen,
  weapon damage, max HP, catalyst value. Stack these to compound your economy.
- **One-time unlocks** — Scatter Pulser, Mag-Rail Staker, Vacuum Coils (magnet range + carry
  capacity), Second Wind (Aegis capacity to 2). Each appears at most once across a run.

## Losing a run

The player has a health pool with a brief invulnerability window after each hit. Dying ends the
run and shows a game-over card with your final score, Generations reached, and a chance to
restart from the title screen. Your best score is remembered locally between runs.

## Tips

- Don't chase catalysts past your Grace budget — a lost canister respawns as a future drop
  opportunity, a dead run does not.
- Prioritize Deep Roots / Heartwood early to widen your effective time-outside-aura; take
  weapon unlocks once the base loop feels tight.
- The Bio-Detonator's telegraph is your dash cue — bait it, then dash away before it resolves.
- Brutes resist ballistic damage; the Mag-Rail Staker ignores that reduction and is the efficient
  answer once unlocked.
