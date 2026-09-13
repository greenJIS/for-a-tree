/**
 * Composite run score and high-score persistence. SRS 5.4.
 *
 * Formula:
 *   score = kills * 50
 *         + floor(elapsedSeconds / 30) * 250
 *         + generations * 2500
 *         + catalystsDelivered * 25
 *
 * High score stored in localStorage under 'foratree.highscore'.
 */
import { SCORE } from '../config';

export type ScoreInput = {
  kills: number;
  elapsedSec: number;
  generations: number;
  catalystsDelivered: number;
};

export class ScoreSystem {
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

  calculate(input: ScoreInput): number {
    const timeBlocks = Math.floor(input.elapsedSec / 30);
    return (
      input.kills * SCORE.perKill +
      timeBlocks * SCORE.perHalfMinute +
      input.generations * SCORE.perGeneration +
      input.catalystsDelivered * SCORE.perCatalystDelivered
    );
  }

  getHighScore(): number {
    if (!this.#storage) return 0;
    try {
      const raw = this.#storage.getItem(SCORE.storageKey);
      if (!raw) return 0;
      const parsed = parseInt(raw, 10);
      return Number.isFinite(parsed) ? parsed : 0;
    } catch {
      return 0;
    }
  }

  saveHighScore(currentScore: number): number {
    const prevHigh = this.getHighScore();
    const newHigh = Math.max(prevHigh, currentScore);
    if (this.#storage && newHigh > prevHigh) {
      try {
        this.#storage.setItem(SCORE.storageKey, newHigh.toString());
      } catch {
        // storage quota exceeded or disabled
      }
    }
    return newHigh;
  }
}
