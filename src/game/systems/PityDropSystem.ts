/**
 * Pity-weighted catalyst drop system. SRS 3.5.
 *
 * P(n) = min(1, baseProbability + probabilityPerMiss * n), where n is the
 * count of consecutive kills that produced no drop. This is deliberately the
 * same coefficient as the hard-pity guarantee: P(6) clamps to 1.0, so the
 * 7th consecutive miss-free kill always drops.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { PITY } from '../config';
import type { CatalystTier } from '../eventBus';

export class PityDropSystem {
  readonly #rng: () => number;
  #missStreak = 0;

  constructor(rng: () => number = Math.random) {
    this.#rng = rng;
  }

  get missStreak(): number {
    return this.#missStreak;
  }

  /** Call once per kill. Returns the dropped tier, or null on a miss. */
  rollOnKill(): CatalystTier | null {
    const probability = Math.min(
      1,
      PITY.baseProbability + PITY.probabilityPerMiss * this.#missStreak,
    );

    if (this.#rng() >= probability) {
      this.#missStreak += 1;
      return null;
    }

    this.#missStreak = 0;
    return this.#rollTier();
  }

  #rollTier(): CatalystTier {
    const total =
      PITY.tierWeights.silt + PITY.tierWeights.nitrate + PITY.tierWeights.phyto;
    const roll = this.#rng() * total;

    if (roll < PITY.tierWeights.silt) return 'silt';
    if (roll < PITY.tierWeights.silt + PITY.tierWeights.nitrate)
      return 'nitrate';
    return 'phyto';
  }
}
