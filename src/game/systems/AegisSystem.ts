/**
 * Aegis Pulse Battery state. SRS 3.4.
 *
 * 1 charge granted per Generation, capped at capacity (1, or 2 with Second Wind).
 * Activated by Spacebar. Lasts 8.0 s.
 */
import { AEGIS } from '../config';

export type AegisStatus = {
  charges: number;
  capacity: number;
  activeRemainingMs: number;
};

export class AegisSystem {
  #charges = 0;
  #activeUntilMs = 0;

  get charges(): number {
    return this.#charges;
  }

  grantCharge(capacity: number): void {
    this.#charges = Math.min(capacity, this.#charges + 1);
  }

  tryActivate(nowMs: number): boolean {
    if (this.#charges <= 0 || nowMs < this.#activeUntilMs) {
      return false;
    }
    this.#charges -= 1;
    this.#activeUntilMs = nowMs + AEGIS.durationMs;
    return true;
  }

  isActive(nowMs: number): boolean {
    return nowMs < this.#activeUntilMs;
  }

  activeRemainingMs(nowMs: number): number {
    return Math.max(0, this.#activeUntilMs - nowMs);
  }

  status(nowMs: number, capacity: number): AegisStatus {
    return {
      charges: this.#charges,
      capacity,
      activeRemainingMs: this.activeRemainingMs(nowMs),
    };
  }

  reset(): void {
    this.#charges = 0;
    this.#activeUntilMs = 0;
  }
}
