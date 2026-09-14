# Secret Debug Menu — Design

Date: 2026-09-14

## Purpose

A PIN-gated debug/admin overlay for local testing: display+hitbox scale, live
difficulty override, god mode, timescale, force-spawn/kill-all, and instant
tree maturity. Reached by a hidden keypress, not exposed to normal players.

## Trigger and PIN gate

- Backtick (`` ` ``) key, edge-triggered in `ArenaScene`, opens the debug
  overlay. Chosen because it doesn't collide with WASD move, mouse aim/fire,
  Space dash, or Esc pause (see `WALKTHROUGH.md`).
- Opening the overlay pauses the sim via the existing pause path and emits a
  new bus event `DEBUG_MENU_OPENED`.
- **No PIN saved yet** (no `fat_debug_pin_hash` key in `localStorage`): show
  **Set PIN** — enter a 4-digit PIN, confirm it (mismatch → shake + retry).
  On save, compute `SHA-256(pin + salt)` where `salt` is a random value
  generated once and stored in `localStorage` under `fat_debug_pin_salt`;
  store the resulting hash in `fat_debug_pin_hash`. No plaintext PIN is ever
  persisted.
- **PIN already saved**: show **Enter PIN** (numeric keypad, 4 digits).
  Wrong PIN → shake + red highlight + "Incorrect PIN. Try again." and clear
  input; no attempt limit or lockout (debug tool, not a real auth surface).
  Correct PIN → show the menu panel.
- No "forgot PIN" / reset flow. Clearing `localStorage` manually is the
  escape hatch; out of scope for this feature.
- This is client-side-only "security" — a determined user can read
  `localStorage` in devtools. The hash only prevents casual PIN discovery,
  it is not a real access-control boundary. Acceptable for a hackathon
  single-player game with no server and no real stakes behind the gate.

## Menu → sim wiring

New events on the existing bus (`src/game/eventBus.ts`), one per control,
matching the existing single-purpose convention (`TOGGLE_PAUSE`,
`RESTART_SIMULATION`):

```ts
DEBUG_MENU_OPENED: void;
DEBUG_SET_SCALE: { tier: 0.75 | 1 | 1.5 | 2 };
DEBUG_SET_DIFFICULTY: { mode: DifficultyMode };
DEBUG_SET_GOD_MODE: { enabled: boolean };
DEBUG_SET_TIMESCALE: { factor: number }; // 0.5–3
DEBUG_SPAWN_ENEMY: { kind: 'swarmer' | 'detonator' | 'brute' };
DEBUG_KILL_ALL: void;
DEBUG_SET_MATURITY: { pct: number }; // only 100 is used by the UI
```

React never touches Phaser internals directly — `ArenaScene` subscribes to
each event and mutates its own live state, same boundary rule as every
other React→Phaser control today.

## Display scale (visual only)

- Current shipped `displaySize` values (player, swarmer, brute, detonator,
  canister) and `TREE.phaseSizes` are the reference point and correspond to
  menu tier **2**.
- Formula: `applied = shippedValue * (tier / 2)` for tiers `0.75 | 1 | 1.5 | 2`.
- **Visual only.** Applies to `setDisplaySize` calls (and the tree's
  phase-size draw) — physics bodies are untouched. This matches how the
  shipped 2.5x bump already works today: collision in `ArenaScene` runs on
  Phaser's default Arcade body (native sprite-frame size) for every entity,
  not on the `radius` fields in `config.ts` — those are declared but never
  read anywhere in `src/`. Wiring real per-entity hitboxes is out of scope
  for this feature; the scale slider does not change collision behavior.
- `config.ts` base values are untouched; the scale is a runtime multiplier
  layer applied on top of them.
- On tier change, resize immediately:
  - Player and tree are singletons — resize directly.
  - Enemies and canisters are pooled — iterate each pool's active members
    and call `setDisplaySize` on each.
  - Newly spawned entities after a tier change read the currently active
    tier.

## Difficulty override

- Menu shows **Easy / Medium / Advanced** — "Advanced" is a display label
  only, mapping to the existing `hard` key in `DIRECTOR_PRESETS`
  (`src/game/config.ts`). No new preset is added.
- Selecting a mode replaces `ArenaScene`'s `#director` field with a new
  `SpawnDirector(rng, DIRECTOR_PRESETS[mode])` — same constructor the title
  screen's choice already flows into (`ArenaScene.ts:201`); there is no
  live-mutable "set preset" method on `SpawnDirector`, so a fresh instance
  is created. Its elapsed-time counter restarts at 0, meaning unlock timers
  (`unlockAtSec`) restart too — acceptable for a debug tool, not something
  the title-screen path needs to handle.

## God mode

- Checkbox → `DEBUG_SET_GOD_MODE`.
- When enabled: incoming player damage is short-circuited to 0. There are
  two existing HP-reduction call sites in `ArenaScene` — melee contact
  (`~line 874`) and the detonator explosion (`~line 1119`) — both must be
  guarded, since there is no single chokepoint function today. All three
  weapons skip reserve-regen gating and clip-empty checks (infinite clip
  and reserve, no reload state).
- Disabling it removes the short-circuit; normal HP/ammo rules resume from
  whatever state they're currently in — no snapshot/restore needed.

## Extra modifiers

- **Timescale** (0.5x–3x slider): sets `this.time.timeScale` and
  `this.physics.world.timeScale` on `ArenaScene`. Independent of the
  display-scale slider — this changes simulation speed, not size.
- **Force-spawn**: three buttons (Swarmer / Detonator / Brute) call
  `ArenaScene`'s existing private `#spawnAtEdge(kind)` directly, bypassing
  the threat-budget gate — the same single-spawn entry point the director
  loop already calls.
- **Kill All**: iterates the active enemy pool and, per enemy, replicates
  the existing kill sequence used elsewhere in `ArenaScene` (e.g. the
  bullet-overlap handler): `EnemyPool.kill(enemy)`, `#handleKillDrop`,
  particle splatter, kill-count increment, and the kill sound. `kill()`
  alone only deactivates the body — the loot/score/fx side effects are
  currently the caller's responsibility at every call site, not bundled
  into one function, so Kill All must replicate the full sequence rather
  than call a single "kill" helper.
- **Force 100% maturity**: calls the existing `TreeSystem.deliver(pct)`
  with enough `pct` to reach 100%, then routes its result through
  `ArenaScene`'s existing `#triggerGeneration` when `generationTriggered`
  is true — the same path catalyst delivery already uses (`ArenaScene.ts:
  706-710`). No bypass of the upgrade-draft flow.

## Testing

- Vitest unit tests: PIN hash set/verify roundtrip; scale-factor formula at
  all four tiers; god-mode damage/ammo short-circuit logic.
- Manual browser verification (per project convention for UI changes):
  key trigger, PIN flow on first run vs. returning, live pool resize
  visually, difficulty swap mid-run, timescale, force-spawn/kill-all,
  instant maturity → draft flow.

## Explicitly out of scope

- PIN reset/recovery flow.
- Attempt limiting or lockout on wrong PIN.
- Persisting menu control state (scale/difficulty/timescale/god mode)
  across a full page reload — each session starts from shipped defaults
  until the menu is opened and changed again.
