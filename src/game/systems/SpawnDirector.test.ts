import { describe, expect, it } from 'vitest';
import { SpawnDirector } from './SpawnDirector';

/** A scripted RNG: returns values from a fixed queue, in order. */
function scriptedRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

describe('SpawnDirector', () => {
  it('spawns nothing when alive threat already meets the target', () => {
    const director = new SpawnDirector(scriptedRng([0]));
    // targetThreat(0) = 3. aliveThreat already at 3 -> no spawn.
    expect(director.update(0.016, 3)).toEqual([]);
  });

  it('spawns Swarmers to close the gap to the initial threat target', () => {
    const director = new SpawnDirector(scriptedRng([0, 0, 0]));
    // targetThreat(0) = 3. aliveThreat 0, Swarmer threat 1 -> spawns until
    // the 2/sec cap or the threat gap closes, whichever comes first.
    const spawned = director.update(0.016, 0);
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every((k) => k === 'swarmer')).toBe(true);
  });

  it('never spawns more than 2 per second', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    const spawned = director.update(0.016, 0);
    expect(spawned.length).toBeLessThanOrEqual(2);
  });

  it('resets the per-second spawn budget on the next second', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    director.update(0.9, 0);
    const secondBatch = director.update(0.2, 0);
    // Crossing from t=0.9 to t=1.1 enters a new whole second, so the
    // 2-per-second cap resets and more spawns become available.
    expect(secondBatch.length).toBeGreaterThan(0);
  });

  it('does not unlock the Bio-Detonator before 45 seconds', () => {
    // rng pinned near 1 so the director always picks the LAST unlocked
    // kind -- before 45s that's still 'swarmer' (only kind unlocked), so
    // this only proves something once the 45s test below flips it to
    // 'detonator' with the identical rng script.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 44; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).not.toContain('detonator');
  });

  it('unlocks the Bio-Detonator at 45 seconds', () => {
    // Two kinds unlocked (swarmer, detonator); rng near 1 selects index 1
    // = 'detonator', the last entry in the unlocked list.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 45; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).toContain('detonator');
  });

  it('unlocks the Bio-Detonator at exactly 45.0 elapsed seconds, not one tick later', () => {
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    // 45 whole-second updates lands elapsedSec at exactly 45.0.
    for (let t = 0; t < 45; t += 1) director.update(1, 100);
    // No extra update here (unlike the pre-existing "unlocks at 45 seconds"
    // test, which advances to 46s) -- this checks the exact boundary.
    const spawned = director.update(0, 0);
    expect(spawned).toContain('detonator');
  });

  it('does not unlock the Carapace Brute before 90 seconds', () => {
    // Two kinds unlocked (swarmer, detonator) for the whole loop; rng near
    // 1 selects 'detonator', never 'brute'.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 89; t += 1) director.update(1, 100);
    const spawned = director.update(0, 0);
    expect(spawned).not.toContain('brute');
  });

  it('unlocks the Carapace Brute at 90 seconds', () => {
    // Three kinds unlocked; rng near 1 selects index 2 = 'brute'.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0.99)));
    for (let t = 0; t < 90; t += 1) director.update(1, 100);
    const spawned = director.update(1, 0);
    expect(spawned).toContain('brute');
  });

  it('threat target grows linearly at 1/6 per second', () => {
    // targetThreat(60) = 3 + 60/6 = 13. With aliveThreat pinned at 12, a
    // single point of threat is missing, so exactly one Swarmer spawns
    // (assuming an uncapped per-second budget). dtSec is 0 on the final
    // call so targetThreat lands on exactly 13 -- a nonzero fractional dt
    // here (e.g. 0.016) nudges the target to ~13.003, which is still above
    // 13 after one spawn and triggers an unwanted second one.
    const director = new SpawnDirector(scriptedRng(new Array(20).fill(0)));
    for (let t = 0; t < 60; t += 1) director.update(1, 100);
    const spawned = director.update(0, 12);
    expect(spawned.length).toBe(1);
  });
});
