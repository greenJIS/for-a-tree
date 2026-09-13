/**
 * Tether state machine with a grace budget.
 *
 * Delta spec section 5. Grace drains while outside the aura and refills at
 * half rate while inside, so restoring a full second of grace costs two
 * seconds of tethering. SRS 3.2's resettable timer allowed indefinite
 * boundary oscillation with no decay.
 *
 * Pure TypeScript by design — no Phaser import — so it is unit-testable.
 */
import { GRACE_MAX, GRACE_REFILL_RATE } from '../config';
import type { TetherState } from '../eventBus';

export class TetherSystem {
  #state: TetherState = 'tethered';
  #grace: number = GRACE_MAX;

  get state(): TetherState {
    return this.#state;
  }

  get grace(): number {
    return this.#grace;
  }

  /**
   * Advance one frame.
   *
   * @param dtSec  Delta time in seconds.
   * @param inAura Whether the player is within the live aura radius.
   * @returns The state after this update.
   */
  update(dtSec: number, inAura: boolean): TetherState {
    if (inAura) {
      this.#grace = Math.min(
        GRACE_MAX,
        this.#grace + GRACE_REFILL_RATE * dtSec,
      );
      this.#state = 'tethered';
      return this.#state;
    }

    this.#grace = Math.max(0, this.#grace - dtSec);
    this.#state = this.#grace > 0 ? 'grace' : 'decaying';
    return this.#state;
  }

  reset(): void {
    this.#state = 'tethered';
    this.#grace = GRACE_MAX;
  }
}
