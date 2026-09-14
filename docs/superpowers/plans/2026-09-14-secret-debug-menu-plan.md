# Secret Debug Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a PIN-gated debug overlay (backtick key) with display-scale, live difficulty override, god mode, timescale, force-spawn/kill-all, and instant-maturity controls, per `docs/superpowers/specs/2026-09-14-secret-debug-menu-design.md`.

**Architecture:** Two pure/testable TypeScript modules (`pinAuth.ts`, `scale.ts`) hold the logic that doesn't need Phaser or the DOM. A new React modal (`DebugMenu.tsx`) owns the PIN gate and control UI, mounted in `Hud.tsx` next to the existing `PauseModal`. `ArenaScene` gains a backtick key listener and subscribes to eight new bus events, one per control, matching the existing single-purpose event convention (`TOGGLE_PAUSE`, `RESTART_SIMULATION`).

**Tech Stack:** TypeScript (strict, no `any`), React 19, Phaser 4 Arcade Physics, Vitest, Tailwind v4 (`@theme` tokens: `sand-*`, `tether`, `grace`, `decay`, `growth`).

## Global Constraints

- No `any` anywhere; prefer `unknown` + narrowing (project CLAUDE.md).
- No CSS files/modules — Tailwind utilities only, using existing `@theme` tokens.
- React never reads Phaser state directly and never mutates it directly — every control crosses `src/game/eventBus.ts`.
- `config.ts` base values are never edited by this feature — the scale slider is a runtime multiplier layer on top of them.
- Vitest specs sit next to the module they cover (`Foo.ts` / `Foo.test.ts`), pure-TS modules only — `ArenaScene.ts`, `Player.ts`, `EnemyPool.ts`, `CanisterPool.ts`, and every `.tsx` file have no automated tests in this codebase (Phaser/DOM-dependent); those changes are verified manually via `npm run dev` in a browser, per each task's manual-verification step.
- Commit only files relevant to that task; commit messages follow `type(scope): summary` (this repo's convention — `feat`, `fix`, `chore`, `refactor`, `docs`, `test`).
- Display-scale reference: shipped `displaySize`/`TREE.phaseSizes` values = menu tier **2**. Formula: `applied = shippedValue * (tier / 2)`.
- Scale is **visual only** — no physics-body/hitbox change (confirmed during spec review: `config.ts`'s `radius` fields are dead code, never read anywhere in `src/`; collision runs on Phaser's default Arcade body for every entity today).

---

## File Structure

New files:
- `src/game/debug/pinAuth.ts` — PIN hashing/storage (pure logic, `Storage`-injectable).
- `src/game/debug/pinAuth.test.ts`
- `src/game/debug/scale.ts` — the scale-tier formula (pure).
- `src/game/debug/scale.test.ts`
- `src/game/eventBus.test.ts` — smoke tests for the new bus events (no test file exists for the bus today).
- `src/hud/DebugMenu.tsx` — PIN gate + control panel, mounted in `Hud.tsx`.

Modified files (touched across multiple tasks below, each change scoped to that task):
- `src/game/eventBus.ts` — eight new event types.
- `src/game/systems/WeaponInventory.ts` + `.test.ts` — god-mode support.
- `src/game/entities/Player.ts` — scale-tier-aware display size.
- `src/game/entities/EnemyPool.ts` — scale-tier-aware display size.
- `src/game/entities/CanisterPool.ts` — scale-tier-aware display size (future spawns only — see Task 8 note on in-flight tweens).
- `src/game/scenes/ArenaScene.ts` — backtick key, pause integration, and one bus subscription per control.
- `src/hud/Hud.tsx` — mount `<DebugMenu />`.
- `WALKTHROUGH.md` — document the backtick trigger (Task 12).

---

### Task 1: PIN auth module

**Files:**
- Create: `src/game/debug/pinAuth.ts`
- Test: `src/game/debug/pinAuth.test.ts`

**Interfaces:**
- Produces: `class PinAuth { constructor(storage?: Storage); hasPin(): boolean; setPin(pin: string): Promise<void>; verifyPin(pin: string): Promise<boolean>; }` and `export const pinAuth: PinAuth` (default instance backed by `window.localStorage`, for `DebugMenu.tsx` to import in Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/game/debug/pinAuth.test.ts
import { beforeEach, describe, expect, it } from 'vitest';
import { PinAuth } from './pinAuth';

describe('PinAuth', () => {
  let store: Record<string, string>;
  let mockStorage: Storage;
  let auth: PinAuth;

  beforeEach(() => {
    store = {};
    mockStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {
        store = {};
      },
      key: () => null,
      length: 0,
    } as Storage;
    auth = new PinAuth(mockStorage);
  });

  it('reports no PIN set initially', () => {
    expect(auth.hasPin()).toBe(false);
  });

  it('reports a PIN set after setPin resolves', async () => {
    await auth.setPin('1234');
    expect(auth.hasPin()).toBe(true);
  });

  it('verifies the correct PIN', async () => {
    await auth.setPin('4269');
    await expect(auth.verifyPin('4269')).resolves.toBe(true);
  });

  it('rejects an incorrect PIN', async () => {
    await auth.setPin('4269');
    await expect(auth.verifyPin('0000')).resolves.toBe(false);
  });

  it('rejects any PIN when none has been set', async () => {
    await expect(auth.verifyPin('1234')).resolves.toBe(false);
  });

  it('never stores the PIN in plaintext', async () => {
    await auth.setPin('1234');
    const serialized = JSON.stringify(store);
    expect(serialized).not.toContain('1234');
  });

  it('two PinAuth instances sharing storage agree on the same PIN', async () => {
    await auth.setPin('7777');
    const second = new PinAuth(mockStorage);
    expect(second.hasPin()).toBe(true);
    await expect(second.verifyPin('7777')).resolves.toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- pinAuth`
Expected: FAIL — `Cannot find module './pinAuth'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/game/debug/pinAuth.ts
/**
 * PIN gate for the secret debug menu. Hashes the PIN with a per-install
 * random salt before persisting -- this deters casual discovery via
 * localStorage in devtools, it is not a real access-control boundary (see
 * docs/superpowers/specs/2026-09-14-secret-debug-menu-design.md).
 */

const HASH_KEY = 'fat_debug_pin_hash';
const SALT_KEY = 'fat_debug_pin_salt';

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomSaltHex(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return toHex(bytes.buffer);
}

async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return toHex(digest);
}

export class PinAuth {
  readonly #storage: Storage | null;

  constructor(storage?: Storage) {
    if (storage) {
      this.#storage = storage;
    } else if (typeof window !== 'undefined' && window.localStorage) {
      this.#storage = window.localStorage;
    } else {
      this.#storage = null;
    }
  }

  hasPin(): boolean {
    return this.#storage?.getItem(HASH_KEY) != null;
  }

  async setPin(pin: string): Promise<void> {
    if (!this.#storage) return;
    const salt = randomSaltHex();
    const hash = await hashPin(pin, salt);
    this.#storage.setItem(SALT_KEY, salt);
    this.#storage.setItem(HASH_KEY, hash);
  }

  async verifyPin(pin: string): Promise<boolean> {
    if (!this.#storage) return false;
    const salt = this.#storage.getItem(SALT_KEY);
    const storedHash = this.#storage.getItem(HASH_KEY);
    if (!salt || !storedHash) return false;
    const hash = await hashPin(pin, salt);
    return hash === storedHash;
  }
}

export const pinAuth = new PinAuth();
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- pinAuth`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/debug/pinAuth.ts src/game/debug/pinAuth.test.ts
git commit -m "$(cat <<'EOF'
feat(debug): add PIN auth module for the secret debug menu

Hashes the PIN with a per-install salt before persisting to
localStorage; never stores plaintext. Storage is injectable for tests.
EOF
)"
```

---

### Task 2: Scale-tier module

**Files:**
- Create: `src/game/debug/scale.ts`
- Test: `src/game/debug/scale.test.ts`

**Interfaces:**
- Produces: `export const SCALE_TIERS: readonly [0.75, 1, 1.5, 2]`, `export type ScaleTier = 0.75 | 1 | 1.5 | 2`, `export function applyScaleTier(shippedValue: number, tier: ScaleTier): number`. Consumed by `eventBus.ts` (Task 4), `Player.ts`/`EnemyPool.ts`/`CanisterPool.ts`/`ArenaScene.ts` (Task 8), and `DebugMenu.tsx` (Task 5/8).

- [ ] **Step 1: Write the failing tests**

```typescript
// src/game/debug/scale.test.ts
import { describe, expect, it } from 'vitest';
import { applyScaleTier, SCALE_TIERS } from './scale';

describe('applyScaleTier', () => {
  it('lists the four menu tiers in ascending order', () => {
    expect(SCALE_TIERS).toEqual([0.75, 1, 1.5, 2]);
  });

  it('reproduces the shipped value exactly at tier 2 (today\'s default)', () => {
    expect(applyScaleTier(100, 2)).toBe(100);
    expect(applyScaleTier(90, 2)).toBe(90);
  });

  it('halves the shipped value at tier 1', () => {
    expect(applyScaleTier(100, 1)).toBe(50);
  });

  it('scales proportionally at 0.75 and 1.5', () => {
    expect(applyScaleTier(100, 0.75)).toBe(37.5);
    expect(applyScaleTier(100, 1.5)).toBe(75);
  });

  it('scales the tree phase sizes from config', () => {
    expect(applyScaleTier(400, 2)).toBe(400);
    expect(applyScaleTier(400, 1)).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- scale.test`
Expected: FAIL — `Cannot find module './scale'`.

- [ ] **Step 3: Write the implementation**

```typescript
// src/game/debug/scale.ts
/**
 * Display-scale tiers for the secret debug menu. Shipped `displaySize` /
 * `TREE.phaseSizes` values in config.ts are the reference point and
 * correspond to tier 2 -- see
 * docs/superpowers/specs/2026-09-14-secret-debug-menu-design.md.
 */

export const SCALE_TIERS = [0.75, 1, 1.5, 2] as const;
export type ScaleTier = (typeof SCALE_TIERS)[number];

export function applyScaleTier(shippedValue: number, tier: ScaleTier): number {
  return shippedValue * (tier / 2);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- scale.test`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/debug/scale.ts src/game/debug/scale.test.ts
git commit -m "$(cat <<'EOF'
feat(debug): add display-scale tier formula

Pure function mapping the debug menu's 0.75x/1x/1.5x/2x tiers onto
config.ts's shipped displaySize/phaseSizes values, which are tier 2.
EOF
)"
```

---

### Task 3: God-mode support in WeaponInventory

**Files:**
- Modify: `src/game/systems/WeaponInventory.ts`
- Modify: `src/game/systems/WeaponInventory.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `WeaponInventory.setGodMode(enabled: boolean): void`. Consumed by `ArenaScene.ts` in Task 6.

- [ ] **Step 1: Write the failing tests**

Add to `src/game/systems/WeaponInventory.test.ts` (inside the existing `describe('WeaponInventory', ...)` block, after the last `it`):

```typescript
  it('god mode: tryFire always succeeds without consuming the clip', () => {
    inv.setGodMode(true);
    for (let i = 0; i < 50; i += 1) {
      expect(inv.tryFire()).toBe(true);
    }
    expect(inv.activeAmmo).toEqual({ clip: 24, reserve: 240, reloading: false });
  });

  it('god mode: reports full ammo even if the underlying reserve was drained first', () => {
    inv.setReserveForTest('carbine', 0);
    inv.setGodMode(true);
    expect(inv.activeReserve).toBe(240);
    expect(inv.activeClip).toBe(24);
    expect(inv.isReloading).toBe(false);
  });

  it('god mode: disabling it restores the real underlying ammo state', () => {
    inv.setReserveForTest('carbine', 5);
    inv.setGodMode(true);
    expect(inv.activeReserve).toBe(240);
    inv.setGodMode(false);
    expect(inv.activeReserve).toBe(5);
  });

  it('god mode: firing while enabled leaves the real clip untouched for when it is disabled', () => {
    inv.setGodMode(true);
    inv.tryFire();
    inv.tryFire();
    inv.setGodMode(false);
    expect(inv.activeClip).toBe(24);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- WeaponInventory`
Expected: FAIL — `inv.setGodMode is not a function`.

- [ ] **Step 3: Write the implementation**

In `src/game/systems/WeaponInventory.ts`, add a field and a setter, and guard the four places that read or mutate ammo state:

```typescript
export class WeaponInventory {
  #activeId: WeaponId = 'carbine';
  readonly #unlocked = new Set<WeaponId>(['carbine']);
  #godMode = false;

  // ... existing #clips / #reserves / #reloadRemainingMs fields unchanged ...

  setGodMode(enabled: boolean): void {
    this.#godMode = enabled;
  }
```

Change `getAmmo`:

```typescript
  getAmmo(id: WeaponId): { clip: number; reserve: number; reloading: boolean } {
    if (this.#godMode) {
      const cfg = WEAPON_CONFIGS[id];
      return { clip: cfg.magSize, reserve: cfg.reserveCap, reloading: false };
    }
    return {
      clip: this.#clips[id],
      reserve: this.#reserves[id],
      reloading: this.#reloadRemainingMs[id] > 0,
    };
  }
```

Change the three scalar getters to route through `getAmmo` so they can't drift from it:

```typescript
  get activeClip(): number {
    return this.getAmmo(this.#activeId).clip;
  }

  get activeReserve(): number {
    return this.getAmmo(this.#activeId).reserve;
  }

  get isReloading(): boolean {
    return this.getAmmo(this.#activeId).reloading;
  }
```

Change `tryFire` to short-circuit before any mutation, so the real clip is never touched while god mode is on:

```typescript
  tryFire(): boolean {
    if (this.#godMode) return true;

    const id = this.#activeId;
    if (this.#reloadRemainingMs[id] > 0 || this.#clips[id] <= 0) return false;

    this.#clips[id] -= 1;
    if (this.#clips[id] === 0) this.startReload();
    return true;
  }
```

Change `startReload` to no-op under god mode (nothing to reload, display already reports full):

```typescript
  startReload(): void {
    if (this.#godMode) return;
    const id = this.#activeId;
    const cfg = WEAPON_CONFIGS[id];
    if (this.#reloadRemainingMs[id] > 0 || this.#clips[id] >= cfg.magSize) return;
    this.#reloadRemainingMs[id] = cfg.reloadMs;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- WeaponInventory`
Expected: PASS, all tests including the 4 new ones.

- [ ] **Step 5: Commit**

```bash
git add src/game/systems/WeaponInventory.ts src/game/systems/WeaponInventory.test.ts
git commit -m "$(cat <<'EOF'
feat(debug): add god-mode infinite ammo to WeaponInventory

tryFire short-circuits before mutating the real clip, so disabling
god mode restores whatever ammo state existed before it was enabled.
EOF
)"
```

---

### Task 4: Debug bus events

**Files:**
- Modify: `src/game/eventBus.ts`
- Create: `src/game/eventBus.test.ts`

**Interfaces:**
- Consumes: `ScaleTier` from `../debug/scale` (Task 2), `DifficultyMode` from `./config`, `MutantKind` from `./systems/SpawnDirector`.
- Produces (new `GameEvents` members): `DEBUG_MENU_TOGGLED: { open: boolean }`, `DEBUG_SET_SCALE: { tier: ScaleTier }`, `DEBUG_SET_DIFFICULTY: { mode: DifficultyMode }`, `DEBUG_SET_GOD_MODE: { enabled: boolean }`, `DEBUG_SET_TIMESCALE: { factor: number }`, `DEBUG_SPAWN_ENEMY: { kind: MutantKind }`, `DEBUG_KILL_ALL: void`, `DEBUG_SET_MATURITY: { pct: number }`. Consumed by `DebugMenu.tsx` (Task 5+) and `ArenaScene.ts` (Task 6+).

Note: the design spec used the placeholder name `DEBUG_MENU_OPENED: void`; this task uses `DEBUG_MENU_TOGGLED: { open: boolean }` instead, decided during planning — a toggle payload lets `DebugMenu.tsx` mirror open/closed state directly from one event instead of tracking two.

- [ ] **Step 1: Write the failing test**

```typescript
// src/game/eventBus.test.ts
import { describe, expect, it } from 'vitest';
import { bus } from './eventBus';

describe('eventBus: debug menu events', () => {
  it('delivers DEBUG_MENU_TOGGLED and DEBUG_SET_SCALE payloads', () => {
    let toggled: { open: boolean } | undefined;
    let scale: { tier: number } | undefined;
    const onToggle = (p: { open: boolean }) => {
      toggled = p;
    };
    const onScale = (p: { tier: 0.75 | 1 | 1.5 | 2 }) => {
      scale = p;
    };

    bus.on('DEBUG_MENU_TOGGLED', onToggle);
    bus.on('DEBUG_SET_SCALE', onScale);
    bus.emit('DEBUG_MENU_TOGGLED', { open: true });
    bus.emit('DEBUG_SET_SCALE', { tier: 1.5 });
    bus.off('DEBUG_MENU_TOGGLED', onToggle);
    bus.off('DEBUG_SET_SCALE', onScale);

    expect(toggled).toEqual({ open: true });
    expect(scale).toEqual({ tier: 1.5 });
  });

  it('delivers DEBUG_SET_GOD_MODE, DEBUG_KILL_ALL, and DEBUG_SET_MATURITY', () => {
    let god: boolean | undefined;
    let killAllFired = false;
    let maturityPct: number | undefined;
    const onGod = (p: { enabled: boolean }) => {
      god = p.enabled;
    };
    const onKillAll = () => {
      killAllFired = true;
    };
    const onMaturity = (p: { pct: number }) => {
      maturityPct = p.pct;
    };

    bus.on('DEBUG_SET_GOD_MODE', onGod);
    bus.on('DEBUG_KILL_ALL', onKillAll);
    bus.on('DEBUG_SET_MATURITY', onMaturity);
    bus.emit('DEBUG_SET_GOD_MODE', { enabled: true });
    bus.emit('DEBUG_KILL_ALL');
    bus.emit('DEBUG_SET_MATURITY', { pct: 100 });
    bus.off('DEBUG_SET_GOD_MODE', onGod);
    bus.off('DEBUG_KILL_ALL', onKillAll);
    bus.off('DEBUG_SET_MATURITY', onMaturity);

    expect(god).toBe(true);
    expect(killAllFired).toBe(true);
    expect(maturityPct).toBe(100);
  });

  it('delivers DEBUG_SET_DIFFICULTY, DEBUG_SET_TIMESCALE, and DEBUG_SPAWN_ENEMY', () => {
    let mode: string | undefined;
    let factor: number | undefined;
    let kind: string | undefined;
    const onDifficulty = (p: { mode: string }) => {
      mode = p.mode;
    };
    const onTimescale = (p: { factor: number }) => {
      factor = p.factor;
    };
    const onSpawn = (p: { kind: string }) => {
      kind = p.kind;
    };

    bus.on('DEBUG_SET_DIFFICULTY', onDifficulty);
    bus.on('DEBUG_SET_TIMESCALE', onTimescale);
    bus.on('DEBUG_SPAWN_ENEMY', onSpawn);
    bus.emit('DEBUG_SET_DIFFICULTY', { mode: 'easy' });
    bus.emit('DEBUG_SET_TIMESCALE', { factor: 2 });
    bus.emit('DEBUG_SPAWN_ENEMY', { kind: 'brute' });
    bus.off('DEBUG_SET_DIFFICULTY', onDifficulty);
    bus.off('DEBUG_SET_TIMESCALE', onTimescale);
    bus.off('DEBUG_SPAWN_ENEMY', onSpawn);

    expect(mode).toBe('easy');
    expect(factor).toBe(2);
    expect(kind).toBe('brute');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- eventBus`
Expected: FAIL to typecheck / FAIL at runtime — the event names don't exist on `GameEvents` yet (mitt allows emitting unknown string keys at runtime, but `npm run build`'s `tsc -b` would reject it; run `npm run build` too and confirm a type error on the new event names before proceeding).

- [ ] **Step 3: Write the implementation**

In `src/game/eventBus.ts`, add imports and extend `GameEvents`:

```typescript
import mitt from 'mitt';
import type { DifficultyMode } from './config';
import type { ScaleTier } from './debug/scale';
import type { MutantKind } from './systems/SpawnDirector';
```

Add to the `GameEvents` type, in the `// React -> Phaser` section:

```typescript
  // React -> Phaser (debug menu)
  DEBUG_MENU_TOGGLED: { open: boolean };
  DEBUG_SET_SCALE: { tier: ScaleTier };
  DEBUG_SET_DIFFICULTY: { mode: DifficultyMode };
  DEBUG_SET_GOD_MODE: { enabled: boolean };
  DEBUG_SET_TIMESCALE: { factor: number };
  DEBUG_SPAWN_ENEMY: { kind: MutantKind };
  DEBUG_KILL_ALL: void;
  DEBUG_SET_MATURITY: { pct: number };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- eventBus && npm run build`
Expected: PASS, 3 tests; build succeeds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add src/game/eventBus.ts src/game/eventBus.test.ts
git commit -m "$(cat <<'EOF'
feat(debug): add eight debug-menu bus events

One event per control, matching the existing single-purpose
convention (TOGGLE_PAUSE, RESTART_SIMULATION) rather than one
discriminated-union event.
EOF
)"
```

---

### Task 5: DebugMenu shell — PIN gate, mount, and backtick trigger

**Files:**
- Create: `src/hud/DebugMenu.tsx`
- Modify: `src/hud/Hud.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `bus` (`../game/eventBus`), `pinAuth` (`../game/debug/pinAuth`).
- Produces: `<DebugMenu />` component, rendering nothing (`null`) until `DEBUG_MENU_TOGGLED` fires `{ open: true }`. Once authenticated in a session it stays authenticated until the tab is closed. Tasks 6-11 will add controls inside the `screen === 'menu'` branch this task creates.

No automated test — `.tsx` components and `ArenaScene.ts` are Phaser/DOM-dependent and untested in this codebase (see Global Constraints). Verified manually below.

- [ ] **Step 1: Add the backtick key and pause integration to ArenaScene**

In `src/game/scenes/ArenaScene.ts`, add a new field near the other key fields (after `#pKey?: Phaser.Input.Keyboard.Key;`, around line 87):

```typescript
  #pKey?: Phaser.Input.Keyboard.Key;
  #backtickKey?: Phaser.Input.Keyboard.Key;
  #debugMenuOpen = false;
```

Register the key in `create()`, in the same block that adds `#escKey`/`#pKey` (around line 335):

```typescript
      this.#escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.#pKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
      this.#backtickKey = keyboard.addKey(
        Phaser.Input.Keyboard.KeyCodes.BACKTICK,
      );
```

Reset `#debugMenuOpen` in `create()`'s reset block, next to `this.#isPaused = false;` (around line 212):

```typescript
    this.#isPaused = false;
    this.#debugMenuOpen = false;
```

In `update()`, add the backtick check right after the existing esc/p pause check (around line 562-568, inside the `if (!this.#over && !this.#pausedForDraft) { ... }` block):

```typescript
    if (!this.#over && !this.#pausedForDraft) {
      if (
        (this.#escKey && Phaser.Input.Keyboard.JustDown(this.#escKey)) ||
        (this.#pKey && Phaser.Input.Keyboard.JustDown(this.#pKey))
      ) {
        bus.emit('TOGGLE_PAUSE');
      }
      if (
        this.#backtickKey &&
        Phaser.Input.Keyboard.JustDown(this.#backtickKey)
      ) {
        this.#debugMenuOpen = !this.#debugMenuOpen;
        this.#isPaused = this.#debugMenuOpen;
        if (this.#debugMenuOpen) {
          this.physics.pause();
          this.#audio.setMusicIntensity(false);
        } else {
          this.physics.resume();
          this.#audio.setMusicIntensity(true);
        }
        bus.emit('DEBUG_MENU_TOGGLED', { open: this.#debugMenuOpen });
      }
    }
```

This deliberately does not emit `TOGGLE_PAUSE` — that event also drives `PauseModal`'s visibility, and opening the debug menu must not show the Pause overlay at the same time. The debug menu pauses physics/music directly, the same way `onTogglePause` already does.

- [ ] **Step 2: Create the DebugMenu component (PIN gate only)**

```tsx
// src/hud/DebugMenu.tsx
/** Secret PIN-gated debug overlay. Backtick to open, z-30 modal layer. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import { pinAuth } from '../game/debug/pinAuth';

type Screen = 'set-1' | 'set-2' | 'enter' | 'menu';

const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

export function DebugMenu() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [digits, setDigits] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    const onToggle = ({ open: nowOpen }: { open: boolean }) => {
      setOpen(nowOpen);
      setDigits('');
      setFirstPin('');
      setError(false);
    };
    bus.on('DEBUG_MENU_TOGGLED', onToggle);
    return () => bus.off('DEBUG_MENU_TOGGLED', onToggle);
  }, []);

  if (!open) return null;

  const screen: Screen = authenticated
    ? 'menu'
    : pinAuth.hasPin()
      ? 'enter'
      : firstPin
        ? 'set-2'
        : 'set-1';

  const press = (digit: string) => {
    if (digits.length >= 4) return;
    const next = digits + digit;
    setDigits(next);
    if (next.length !== 4) return;

    if (screen === 'set-1') {
      setFirstPin(next);
      setDigits('');
      return;
    }

    if (screen === 'set-2') {
      if (next === firstPin) {
        void pinAuth.setPin(next).then(() => setAuthenticated(true));
      } else {
        setError(true);
        setFirstPin('');
        setDigits('');
      }
      return;
    }

    // screen === 'enter'
    void pinAuth.verifyPin(next).then((ok) => {
      if (ok) {
        setAuthenticated(true);
      } else {
        setError(true);
        setDigits('');
      }
    });
  };

  const backspace = () => setDigits((prev) => prev.slice(0, -1));

  const title =
    screen === 'set-1'
      ? 'Set Admin PIN'
      : screen === 'set-2'
        ? 'Confirm PIN'
        : 'Enter PIN';

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-xs">
      {screen === 'menu' ? (
        <div className="flex max-h-[92%] w-[420px] flex-col gap-3 overflow-y-auto border border-tether bg-sand-900 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide text-white">
              DEBUG MENU <span className="font-normal text-white/30">— paused</span>
            </h2>
            <span className="text-xs text-white/30">` close</span>
          </div>
          {/* Tasks 6-11 add controls here */}
        </div>
      ) : (
        <div className="w-[280px] border border-tether bg-sand-900 p-5">
          <p className="text-[10px] tracking-widest text-tether uppercase">
            Admin Access
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
          {screen === 'set-1' && (
            <p className="mt-1 text-xs text-white/40">
              No PIN set on this PC. Choose a 4-digit PIN.
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-decay">
              {screen === 'enter' ? 'Incorrect PIN.' : 'PINs did not match.'}{' '}
              Try again.
            </p>
          )}
          <div className="mt-4 flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-3.5 w-3.5 rounded-full border-2 ${
                  i < digits.length
                    ? 'border-tether bg-tether'
                    : 'border-tether'
                }`}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {KEYPAD_ROWS.flat().map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/70 hover:border-tether"
              >
                {digit}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => press('0')}
              className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/70 hover:border-tether"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/40 hover:border-tether"
            >
              ⌫
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-white/30">
            ` to close
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Mount it in Hud.tsx**

In `src/hud/Hud.tsx`, add the import next to the other modal imports:

```typescript
import { DebugMenu } from './DebugMenu';
```

Add it next to `<PauseModal />` (it renders `null` when closed, so ordering doesn't matter, but keep modals grouped):

```tsx
      <DraftModal />
      <GameOverCard />
      <PauseModal />
      <DebugMenu />
```

- [ ] **Step 4: Manual verification**

Run: `npm run dev`, open the browser, pick any difficulty to start a run.

1. Press `` ` `` — the sim pauses (enemies freeze) and the "Set Admin PIN" screen appears (since no PIN exists yet in a fresh browser profile).
2. Enter a 4-digit PIN via the on-screen keypad, then confirm it with the same 4 digits — the screen switches to a bare "DEBUG MENU" panel with just the close hint (no controls yet).
3. Press `` ` `` again — the menu closes, physics resumes.
4. Press `` ` `` again — this time "Enter PIN" appears (PIN already set). Enter the wrong PIN — see "Incorrect PIN. Try again.", dots clear. Enter the correct PIN — the menu panel appears.
5. Reload the page, start a new run, press `` ` `` — "Enter PIN" appears again (PIN persisted across reload via localStorage), confirming re-authentication is required after a fresh page load but not after merely closing/reopening the menu within the same session.

- [ ] **Step 5: Commit**

```bash
git add src/hud/DebugMenu.tsx src/hud/Hud.tsx src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(debug): add PIN-gated debug menu shell with backtick trigger

Backtick opens/closes the overlay and pauses the sim directly
(without going through TOGGLE_PAUSE, which would also surface the
Pause modal). No controls yet -- just the PIN set/enter flow and an
empty menu panel for later tasks to fill in.
EOF
)"
```

---

### Task 6: God Mode control (end-to-end)

**Files:**
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DEBUG_SET_GOD_MODE` (Task 4), `WeaponInventory.setGodMode` (Task 3).

- [ ] **Step 1: Add the checkbox to DebugMenu.tsx**

Add state and emit near the top of the component (after the existing `useState` declarations):

```typescript
  const [godMode, setGodMode] = useState(false);
```

Replace the `{/* Tasks 6-11 add controls here */}` comment in the `screen === 'menu'` branch with:

```tsx
          <div className="flex items-center justify-between border border-sand-800 bg-sand-950 p-3">
            <div>
              <p className="text-[10px] tracking-wider text-grace uppercase">
                God Mode
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                No damage + infinite ammo
              </p>
            </div>
            <input
              type="checkbox"
              checked={godMode}
              onChange={(e) => {
                setGodMode(e.target.checked);
                bus.emit('DEBUG_SET_GOD_MODE', { enabled: e.target.checked });
              }}
              className="h-5 w-5 accent-grace"
            />
          </div>
```

- [ ] **Step 2: Wire ArenaScene**

Add a field (near `#debugMenuOpen`):

```typescript
  #godMode = false;
```

Reset it in `create()`'s reset block:

```typescript
    this.#debugMenuOpen = false;
    this.#godMode = false;
```

Guard the two damage call sites. In `#takeMeleeFrom` (around line 863):

```typescript
  #takeMeleeFrom(enemy: Phaser.Physics.Arcade.Image): void {
    if (this.#over || this.#godMode || !enemy.active) return;
```

In `#takeExplosionDamage` (around line 1116):

```typescript
  #takeExplosionDamage(damage: number): void {
    if (this.#over || this.#godMode) return;
```

Subscribe in the same block as the other `bus.on(...)` calls (around line 540-543):

```typescript
    const onSetGodMode = ({ enabled }: { enabled: boolean }) => {
      this.#godMode = enabled;
      this.#weapons.setGodMode(enabled);
    };
    bus.on('DEBUG_SET_GOD_MODE', onSetGodMode);
```

And unsubscribe in the matching `SHUTDOWN` block (around line 545-551):

```typescript
      bus.off('DEBUG_SET_GOD_MODE', onSetGodMode);
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, start a run, unlock the debug menu (Task 5 flow).

1. Check the God Mode box, close the menu, walk into an enemy — no health-bar drop, no camera shake.
2. Fire until the clip would normally empty — ammo readout stays full, no reload triggers.
3. Uncheck God Mode — walk into an enemy again — health bar drops normally, confirming the guard only applies while the checkbox is on.

- [ ] **Step 4: Commit**

```bash
git add src/hud/DebugMenu.tsx src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(debug): wire God Mode control end-to-end

Guards the two existing HP-reduction call sites (melee, detonator
explosion) and forwards the flag to WeaponInventory for infinite ammo.
EOF
)"
```

---

### Task 7: Difficulty Override control (end-to-end)

**Files:**
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DEBUG_SET_DIFFICULTY` (Task 4), `DIRECTOR_PRESETS`, `DifficultyMode`, `isDifficultyMode` (`../config`, already imported in `ArenaScene.ts`), `SpawnDirector` (already imported).

- [ ] **Step 1: Add the control to DebugMenu.tsx**

Import the type and add state:

```typescript
import type { DifficultyMode } from '../game/config';
```

```typescript
  const [difficulty, setDifficulty] = useState<DifficultyMode>('hard');
```

Add a labels map at module scope (above the component):

```typescript
const DIFFICULTY_LABELS: Record<DifficultyMode, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Advanced',
};
```

Add the control block, after the God Mode block:

```tsx
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Difficulty Override
            </p>
            <div className="mt-2 flex gap-2">
              {(Object.keys(DIFFICULTY_LABELS) as DifficultyMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDifficulty(mode);
                      bus.emit('DEBUG_SET_DIFFICULTY', { mode });
                    }}
                    className={`cursor-pointer rounded px-3 py-1.5 text-xs ${
                      difficulty === mode
                        ? 'border border-tether bg-sand-800 text-tether'
                        : 'border border-sand-800 bg-sand-950 text-white/60'
                    }`}
                  >
                    {DIFFICULTY_LABELS[mode]}
                  </button>
                ),
              )}
            </div>
          </div>
```

- [ ] **Step 2: Wire ArenaScene**

`SpawnDirector` has no live "set preset" method — its config is fixed at construction — so overriding it means constructing a fresh instance and replacing the scene's `#director` field. Also update the registry key that `#difficultyMode()` reads, so a Restart after this change (which calls `create()` again) keeps using the overridden mode rather than reverting to the title screen's original choice.

Subscribe alongside the other debug handlers:

```typescript
    const onSetDifficulty = ({ mode }: { mode: DifficultyMode }) => {
      this.game.registry.set('difficulty', mode);
      this.#director = new SpawnDirector(Math.random, DIRECTOR_PRESETS[mode]);
    };
    bus.on('DEBUG_SET_DIFFICULTY', onSetDifficulty);
```

Unsubscribe in `SHUTDOWN`:

```typescript
      bus.off('DEBUG_SET_DIFFICULTY', onSetDifficulty);
```

Note: replacing `#director` restarts its internal elapsed-time counter at 0, so mutant unlock timers (`unlockAtSec`) restart too. Acceptable for a debug tool — flagged in the design spec.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, start on Easy, unlock the debug menu.

1. Click "Advanced" — within a few seconds, Brutes/Detonators that were previously locked (Easy unlocks them at 140s/260s) should be able to spawn immediately, since Advanced (`hard`) unlocks everything at 45s/90s and the fresh director's clock starts at 0.
2. Trigger Restart (via the Pause modal, not the debug menu) — the new run should still ramp at Advanced's pace, confirming the registry update stuck.

- [ ] **Step 4: Commit**

```bash
git add src/hud/DebugMenu.tsx src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(debug): wire Difficulty Override control end-to-end

Replaces the scene's SpawnDirector with a fresh instance built from
the chosen preset (there is no live preset setter) and updates the
registry so a subsequent Restart keeps the override.
EOF
)"
```

---

### Task 8: Display Scale control (end-to-end)

**Files:**
- Modify: `src/game/entities/Player.ts`
- Modify: `src/game/entities/EnemyPool.ts`
- Modify: `src/game/entities/CanisterPool.ts`
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `applyScaleTier`, `ScaleTier` (Task 2), `DEBUG_SET_SCALE` (Task 4).
- Produces: `Player.rescale(tier: ScaleTier): void`, `EnemyPool.setScaleTier(tier: ScaleTier): void`, `CanisterPool.setScaleTier(tier: ScaleTier): void`.

Scope note: canisters that are already in flight when the tier changes are **not** live-resized — `CanisterPool.eject()` runs a scale *tween* (the pickup "bounce", `CanisterPool.ts:81-96`) directly on `scaleX`/`scaleY` after `setDisplaySize`, so forcing a new display size on an active canister would fight that tween. Only canisters ejected after the tier change use the new size. Player and enemies have no competing scale tweens, so those resize immediately, matching the spec.

- [ ] **Step 1: Add scale-tier awareness to Player**

In `src/game/entities/Player.ts`, import the helpers and add a field:

```typescript
import { applyScaleTier, type ScaleTier } from '../debug/scale';
```

```typescript
  #scaleTier: ScaleTier = 2;
```

Replace the two hardcoded `setDisplaySize(PLAYER.displaySize, PLAYER.displaySize)` calls (constructor line 30, `#spawnGhost` line 115) with a shared computed value, and add the setter:

```typescript
    this.sprite.setDisplaySize(
      applyScaleTier(PLAYER.displaySize, this.#scaleTier),
      applyScaleTier(PLAYER.displaySize, this.#scaleTier),
    );
```

```typescript
    ghost.setDisplaySize(
      applyScaleTier(PLAYER.displaySize, this.#scaleTier),
      applyScaleTier(PLAYER.displaySize, this.#scaleTier),
    );
```

```typescript
  rescale(tier: ScaleTier): void {
    this.#scaleTier = tier;
    const size = applyScaleTier(PLAYER.displaySize, tier);
    this.sprite.setDisplaySize(size, size);
  }
```

- [ ] **Step 2: Add scale-tier awareness to EnemyPool**

In `src/game/entities/EnemyPool.ts`, import the helpers and add a field:

```typescript
import { applyScaleTier, type ScaleTier } from '../debug/scale';
```

```typescript
export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly #scene: Phaser.Scene;
  #scaleTier: ScaleTier = 2;
```

In `spawn()`, replace `enemy.setDisplaySize(stats.displaySize, stats.displaySize);` with:

```typescript
    const size = applyScaleTier(stats.displaySize, this.#scaleTier);
    enemy.setDisplaySize(size, size);
```

Add the setter, which also resizes every currently-active enemy:

```typescript
  setScaleTier(tier: ScaleTier): void {
    this.#scaleTier = tier;
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const size = applyScaleTier(STATS[EnemyPool.kind(child)].displaySize, tier);
      child.setDisplaySize(size, size);
    }
  }
```

- [ ] **Step 3: Add scale-tier awareness to CanisterPool**

In `src/game/entities/CanisterPool.ts`, import the helper and add a field:

```typescript
import { applyScaleTier, type ScaleTier } from '../debug/scale';
```

```typescript
export class CanisterPool {
  readonly group: Phaser.GameObjects.Group;
  readonly #scene: Phaser.Scene;
  #scaleTier: ScaleTier = 2;
```

In `eject()`, replace `canister.setDisplaySize(CANISTER.displaySize, CANISTER.displaySize);` with:

```typescript
    const size = applyScaleTier(CANISTER.displaySize, this.#scaleTier);
    canister.setDisplaySize(size, size);
```

Add the setter (future spawns only, per the scope note above):

```typescript
  setScaleTier(tier: ScaleTier): void {
    this.#scaleTier = tier;
  }
```

- [ ] **Step 4: Wire ArenaScene**

Add a field:

```typescript
  #scaleTier: ScaleTier = 2;
```

Import the type:

```typescript
import type { ScaleTier } from '../debug/scale';
```

Reset it in `create()`'s reset block:

```typescript
    this.#godMode = false;
    this.#scaleTier = 2;
```

Apply it to the tree sprite where the tree's displaySize is already recomputed every frame (around line 845):

```typescript
    const phaseSize = applyScaleTier(TREE.phaseSizes[this.#tree.phase], this.#scaleTier);
    this.#treeSprite.setDisplaySize(phaseSize, phaseSize);
```

(Add `applyScaleTier` to the same import as `ScaleTier`: `import { applyScaleTier, type ScaleTier } from '../debug/scale';`.)

Subscribe:

```typescript
    const onSetScale = ({ tier }: { tier: ScaleTier }) => {
      this.#scaleTier = tier;
      this.#player.rescale(tier);
      this.#enemies.setScaleTier(tier);
      this.#canisters.setScaleTier(tier);
    };
    bus.on('DEBUG_SET_SCALE', onSetScale);
```

Unsubscribe in `SHUTDOWN`:

```typescript
      bus.off('DEBUG_SET_SCALE', onSetScale);
```

- [ ] **Step 5: Add the control to DebugMenu.tsx**

```typescript
import { SCALE_TIERS, type ScaleTier } from '../game/debug/scale';
```

```typescript
  const [scaleTier, setScaleTier] = useState<ScaleTier>(2);
```

```tsx
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Display Scale
            </p>
            <div className="mt-2 flex gap-2">
              {SCALE_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => {
                    setScaleTier(tier);
                    bus.emit('DEBUG_SET_SCALE', { tier });
                  }}
                  className={`cursor-pointer rounded px-3 py-1.5 text-xs ${
                    scaleTier === tier
                      ? 'border border-tether bg-sand-800 text-tether'
                      : 'border border-sand-800 bg-sand-950 text-white/60'
                  }`}
                >
                  {tier}x
                </button>
              ))}
            </div>
          </div>
```

- [ ] **Step 6: Manual verification**

Run: `npm run dev`, start a run, let the tree grow to phase 2+ and let a couple of enemies spawn, unlock the debug menu.

1. Click `1x` — the tree, player, and every currently-alive enemy visibly shrink to half their current size immediately.
2. Click `2x` — everything grows back to today's shipped size.
3. Click `0.75x`, then get hit by an enemy or fire at one — collision still behaves exactly as before (hits land at the same effective range regardless of the visual size), confirming the scale is cosmetic only.
4. With `1x` selected, deliver a catalyst so a new canister ejects later, or just wait for a kill drop — the new canister spawns at half size; canisters already on the ground before the tier change keep their original size (documented limitation).

- [ ] **Step 7: Commit**

```bash
git add src/game/entities/Player.ts src/game/entities/EnemyPool.ts \
  src/game/entities/CanisterPool.ts src/hud/DebugMenu.tsx \
  src/game/scenes/ArenaScene.ts
git commit -m "$(cat <<'EOF'
feat(debug): wire Display Scale control end-to-end

Visual-only: player and enemies resize live (no competing tweens on
their scale); canisters apply the new tier to future ejections only,
since the pickup landing-bounce tween already drives scaleX/scaleY on
active ones. Physics bodies are untouched everywhere.
EOF
)"
```

---

### Task 9: Timescale control (end-to-end)

**Files:**
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DEBUG_SET_TIMESCALE` (Task 4).

- [ ] **Step 1: Add the control to DebugMenu.tsx**

```typescript
  const [timescale, setTimescaleState] = useState(1);
```

```tsx
          <div className="border border-sand-800 bg-sand-950 p-3">
            <div className="flex justify-between">
              <p className="text-[10px] tracking-wider text-tether uppercase">
                Timescale
              </p>
              <p className="text-xs text-white/60">{timescale.toFixed(1)}x</p>
            </div>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={timescale}
              onChange={(e) => {
                const factor = Number(e.target.value);
                setTimescaleState(factor);
                bus.emit('DEBUG_SET_TIMESCALE', { factor });
              }}
              className="mt-2 w-full accent-tether"
            />
          </div>
```

- [ ] **Step 2: Wire ArenaScene**

Add a field:

```typescript
  #debugTimescale = 1;
```

Reset it in `create()`:

```typescript
    this.#scaleTier = 2;
    this.#debugTimescale = 1;
    this.time.timeScale = 1;
    this.physics.world.timeScale = 1;
```

Subscribe:

```typescript
    const onSetTimescale = ({ factor }: { factor: number }) => {
      this.#debugTimescale = factor;
      this.time.timeScale = factor;
      this.physics.world.timeScale = factor;
    };
    bus.on('DEBUG_SET_TIMESCALE', onSetTimescale);
```

Unsubscribe in `SHUTDOWN`:

```typescript
      bus.off('DEBUG_SET_TIMESCALE', onSetTimescale);
```

`#debugTimescale` is stored even though nothing reads it back yet — it documents intent and gives a hook if a later task needs to query the current value (e.g. displaying it elsewhere); Vitest/`tsc` won't flag an unread private field as an error, but if `npm run lint` reports it unused, drop the field and rely solely on `this.time.timeScale` as the source of truth instead.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, start a run, unlock the debug menu.

1. Drag the slider to `3x` — player movement, enemy movement, and bullet travel all visibly speed up together.
2. Drag it to `0.5x` — everything slows down together, including tween-based effects like the canister landing bounce.
3. Return it to `1x` — speed returns to normal.

- [ ] **Step 4: Commit**

```bash
git add src/hud/DebugMenu.tsx src/game/scenes/ArenaScene.ts
git commit -m "feat(debug): wire Timescale control end-to-end"
```

---

### Task 10: Force-Spawn and Kill All controls (end-to-end)

**Files:**
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DEBUG_SPAWN_ENEMY`, `DEBUG_KILL_ALL` (Task 4), `MutantKind` (`../systems/SpawnDirector`, already imported in `ArenaScene.ts`).

- [ ] **Step 1: Add the controls to DebugMenu.tsx**

```typescript
import type { MutantKind } from '../game/systems/SpawnDirector';

const SPAWN_KINDS: { kind: MutantKind; label: string }[] = [
  { kind: 'swarmer', label: '+ Swarmer' },
  { kind: 'detonator', label: '+ Detonator' },
  { kind: 'brute', label: '+ Brute' },
];
```

```tsx
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Force Spawn
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPAWN_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => bus.emit('DEBUG_SPAWN_ENEMY', { kind })}
                  className="cursor-pointer rounded border border-sand-800 bg-sand-950 px-3 py-1.5 text-xs text-white/60 hover:border-tether"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => bus.emit('DEBUG_KILL_ALL')}
                className="cursor-pointer rounded bg-decay px-3 py-1.5 text-xs font-semibold text-sand-950"
              >
                Kill All
              </button>
            </div>
          </div>
```

- [ ] **Step 2: Wire ArenaScene**

`#spawnAtEdge(kind)` already exists as the single-spawn entry point the director loop calls (`ArenaScene.ts:1001`) — reuse it directly. For Kill All, `EnemyPool.kill()` only deactivates the body; every existing call site (e.g. the bullet-overlap handler, `ArenaScene.ts:338-390`) separately calls `#handleKillDrop`, increments `#kills`, and plays the splatter/audio, so Kill All must replicate that full sequence rather than call `kill()` alone.

Subscribe:

```typescript
    const onSpawnEnemy = ({ kind }: { kind: MutantKind }) => {
      this.#spawnAtEdge(kind);
    };
    const onKillAll = () => {
      for (const child of this.#enemies.group.getChildren()) {
        if (!isArcadeImage(child) || !child.active) continue;
        const killX = child.x;
        const killY = child.y;
        EnemyPool.kill(child);
        this.#kills += 1;
        this.#handleKillDrop(killX, killY);
        this.#particles.splatter(killX, killY);
        this.#audio.alienSplat();
      }
    };
    bus.on('DEBUG_SPAWN_ENEMY', onSpawnEnemy);
    bus.on('DEBUG_KILL_ALL', onKillAll);
```

Unsubscribe in `SHUTDOWN`:

```typescript
      bus.off('DEBUG_SPAWN_ENEMY', onSpawnEnemy);
      bus.off('DEBUG_KILL_ALL', onKillAll);
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, start a run, unlock the debug menu.

1. Click "+ Brute" three times — three Brutes appear at the arena edge and start pursuing, even if the current threat budget wouldn't normally allow it yet.
2. Click "Kill All" — every alive enemy dies, drops loot/particles/sound exactly like a normal kill, and the score/kill counter increments per enemy.
3. Click "Kill All" again with no enemies alive — no errors, nothing happens.

- [ ] **Step 4: Commit**

```bash
git add src/hud/DebugMenu.tsx src/game/scenes/ArenaScene.ts
git commit -m "feat(debug): wire Force-Spawn and Kill All controls end-to-end"
```

---

### Task 11: Force Maturity control (end-to-end)

**Files:**
- Modify: `src/hud/DebugMenu.tsx`
- Modify: `src/game/scenes/ArenaScene.ts`

**Interfaces:**
- Consumes: `DEBUG_SET_MATURITY` (Task 4), `TreeSystem.deliver` (already used by `ArenaScene.ts`), `#triggerGeneration` (already exists in `ArenaScene.ts`).

- [ ] **Step 1: Add the control to DebugMenu.tsx**

```tsx
          <div className="flex items-center justify-between border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-growth uppercase">
              Tree Maturity
            </p>
            <button
              type="button"
              onClick={() => bus.emit('DEBUG_SET_MATURITY', { pct: 100 })}
              className="cursor-pointer rounded bg-growth px-3 py-1.5 text-xs font-semibold text-sand-950"
            >
              Force 100%
            </button>
          </div>
```

- [ ] **Step 2: Wire ArenaScene**

Reuses the exact path catalyst delivery already uses (`ArenaScene.ts:706-710`):

```typescript
    const onSetMaturity = ({ pct }: { pct: number }) => {
      const result = this.#tree.deliver(pct);
      if (result.generationTriggered) {
        this.#triggerGeneration(result.generation);
      }
    };
    bus.on('DEBUG_SET_MATURITY', onSetMaturity);
```

Unsubscribe in `SHUTDOWN`:

```typescript
      bus.off('DEBUG_SET_MATURITY', onSetMaturity);
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, start a run, unlock the debug menu.

1. Click "Force 100%" — the draft-upgrade card modal appears exactly as it would after natural Generation, with the sim still paused underneath (debug menu closes automatically isn't required — draft modal renders above it; closing the debug menu with `` ` `` afterward should reveal the draft modal still open).
2. Pick a card — play resumes normally afterward.
3. Click "Force 100%" twice in a row (before drafting the first) — a second Generation is queued (`#pendingDraftGenerations`), matching how rapid natural catalyst delivery already behaves.

- [ ] **Step 4: Commit**

```bash
git add src/hud/DebugMenu.tsx src/game/scenes/ArenaScene.ts
git commit -m "feat(debug): wire Force Maturity control end-to-end"
```

---

### Task 12: Documentation and final regression pass

**Files:**
- Modify: `WALKTHROUGH.md`

**Interfaces:** None — documentation only.

- [ ] **Step 1: Document the debug menu**

Read `WALKTHROUGH.md` first to match its existing section style and heading level for controls, then add a short section (near wherever other keybinds are listed) along these lines:

```markdown
## Debug menu (development only)

Press `` ` `` (backtick) to open a PIN-gated debug menu: display scale,
a difficulty override, God Mode, timescale, force-spawn/kill-all, and an
instant-maturity button. The first time it's opened on a given browser,
it asks you to set a 4-digit PIN; every time after that, it asks for the
PIN before showing the menu. This is a development tool, not a real
security boundary -- the PIN's hash lives in `localStorage`.
```

- [ ] **Step 2: Full regression pass**

Run: `npm run build && npm run lint && npm run test`
Expected: all three succeed with no errors.

Run: `npm run dev` and manually replay the full flow once end-to-end: set a PIN, close and reopen the menu (still authenticated), toggle every control, restart the run from the Pause modal, confirm debug state resets to shipped defaults (God Mode off, scale 2x, difficulty back to the title-screen choice... actually the title-screen choice was overwritten in Task 7's registry write, so confirm it now runs at whatever difficulty was last selected in the debug menu, which is the documented behavior), then reload the page fully and confirm the debug menu asks for the PIN again (not "Set PIN" — the PIN persisted).

- [ ] **Step 3: Commit**

```bash
git add WALKTHROUGH.md
git commit -m "$(cat <<'EOF'
docs: document the secret debug menu in WALKTHROUGH

Keeps WALKTHROUGH.md in sync with the new backtick control, per
CLAUDE.md's rule to update it whenever key bindings change.
EOF
)"
```

---

## Self-Review

**Spec coverage:** Trigger + PIN gate → Task 5. Bus events → Task 4. Display scale → Task 8. Difficulty override → Task 7. God mode → Task 6. Timescale, force-spawn/kill-all, force-maturity → Tasks 9-11. Testing plan (unit tests for PIN hash, scale formula, god-mode logic; manual browser verification for everything UI/Phaser) → covered per-task. WALKTHROUGH.md update → Task 12. No spec section is without a task.

**Placeholder scan:** No TBD/TODO; every step has complete code or an exact command with expected output.

**Type consistency:** `ScaleTier`, `applyScaleTier`, `PinAuth`/`pinAuth`, `WeaponInventory.setGodMode`, `EnemyPool.setScaleTier`, `CanisterPool.setScaleTier`, `Player.rescale`, and all eight `DEBUG_*` event names are used identically everywhere they're referenced across tasks.

**Deviation from spec, called out explicitly:**
1. Event name `DEBUG_MENU_OPENED` (spec) → `DEBUG_MENU_TOGGLED: { open: boolean }` (plan) — simpler for the React side to mirror.
2. "Physics body (radius/size)" scaling was dropped from the spec itself during spec review (radius config is dead code) — this plan implements the corrected, visual-only version.
3. Canisters already in flight when the scale tier changes are not live-resized, due to a competing scale tween discovered while reading `CanisterPool.ts` — called out in Task 8 rather than silently doing something different from what the spec implied.
