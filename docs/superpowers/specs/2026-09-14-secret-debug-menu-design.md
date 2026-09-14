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

## Display + hitbox scale

- Current shipped `displaySize` values (player, swarmer, brute, detonator,
  canister) and `TREE.phaseSizes` are the reference point and correspond to
  menu tier **2**.
- Formula: `applied = shippedValue * (tier / 2)` for tiers `0.75 | 1 | 1.5 | 2`.
- Applies uniformly to **both** the sprite's display size and its physics
  body (radius/size) — selecting a tier changes real hitboxes, not just
  visuals.
- `config.ts` base values are untouched; the scale is a runtime multiplier
  layer applied on top of them.
- On tier change, resize immediately:
  - Player and tree are singletons — resize directly.
  - Enemies and canisters are pooled — iterate each pool's active members
    and call `setDisplaySize` + resize the Arcade body (`setCircle`/
    `setSize`) on each.
  - Newly spawned entities after a tier change read the currently active
    tier.

## Difficulty override

- Menu shows **Easy / Medium / Advanced** — "Advanced" is a display label
  only, mapping to the existing `hard` key in `DIRECTOR_PRESETS`
  (`src/game/config.ts`). No new preset is added.
- Selecting a mode calls the spawn director's existing preset-apply path
  with `DIRECTOR_PRESETS[mode]` live, mid-run — the same object the title
  screen already picks from.

## God mode

- Checkbox → `DEBUG_SET_GOD_MODE`.
- When enabled: incoming player damage is short-circuited to 0 before the
  existing HP-change logic runs. All three weapons skip reserve-regen
  gating and clip-empty checks (infinite clip and reserve, no reload
  state).
- Disabling it removes the short-circuit; normal HP/ammo rules resume from
  whatever state they're currently in — no snapshot/restore needed.

## Extra modifiers

- **Timescale** (0.5x–3x slider): sets `this.time.timeScale` and
  `this.physics.world.timeScale` on `ArenaScene`. Independent of the
  display-scale slider — this changes simulation speed, not size.
- **Force-spawn**: three buttons (Swarmer / Detonator / Brute) call the
  spawn director's existing single-spawn path directly, bypassing the
  threat-budget gate.
- **Kill All**: iterates the active enemy pool and runs each enemy through
  its normal death path (loot drops, pool return) — no special-cased
  instant despawn.
- **Force 100% maturity**: sets tree maturity to 100% and fires the
  existing Generation-reached path (draft cards etc.) exactly as natural
  growth would — no bypass of the upgrade-draft flow.

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
