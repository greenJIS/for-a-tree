/**
 * 13-card upgrade pool, weighted draws on Generation, and modifier stack.
 * SRS 5.2, 5.3, amended by delta spec 8 (Rhizome Splice).
 */
import { UPGRADE_CARDS, type UpgradeCardDef } from '../config';
import type { UpgradeCard } from '../eventBus';

export class UpgradeSystem {
  readonly #rng: () => number;
  readonly #selected = new Map<string, number>();

  constructor(rng: () => number = Math.random) {
    this.#rng = rng;
  }

  /**
   * Draw 3 distinct cards from the eligible pool. Non-repeatables taken are
   * excluded. On Generations 1 and 2, weapon requisition cards have 3x weight.
   */
  draw(generation: number): UpgradeCard[] {
    const eligible: { def: UpgradeCardDef; weight: number }[] = [];

    for (const card of UPGRADE_CARDS) {
      if (!card.repeatable && (this.#selected.get(card.id) ?? 0) > 0) {
        continue;
      }
      let weight = 1;
      if (
        generation <= 2 &&
        (card.id === 'scatter-requisition' || card.id === 'rail-requisition')
      ) {
        weight = 3;
      }
      eligible.push({ def: card, weight });
    }

    const hand: UpgradeCard[] = [];
    const pool = [...eligible];

    while (hand.length < 3 && pool.length > 0) {
      const totalWeight = pool.reduce((acc, item) => acc + item.weight, 0);
      let roll = this.#rng() * totalWeight;
      let chosenIdx = 0;

      for (let i = 0; i < pool.length; i += 1) {
        roll -= pool[i].weight;
        if (roll <= 0) {
          chosenIdx = i;
          break;
        }
      }

      const [chosen] = pool.splice(chosenIdx, 1);
      hand.push({
        id: chosen.def.id,
        name: chosen.def.name,
        body: chosen.def.body,
        effect: chosen.def.effect,
        repeatable: chosen.def.repeatable,
      });
    }

    return hand;
  }

  apply(cardId: string): void {
    const current = this.#selected.get(cardId) ?? 0;
    this.#selected.set(cardId, current + 1);
  }

  count(cardId: string): number {
    return this.#selected.get(cardId) ?? 0;
  }

  get tetherGrowthMult(): number {
    return 1 + 0.15 * this.count('deep-roots');
  }

  get decayRateMult(): number {
    return Math.pow(0.6, this.count('heartwood'));
  }

  get auraRadiusBonus(): number {
    return 30 * this.count('wider-canopy');
  }

  get ammoRegenMult(): number {
    return Math.pow(1.4, this.count('munitions-loom'));
  }

  get weaponDamageMult(): number {
    return 1 + 0.15 * this.count('hollow-point');
  }

  get maxHpBonus(): number {
    return 25 * this.count('kinetic-dampers');
  }

  get moveSpeedMult(): number {
    return 1 + 0.08 * this.count('nano-suture-kit');
  }

  get magnetRadiusMult(): number {
    return this.count('vacuum-coils') > 0 ? 2 : 1;
  }

  get carryCapacity(): number {
    return this.count('vacuum-coils') > 0 ? 5 : 3;
  }

  get catalystValueMult(): number {
    return 1 + 0.25 * this.count('rhizome-splice');
  }

  get aegisCapacity(): number {
    return this.count('second-wind') > 0 ? 2 : 1;
  }

  get isScatterUnlocked(): boolean {
    return this.count('scatter-requisition') > 0;
  }

  get isRailUnlocked(): boolean {
    return this.count('rail-requisition') > 0;
  }
}
