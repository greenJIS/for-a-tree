import { beforeEach, describe, expect, it } from 'vitest';
import { UpgradeSystem } from './UpgradeSystem';

describe('UpgradeSystem', () => {
  let upgrades: UpgradeSystem;

  beforeEach(() => {
    upgrades = new UpgradeSystem();
  });

  it('draws 3 distinct cards from the pool', () => {
    const hand = upgrades.draw(1);
    expect(hand.length).toBe(3);
    const ids = new Set(hand.map((c) => c.id));
    expect(ids.size).toBe(3);
  });

  it('removes non-repeatable cards once taken', () => {
    upgrades.apply('scatter-requisition');
    expect(upgrades.isScatterUnlocked).toBe(true);

    // Draw 100 hands to ensure scatter-requisition is never offered again
    for (let i = 0; i < 100; i += 1) {
      const hand = upgrades.draw(2);
      expect(hand.some((c) => c.id === 'scatter-requisition')).toBe(false);
    }
  });

  it('keeps offering repeatable cards after being taken', () => {
    upgrades.apply('deep-roots');
    let offered = false;
    for (let i = 0; i < 50; i += 1) {
      const hand = upgrades.draw(1);
      if (hand.some((c) => c.id === 'deep-roots')) {
        offered = true;
        break;
      }
    }
    expect(offered).toBe(true);
  });

  it('initializes with default modifiers', () => {
    expect(upgrades.tetherGrowthMult).toBe(1);
    expect(upgrades.decayRateMult).toBe(1);
    expect(upgrades.auraRadiusBonus).toBe(0);
    expect(upgrades.ammoRegenMult).toBe(1);
    expect(upgrades.weaponDamageMult).toBe(1);
    expect(upgrades.maxHpBonus).toBe(0);
    expect(upgrades.moveSpeedMult).toBe(1);
    expect(upgrades.magnetRadiusMult).toBe(1);
    expect(upgrades.carryCapacity).toBe(3);
    expect(upgrades.catalystValueMult).toBe(1);
    expect(upgrades.aegisCapacity).toBe(1);
    expect(upgrades.isScatterUnlocked).toBe(false);
    expect(upgrades.isRailUnlocked).toBe(false);
  });

  it('applies additive and multiplicative card stacks correctly', () => {
    // Deep roots (+15% tether growth per copy)
    upgrades.apply('deep-roots');
    upgrades.apply('deep-roots');
    expect(upgrades.tetherGrowthMult).toBeCloseTo(1.3);

    // Heartwood (decay rate -40% multiplicatively: 0.6^2 = 0.36)
    upgrades.apply('heartwood');
    upgrades.apply('heartwood');
    expect(upgrades.decayRateMult).toBeCloseTo(0.36);

    // Wider canopy (+30 px aura per copy)
    upgrades.apply('wider-canopy');
    expect(upgrades.auraRadiusBonus).toBe(30);

    // Munitions loom (ammo regen x1.4 per copy)
    upgrades.apply('munitions-loom');
    upgrades.apply('munitions-loom');
    expect(upgrades.ammoRegenMult).toBeCloseTo(1.96);

    // Hollow-point (+15% weapon damage per copy)
    upgrades.apply('hollow-point');
    expect(upgrades.weaponDamageMult).toBeCloseTo(1.15);

    // Kinetic dampers (+25 max hp)
    upgrades.apply('kinetic-dampers');
    expect(upgrades.maxHpBonus).toBe(25);

    // Nano-suture kit (+8% move speed)
    upgrades.apply('nano-suture-kit');
    expect(upgrades.moveSpeedMult).toBeCloseTo(1.08);

    // Rhizome splice (+25% catalyst value per copy)
    upgrades.apply('rhizome-splice');
    expect(upgrades.catalystValueMult).toBeCloseTo(1.25);

    // Vacuum coils (non-repeatable: 2x magnet, 5 carry)
    upgrades.apply('vacuum-coils');
    expect(upgrades.magnetRadiusMult).toBe(2);
    expect(upgrades.carryCapacity).toBe(5);

    // Second wind (aegis cap to 2)
    upgrades.apply('second-wind');
    expect(upgrades.aegisCapacity).toBe(2);

    // Rail requisition (unlock rail)
    upgrades.apply('rail-requisition');
    expect(upgrades.isRailUnlocked).toBe(true);

    // Count helper
    expect(upgrades.count('deep-roots')).toBe(2);
    expect(upgrades.count('bio-surge')).toBe(0);
  });

  it('biases weapon requisition cards by 3x on generation 1 and 2', () => {
    // Rig RNG to test weight distribution
    let weaponCount = 0;
    const trials = 300;
    for (let i = 0; i < trials; i += 1) {
      const fresh = new UpgradeSystem();
      const hand = fresh.draw(1);
      if (hand.some((c) => c.id === 'scatter-requisition' || c.id === 'rail-requisition')) {
        weaponCount += 1;
      }
    }
    // With 3x weight on 2 cards out of 13, weapon appearances should be significantly elevated (>45% of hands)
    expect(weaponCount).toBeGreaterThan(trials * 0.45);
  });

  it('does not bias weapon cards on generation 3+', () => {
    let weaponCount = 0;
    const trials = 300;
    for (let i = 0; i < trials; i += 1) {
      const fresh = new UpgradeSystem();
      const hand = fresh.draw(3);
      if (hand.some((c) => c.id === 'scatter-requisition' || c.id === 'rail-requisition')) {
        weaponCount += 1;
      }
    }
    // Without 3x weight, 2/13 cards in 3 draws: 1 - (11/13 * 10/12 * 9/11) = 1 - 0.577 = ~42.3%
    // At generation 1 (with 3x weight): 2*3=6 weapon weight, 11 other weight = 17 total. Hand chance > 70%.
    // In Gen 3, weaponCount should be around ~42%, well below 60%.
    expect(weaponCount).toBeLessThan(trials * 0.60);
  });

  it('uses custom rng when provided', () => {
    let roll = 0;
    const mockRng = () => {
      roll = (roll + 0.1) % 1;
      return roll;
    };
    const deterministic = new UpgradeSystem(mockRng);
    const hand = deterministic.draw(1);
    expect(hand.length).toBe(3);
  });
});
