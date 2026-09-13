/**
 * Clip, reserve, and reload state for the Kinetic Carbine. SRS 4.2.
 *
 * Regeneration fills only the reserve, is paused whenever the player is not
 * tethered, and the magazine is filled only by reloading. An empty clip
 * auto-starts a reload; firing is blocked while reloading.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { CARBINE } from '../config';
import type { TetherState } from '../eventBus';

export type AmmoState = {
  clip: number;
  reserve: number;
  reloading: boolean;
};

export class AmmoSystem {
  #clip = CARBINE.magSize;
  #reserve = 0;
  #reloadRemainingMs = 0;

  get state(): AmmoState {
    return {
      clip: this.#clip,
      reserve: this.#reserve,
      reloading: this.#reloadRemainingMs > 0,
    };
  }

  tryFire(): boolean {
    if (this.#reloadRemainingMs > 0 || this.#clip <= 0) return false;

    this.#clip -= 1;
    if (this.#clip === 0) this.startReload();
    return true;
  }

  startReload(): void {
    if (this.#reloadRemainingMs > 0) return;
    this.#reloadRemainingMs = CARBINE.reloadMs;
  }

  update(dtSec: number, tetherState: TetherState): void {
    if (tetherState === 'tethered') {
      this.#reserve = Math.min(
        CARBINE.reserveCap,
        this.#reserve + CARBINE.regenPerSec * dtSec,
      );
    }

    if (this.#reloadRemainingMs > 0) {
      this.#reloadRemainingMs -= dtSec * 1000;
      if (this.#reloadRemainingMs <= 0) {
        this.#reloadRemainingMs = 0;
        const needed = CARBINE.magSize - this.#clip;
        const transfer = Math.min(needed, Math.floor(this.#reserve));
        this.#clip += transfer;
        this.#reserve -= transfer;
      }
    }
  }
}
