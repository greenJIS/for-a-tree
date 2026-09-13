/**
 * Tree maturity, the growth ceiling, and the Generation cycle.
 *
 * Delta spec sections 2, 2.3, 2.4 and 9.2. Tethered growth stops at 60%;
 * only delivered catalysts move the bar past it. Without the ceiling, base
 * growth reaches 100% in 83 s unaided and catalysts are optional, which
 * inverts design pillar 1.
 *
 * Pure TypeScript by design — no Phaser import — so it is unit-testable.
 */
import {
  DECAY_RATE,
  GROWTH_CEILING,
  GROWTH_PER_GENERATION,
  GROWTH_RATE_BASE,
} from '../config';
import type { TetherState } from '../eventBus';

export type TreePhase = 1 | 2 | 3 | 4;

export type TreeUpdate = {
  maturityPct: number;
  generation: number;
  ratePerSec: number;
  generationTriggered: boolean;
  stalledCrossing: boolean;
};

export class TreeSystem {
  #maturityPct = 0;
  #generation = 0;
  #wasAtCeiling = false;

  get maturityPct(): number {
    return this.#maturityPct;
  }

  get generation(): number {
    return this.#generation;
  }

  /** Zero at or above the ceiling. Delta spec 2. */
  get growthRatePerSec(): number {
    if (this.#maturityPct >= GROWTH_CEILING) return 0;
    return GROWTH_RATE_BASE * (1 + GROWTH_PER_GENERATION * this.#generation);
  }

  /** Half-open intervals. Delta spec 9.2. */
  get phase(): TreePhase {
    if (this.#maturityPct >= 100) return 4;
    if (this.#maturityPct >= 65) return 3;
    if (this.#maturityPct >= 25) return 2;
    return 1;
  }

  update(dtSec: number, state: TetherState): TreeUpdate {
    if (state === 'tethered') {
      this.#maturityPct = Math.min(
        GROWTH_CEILING,
        this.#maturityPct + this.growthRatePerSec * dtSec,
      );
    } else if (state === 'decaying') {
      this.#maturityPct = Math.max(0, this.#maturityPct - DECAY_RATE * dtSec);
    }

    return this.#result(false);
  }

  /**
   * Cash in delivered catalysts. Overflow carries into the next cycle and at
   * most one Generation resolves per call. Delta spec 2.3.
   */
  deliver(pct: number): TreeUpdate {
    this.#maturityPct += pct;

    if (this.#maturityPct >= 100) {
      this.#maturityPct -= 100;
      this.#generation += 1;
      return this.#result(true);
    }

    return this.#result(false);
  }

  reset(): void {
    this.#maturityPct = 0;
    this.#generation = 0;
    this.#wasAtCeiling = false;
  }

  /**
   * Builds the return value and reports an upward ceiling crossing. Delta
   * spec 6: fires on every upward crossing, because 2.4 allows decaying back
   * below the ceiling and re-crossing it.
   */
  #result(generationTriggered: boolean): TreeUpdate {
    const atCeiling = this.#maturityPct >= GROWTH_CEILING;
    const stalledCrossing = atCeiling && !this.#wasAtCeiling;
    this.#wasAtCeiling = atCeiling;

    return {
      maturityPct: this.#maturityPct,
      generation: this.#generation,
      ratePerSec: this.growthRatePerSec,
      generationTriggered,
      stalledCrossing,
    };
  }
}
