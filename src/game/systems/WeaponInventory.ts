/**
 * Weapon inventory and simultaneous reserve ammo regeneration. SRS 4.1, 4.2.
 * All three weapons regenerate simultaneously while tethered, whether equipped or not.
 */
import { CARBINE, RAIL, SCATTER } from '../config';
import type { TetherState } from '../eventBus';

export type WeaponId = 'carbine' | 'scatter' | 'rail';

type WeaponConfig = {
  magSize: number;
  reserveCap: number;
  reloadMs: number;
  regenPerSec: number;
};

const WEAPON_CONFIGS: Record<WeaponId, WeaponConfig> = {
  carbine: {
    magSize: CARBINE.magSize,
    reserveCap: CARBINE.reserveCap,
    reloadMs: CARBINE.reloadMs,
    regenPerSec: CARBINE.regenPerSec,
  },
  scatter: {
    magSize: SCATTER.magSize,
    reserveCap: SCATTER.reserveCap,
    reloadMs: SCATTER.reloadMs,
    regenPerSec: SCATTER.regenPerSec,
  },
  rail: {
    magSize: RAIL.magSize,
    reserveCap: RAIL.reserveCap,
    reloadMs: RAIL.reloadMs,
    regenPerSec: RAIL.regenPerSec,
  },
};

export class WeaponInventory {
  #activeId: WeaponId = 'carbine';
  readonly #unlocked = new Set<WeaponId>(['carbine']);

  readonly #clips: Record<WeaponId, number> = {
    carbine: CARBINE.magSize,
    scatter: SCATTER.magSize,
    rail: RAIL.magSize,
  };

  readonly #reserves: Record<WeaponId, number> = {
    carbine: 0,
    scatter: 0,
    rail: 0,
  };

  readonly #reloadRemainingMs: Record<WeaponId, number> = {
    carbine: 0,
    scatter: 0,
    rail: 0,
  };

  get activeWeaponId(): WeaponId {
    return this.#activeId;
  }

  get unlockedIds(): WeaponId[] {
    return Array.from(this.#unlocked);
  }

  isUnlocked(id: WeaponId): boolean {
    return this.#unlocked.has(id);
  }

  unlock(id: WeaponId): void {
    this.#unlocked.add(id);
    this.#reserves[id] = WEAPON_CONFIGS[id].reserveCap;
  }

  switchWeapon(id: WeaponId): boolean {
    if (!this.#unlocked.has(id)) return false;
    this.#activeId = id;
    return true;
  }

  get activeAmmo(): { clip: number; reserve: number; reloading: boolean } {
    return this.getAmmo(this.#activeId);
  }

  get activeClip(): number {
    return this.#clips[this.#activeId];
  }

  get activeReserve(): number {
    return this.#reserves[this.#activeId];
  }

  get isReloading(): boolean {
    return this.#reloadRemainingMs[this.#activeId] > 0;
  }

  getAmmo(id: WeaponId): { clip: number; reserve: number; reloading: boolean } {
    return {
      clip: this.#clips[id],
      reserve: this.#reserves[id],
      reloading: this.#reloadRemainingMs[id] > 0,
    };
  }

  tryFire(): boolean {
    const id = this.#activeId;
    if (this.#reloadRemainingMs[id] > 0 || this.#clips[id] <= 0) return false;

    this.#clips[id] -= 1;
    if (this.#clips[id] === 0) this.startReload();
    return true;
  }

  startReload(): void {
    const id = this.#activeId;
    const cfg = WEAPON_CONFIGS[id];
    if (this.#reloadRemainingMs[id] > 0 || this.#clips[id] >= cfg.magSize) return;
    this.#reloadRemainingMs[id] = cfg.reloadMs;
  }

  update(dtSec: number, tetherState: TetherState, regenMult = 1): void {
    for (const id of this.#unlocked) {
      const cfg = WEAPON_CONFIGS[id];
      if (tetherState === 'tethered') {
        this.#reserves[id] = Math.min(
          cfg.reserveCap,
          this.#reserves[id] + cfg.regenPerSec * regenMult * dtSec,
        );
      }

      if (this.#reloadRemainingMs[id] > 0) {
        this.#reloadRemainingMs[id] -= dtSec * 1000;
        if (this.#reloadRemainingMs[id] <= 0) {
          this.#reloadRemainingMs[id] = 0;
          const needed = cfg.magSize - this.#clips[id];
          const transfer = Math.min(needed, Math.floor(this.#reserves[id]));
          this.#clips[id] += transfer;
          this.#reserves[id] -= transfer;
        }
      }
    }
  }

  setReserveForTest(id: WeaponId, amount: number): void {
    this.#reserves[id] = amount;
  }
}
