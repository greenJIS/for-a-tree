/**
 * Carried-catalyst stack. SRS 3.3.
 *
 * Catalysts are cargo, not consumed on pickup -- they are cashed in as one
 * lump sum on delivery, per delta spec 2.3's overflow rule (one deliver()
 * call with the total, not one per tier).
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { CARRY, CATALYST_VALUE } from '../config';
import type { CatalystTier } from '../eventBus';

export class CarrySystem {
  #tiers: CatalystTier[] = [];

  get tiers(): CatalystTier[] {
    return [...this.#tiers];
  }

  get count(): number {
    return this.#tiers.length;
  }

  add(tier: CatalystTier): boolean {
    if (this.#tiers.length >= CARRY.capacityBase) return false;
    this.#tiers.push(tier);
    return true;
  }

  speedMultiplier(): number {
    const penalty = Math.min(
      CARRY.speedPenaltyMax,
      CARRY.speedPenaltyPer * this.#tiers.length,
    );
    return 1 - penalty;
  }

  deliverAll(): { totalPct: number; count: number } {
    const count = this.#tiers.length;
    const totalPct = this.#tiers.reduce(
      (sum, tier) => sum + CATALYST_VALUE[tier],
      0,
    );
    this.#tiers = [];
    return { totalPct, count };
  }

  clear(): void {
    this.#tiers = [];
  }
}
