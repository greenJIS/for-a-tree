/**
 * Continuous threat-budget spawn director. SRS 5.1.
 *
 * No wave state machine: targetThreat(t) climbs linearly with elapsed run
 * time, and the director tops up alive threat toward that target, capped at
 * two spawns per second so a difficulty spike cannot dump a crowd at once.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { DIRECTOR_PRESETS, type DirectorConfig } from '../config';

export type MutantKind = 'swarmer' | 'brute' | 'detonator';

const UNLOCK_ORDER: MutantKind[] = ['swarmer', 'detonator', 'brute'];

export class SpawnDirector {
  readonly #rng: () => number;
  readonly #config: DirectorConfig;
  #elapsedSec = 0;
  #currentSecond = 0;
  #spawnedThisSecond = 0;

  constructor(
    rng: () => number = Math.random,
    config: DirectorConfig = DIRECTOR_PRESETS.hard,
  ) {
    this.#rng = rng;
    this.#config = config;
  }

  /**
   * Advance the director by one frame and return the kinds to spawn.
   *
   * @param dtSec Delta time in seconds.
   * @param aliveThreat The sum of `threat` for every currently-alive enemy,
   *   as tracked by the caller.
   */
  update(dtSec: number, aliveThreat: number): MutantKind[] {
    const elapsedBeforeUpdate = this.#elapsedSec;
    this.#elapsedSec += dtSec;

    const wholeSecond = Math.floor(this.#elapsedSec);
    if (wholeSecond !== this.#currentSecond) {
      this.#currentSecond = wholeSecond;
      this.#spawnedThisSecond = 0;
    }

    const targetThreat =
      this.#config.baseThreat + elapsedBeforeUpdate * this.#config.threatPerSec;
    const unlocked = this.#unlockedKinds();

    const spawned: MutantKind[] = [];
    let projectedThreat = aliveThreat;

    while (
      projectedThreat < targetThreat &&
      this.#spawnedThisSecond + spawned.length < this.#config.maxSpawnsPerSecond
    ) {
      const kind = unlocked[Math.floor(this.#rng() * unlocked.length)];
      spawned.push(kind);
      projectedThreat += SpawnDirector.threatOf(kind);
    }

    this.#spawnedThisSecond += spawned.length;
    return spawned;
  }

  #unlockedKinds(): MutantKind[] {
    return UNLOCK_ORDER.filter(
      (kind) => this.#elapsedSec >= this.#config.unlockAtSec[kind],
    );
  }

  static threatOf(kind: MutantKind): number {
    if (kind === 'swarmer') return 1;
    if (kind === 'detonator') return 2;
    return 4;
  }
}
