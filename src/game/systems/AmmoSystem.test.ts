import { beforeEach, describe, expect, it } from 'vitest';
import { AmmoSystem } from './AmmoSystem';

describe('AmmoSystem', () => {
  let ammo: AmmoSystem;

  beforeEach(() => {
    ammo = new AmmoSystem();
  });

  it('starts with a full magazine and an empty reserve', () => {
    expect(ammo.state).toEqual({ clip: 24, reserve: 0, reloading: false });
  });

  it('tryFire decrements the clip and returns true while rounds remain', () => {
    expect(ammo.tryFire()).toBe(true);
    expect(ammo.state.clip).toBe(23);
  });

  it('tryFire returns false and does not decrement at zero clip', () => {
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    expect(ammo.state.clip).toBe(0);
    expect(ammo.tryFire()).toBe(false);
    expect(ammo.state.clip).toBe(0);
  });

  it('regenerates the reserve at 8.0 rounds/s while tethered, capped at 240', () => {
    ammo.update(1, 'tethered');
    expect(ammo.state.reserve).toBe(8);
    for (let i = 0; i < 40; i += 1) ammo.update(1, 'tethered');
    expect(ammo.state.reserve).toBe(240);
  });

  it('does not regenerate the reserve during grace or decaying', () => {
    ammo.update(1, 'grace');
    expect(ammo.state.reserve).toBe(0);
    ammo.update(1, 'decaying');
    expect(ammo.state.reserve).toBe(0);
  });

  it('reload takes 1100ms and refills the clip from the reserve', () => {
    // Reserve is filled BEFORE the clip empties: tryFire()'s last call
    // auto-starts the reload the instant the clip hits 0 (SRS 4.1 "Reload
    // Automatic on empty"), so a large update() call issued afterward
    // would tick that already-running reload clock too and could finish
    // it early. Filling the reserve first means the only reload in play
    // is the one this test is actually asserting on.
    ammo.update(30, 'tethered'); // reserve -> 240 (capped)
    for (let i = 0; i < 24; i += 1) ammo.tryFire(); // clip -> 0, auto-reload starts
    expect(ammo.state.reloading).toBe(true);

    ammo.update(1.099, 'tethered');
    expect(ammo.state.reloading).toBe(true);
    expect(ammo.state.clip).toBe(0);

    ammo.update(0.001, 'tethered');
    expect(ammo.state.reloading).toBe(false);
    expect(ammo.state.clip).toBe(24);
    expect(ammo.state.reserve).toBe(240 - 24);
  });

  it('reload only transfers as many rounds as the reserve has', () => {
    // Fill the reserve first so tryFire()'s auto-reload is the only
    // reload this test observes (same reasoning as above). The completing
    // update() call passes 'grace', not 'tethered' -- regen is only
    // paused during grace/decaying per SRS 4.2, so a 'tethered' call here
    // would add another 8.8 rounds mid-reload and the transfer would pull
    // from 16.8, not 8, breaking the "reserve has less than the mag needs"
    // scenario this test exists to check.
    ammo.update(1, 'tethered'); // reserve -> 8
    for (let i = 0; i < 24; i += 1) ammo.tryFire(); // clip -> 0, auto-reload starts
    ammo.update(1.1, 'grace');
    expect(ammo.state.clip).toBe(8);
    expect(ammo.state.reserve).toBe(0);
  });

  it('cannot fire while reloading', () => {
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    ammo.update(5, 'tethered');
    ammo.startReload();
    expect(ammo.tryFire()).toBe(false);
  });

  it('auto-starts a reload when tryFire empties the clip', () => {
    ammo.update(5, 'tethered');
    for (let i = 0; i < 24; i += 1) ammo.tryFire();
    expect(ammo.state.reloading).toBe(true);
  });
});
