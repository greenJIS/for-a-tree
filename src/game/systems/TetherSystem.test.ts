import { beforeEach, describe, expect, it } from 'vitest';
import { TetherSystem } from './TetherSystem';

describe('TetherSystem', () => {
  let tether: TetherSystem;

  beforeEach(() => {
    tether = new TetherSystem();
  });

  it('starts tethered with a full grace budget', () => {
    expect(tether.state).toBe('tethered');
    expect(tether.grace).toBeCloseTo(1.0);
  });

  it('enters grace immediately on leaving the aura', () => {
    expect(tether.update(0.1, false)).toBe('grace');
  });

  it('decays once the grace budget is spent', () => {
    tether.update(0.9, false);
    expect(tether.state).toBe('grace');
    tether.update(0.2, false);
    expect(tether.state).toBe('decaying');
    expect(tether.grace).toBe(0);
  });

  it('refills grace at half rate while tethered', () => {
    tether.update(1.0, false);
    expect(tether.grace).toBe(0);
    tether.update(1.0, true);
    expect(tether.grace).toBeCloseTo(0.5);
  });

  it('never refills grace above the maximum', () => {
    tether.update(10, true);
    expect(tether.grace).toBeCloseTo(1.0);
  });

  it('returns to tethered instantly on re-entry even with no grace left', () => {
    tether.update(2.0, false);
    expect(tether.state).toBe('decaying');
    expect(tether.update(0.016, true)).toBe('tethered');
  });

  it('does not let boundary oscillation prevent decay indefinitely', () => {
    // Out 0.9 s, in 0.9 s, repeatedly. Drain outpaces refill 2:1, so the
    // player must eventually decay. This is the exploit the meter closes.
    let sawDecaying = false;
    for (let cycle = 0; cycle < 10; cycle += 1) {
      tether.update(0.9, false);
      if (tether.state === 'decaying') sawDecaying = true;
      tether.update(0.9, true);
    }
    expect(sawDecaying).toBe(true);
  });

  it('resets to a full budget', () => {
    tether.update(2.0, false);
    tether.reset();
    expect(tether.state).toBe('tethered');
    expect(tether.grace).toBeCloseTo(1.0);
  });
});
