import { beforeEach, describe, expect, it } from 'vitest';
import { WeaponInventory } from './WeaponInventory';

describe('WeaponInventory', () => {
  let inv: WeaponInventory;

  beforeEach(() => {
    inv = new WeaponInventory();
  });

  it('starts with carbine unlocked and equipped', () => {
    expect(inv.activeWeaponId).toBe('carbine');
    expect(inv.isUnlocked('carbine')).toBe(true);
    expect(inv.isUnlocked('scatter')).toBe(false);
    expect(inv.isUnlocked('rail')).toBe(false);
    expect(inv.unlockedIds).toEqual(['carbine']);
  });

  it('cannot switch to locked weapon', () => {
    expect(inv.switchWeapon('scatter')).toBe(false);
    expect(inv.activeWeaponId).toBe('carbine');
  });

  it('switches to weapon once unlocked and fills its reserve', () => {
    inv.unlock('scatter');
    expect(inv.isUnlocked('scatter')).toBe(true);
    expect(inv.switchWeapon('scatter')).toBe(true);
    expect(inv.activeWeaponId).toBe('scatter');
    expect(inv.activeAmmo.clip).toBe(6);
    expect(inv.activeAmmo.reserve).toBe(48);
    expect(inv.unlockedIds).toContain('scatter');
  });

  it('regenerates reserve for all unlocked weapons simultaneously while tethered', () => {
    inv.unlock('scatter');
    // fire 1 round of carbine and 1 of scatter
    inv.switchWeapon('carbine');
    inv.tryFire();
    inv.switchWeapon('scatter');
    inv.tryFire();

    // spend reserves to 0
    inv.setReserveForTest('carbine', 0);
    inv.setReserveForTest('scatter', 0);

    // Tethered for 10s: carbine regens 8.0/s -> 80, scatter regens 1.2/s -> 12
    inv.update(10, 'tethered', 1);

    expect(inv.getAmmo('carbine').reserve).toBeCloseTo(80);
    expect(inv.getAmmo('scatter').reserve).toBeCloseTo(12);
  });

  it('does not regenerate reserves when untethered (grace or decaying)', () => {
    inv.setReserveForTest('carbine', 0);

    inv.update(5, 'grace', 1);
    expect(inv.getAmmo('carbine').reserve).toBe(0);

    inv.update(5, 'decaying', 1);
    expect(inv.getAmmo('carbine').reserve).toBe(0);
  });

  it('caps reserve regeneration at reserveCap', () => {
    inv.setReserveForTest('carbine', 235);
    inv.update(10, 'tethered', 1); // 235 + 80 would be 315 > 240 cap
    expect(inv.getAmmo('carbine').reserve).toBe(240);
  });

  it('handles reload timing and transfers reserve to clip', () => {
    inv.setReserveForTest('carbine', 50);
    // carbine magSize is 24, reloadMs is 1100ms
    // Fire all 24 rounds to trigger auto-reload
    for (let i = 0; i < 24; i++) {
      expect(inv.tryFire()).toBe(true);
    }
    expect(inv.activeAmmo.clip).toBe(0);
    expect(inv.activeAmmo.reloading).toBe(true);
    expect(inv.tryFire()).toBe(false);

    // Advance 0.5s (500ms) - reload should still be ongoing
    inv.update(0.5, 'tethered', 1);
    expect(inv.activeAmmo.reloading).toBe(true);
    expect(inv.activeAmmo.clip).toBe(0);

    // Advance remaining 0.6s (600ms) - total 1100ms, reload should complete
    inv.update(0.6, 'tethered', 1);
    expect(inv.activeAmmo.reloading).toBe(false);
    expect(inv.activeAmmo.clip).toBe(24);
    // reserve had 50, added 8.8 regen over 1.1s (8.0 * 1.1 = 8.8), minus 24 transferred
    expect(inv.activeAmmo.reserve).toBeCloseTo(50 + 8.8 - 24);
  });

  it('allows manual reload via startReload', () => {
    inv.setReserveForTest('carbine', 50);
    expect(inv.tryFire()).toBe(true);
    expect(inv.activeAmmo.clip).toBe(23);
    expect(inv.activeAmmo.reloading).toBe(false);

    inv.startReload();
    expect(inv.activeAmmo.reloading).toBe(true);

    // Advance past reload time
    inv.update(1.2, 'tethered', 1);
    expect(inv.activeAmmo.reloading).toBe(false);
    expect(inv.activeAmmo.clip).toBe(24);
  });

  it('provides scalar getters activeClip, activeReserve, and isReloading', () => {
    expect(inv.activeClip).toBe(24);
    expect(inv.activeReserve).toBe(0);
    expect(inv.isReloading).toBe(false);

    inv.setReserveForTest('carbine', 10);
    expect(inv.activeReserve).toBe(10);

    inv.tryFire();
    expect(inv.activeClip).toBe(23);

    inv.startReload();
    expect(inv.isReloading).toBe(true);
  });
});
