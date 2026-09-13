/**
 * Pooled mutants: Dune Swarmer, Carapace Brute, Bio-Detonator. Every mutant
 * computes a live Euclidean pursuit vector toward the player and ignores
 * the tree entirely. SRS 4.3.
 *
 * All three kinds share one pool and one physics group so a Detonator's
 * explosion (Task 8) can scan for and damage nearby enemies of any kind
 * with a single group query.
 */
import Phaser from 'phaser';
import { BRUTE, DETONATOR, DIRECTOR, SWARMER } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';
import type { MutantKind } from '../systems/SpawnDirector';

type Stats = {
  frame: number;
  displaySize: number;
  speed: number;
  hp: number;
  melee: number;
  threat: number;
  ballisticReduction: number;
};

const STATS: Record<MutantKind, Stats> = {
  swarmer: {
    frame: FRAME.swarmer,
    displaySize: 36,
    speed: SWARMER.speed,
    hp: SWARMER.hp,
    melee: SWARMER.melee,
    threat: SWARMER.threat,
    ballisticReduction: 0,
  },
  brute: {
    frame: FRAME.brute,
    displaySize: BRUTE.displaySize,
    speed: BRUTE.speed,
    hp: BRUTE.hp,
    melee: BRUTE.melee,
    threat: BRUTE.threat,
    ballisticReduction: BRUTE.ballisticReduction,
  },
  detonator: {
    frame: FRAME.detonator,
    displaySize: DETONATOR.displaySize,
    speed: DETONATOR.speed,
    hp: DETONATOR.hp,
    melee: DETONATOR.melee,
    threat: DETONATOR.threat,
    ballisticReduction: 0,
  },
};

export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;
  readonly #scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, size: number) {
    this.#scene = scene;
    this.group = scene.physics.add.group({
      defaultKey: 'sheet',
      defaultFrame: FRAME.swarmer,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.swarmer,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  /**
   * @param elapsedSec Elapsed run seconds at spawn time. Stat ramp (SRS
   *   5.1) is snapshotted into this instance's hp/melee and fixed for its
   *   lifetime -- later ramp changes do not retroactively affect it.
   */
  spawn(x: number, y: number, kind: MutantKind, elapsedSec: number): void {
    const enemy: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(enemy)) return;

    const stats = STATS[kind];
    const rampSteps = Math.floor(elapsedSec / 60);
    const hpMult = 1 + DIRECTOR.hpRampPer60s * rampSteps;
    const dmgMult = 1 + DIRECTOR.dmgRampPer60s * rampSteps;

    this.#scene.tweens.killTweensOf(enemy);
    enemy.enableBody(true, x, y, true, true);
    enemy.setAlpha(1);
    enemy.setFrame(stats.frame);
    enemy.setDisplaySize(stats.displaySize, stats.displaySize);
    enemy.clearTint();
    enemy.setData('kind', kind);
    enemy.setData('hp', stats.hp * hpMult);
    enemy.setData('melee', stats.melee * dmgMult);
    enemy.setData('nextMeleeAtMs', 0);
    enemy.setData('lockedUntilMs', 0);
  }

  /** Recompute every live pursuit vector. */
  pursue(targetX: number, targetY: number): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const enemy = child;

      // A locked Bio-Detonator (Task 8) holds position through its
      // telegraph rather than continuing to close in.
      const lockedUntilMs: unknown = enemy.getData('lockedUntilMs');
      if (typeof lockedUntilMs === 'number' && lockedUntilMs > 0) continue;

      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        targetX,
        targetY,
      );
      const speed = STATS[EnemyPool.kind(enemy)].speed;
      enemy.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
      enemy.setRotation(angle);
    }
  }

  static kind(enemy: Phaser.Physics.Arcade.Image): MutantKind {
    const value: unknown = enemy.getData('kind');
    return value === 'brute' || value === 'detonator' ? value : 'swarmer';
  }

  static hp(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('hp');
    return typeof value === 'number' ? value : 0;
  }

  static setHp(enemy: Phaser.Physics.Arcade.Image, value: number): void {
    enemy.setData('hp', value);
  }

  static melee(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('melee');
    return typeof value === 'number' ? value : 0;
  }

  static threat(enemy: Phaser.Physics.Arcade.Image): number {
    return STATS[EnemyPool.kind(enemy)].threat;
  }

  static ballisticReduction(enemy: Phaser.Physics.Arcade.Image): number {
    return STATS[EnemyPool.kind(enemy)].ballisticReduction;
  }

  static nextMeleeAtMs(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('nextMeleeAtMs');
    return typeof value === 'number' ? value : 0;
  }

  static setNextMeleeAtMs(
    enemy: Phaser.Physics.Arcade.Image,
    value: number,
  ): void {
    enemy.setData('nextMeleeAtMs', value);
  }

  static lockedUntilMs(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('lockedUntilMs');
    return typeof value === 'number' ? value : 0;
  }

  static setLockedUntilMs(
    enemy: Phaser.Physics.Arcade.Image,
    value: number,
  ): void {
    enemy.setData('lockedUntilMs', value);
  }

  static kill(enemy: Phaser.Physics.Arcade.Image): void {
    enemy.disableBody(true, true);
  }
}
