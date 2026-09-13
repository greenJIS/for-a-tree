import { beforeEach, describe, expect, it } from 'vitest';
import { AegisSystem } from './AegisSystem';

describe('AegisSystem', () => {
  let aegis: AegisSystem;

  beforeEach(() => {
    aegis = new AegisSystem();
  });

  it('starts with 0 charges and inactive', () => {
    expect(aegis.charges).toBe(0);
    expect(aegis.isActive(1000)).toBe(false);
  });

  it('grants 1 charge up to capacity', () => {
    aegis.grantCharge(1);
    expect(aegis.charges).toBe(1);
    aegis.grantCharge(1); // capped at 1
    expect(aegis.charges).toBe(1);

    aegis.grantCharge(2); // with Second Wind cap 2
    expect(aegis.charges).toBe(2);
  });

  it('activates for 8.0 seconds and consumes 1 charge', () => {
    aegis.grantCharge(1);
    expect(aegis.tryActivate(1000)).toBe(true);
    expect(aegis.charges).toBe(0);
    expect(aegis.isActive(5000)).toBe(true);
    expect(aegis.activeRemainingMs(5000)).toBe(4000);
    expect(aegis.isActive(9000)).toBe(false);
  });

  it('cannot activate if 0 charges or already active', () => {
    expect(aegis.tryActivate(1000)).toBe(false);
    aegis.grantCharge(2);
    expect(aegis.tryActivate(1000)).toBe(true);
    expect(aegis.tryActivate(2000)).toBe(false); // already active
  });

  it('reports status with capacity and remaining time', () => {
    aegis.grantCharge(2);
    expect(aegis.status(1000, 2)).toEqual({
      charges: 1,
      capacity: 2,
      activeRemainingMs: 0,
    });
    aegis.tryActivate(1000);
    expect(aegis.status(3000, 2)).toEqual({
      charges: 0,
      capacity: 2,
      activeRemainingMs: 6000,
    });
  });

  it('resets charges and active timer', () => {
    aegis.grantCharge(1);
    aegis.tryActivate(1000);
    expect(aegis.isActive(2000)).toBe(true);
    aegis.reset();
    expect(aegis.charges).toBe(0);
    expect(aegis.isActive(2000)).toBe(false);
    expect(aegis.activeRemainingMs(2000)).toBe(0);
  });
});
