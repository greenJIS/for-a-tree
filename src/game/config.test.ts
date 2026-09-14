import { describe, expect, it } from 'vitest';
import { BRUTE, CANISTER, DETONATOR, PLAYER, SWARMER, TREE } from './config';

describe('config: entity scale & loot polish', () => {
  it('sizes player, enemies, and canisters at the 2.5x bump', () => {
    expect(PLAYER.displaySize).toBe(100);
    expect(SWARMER.displaySize).toBe(90);
    expect(BRUTE.displaySize).toBe(120);
    expect(DETONATOR.displaySize).toBe(100);
    expect(CANISTER.displaySize).toBe(60);
  });

  it('extends canister lifetime to 20s with a 5s red-flash warning', () => {
    expect(CANISTER.lifetimeMs).toBe(20000);
    expect(CANISTER.despawnWarnMs).toBe(5000);
  });

  it('sizes the tree at 2.5x per growth phase', () => {
    expect(TREE.phaseSizes).toEqual([0, 160, 240, 320, 400]);
  });
});
