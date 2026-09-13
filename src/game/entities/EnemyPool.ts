/**
 * Pooled Dune Swarmers. Every mutant computes a live Euclidean pursuit
 * vector toward the player and ignores the tree entirely. SRS 4.3.
 */
import Phaser from 'phaser';
import { SWARMER } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';

export class EnemyPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, size: number) {
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

  spawn(x: number, y: number): void {
    const enemy: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(enemy)) return;

    enemy.enableBody(true, x, y, true, true);
    enemy.setDisplaySize(36, 36);
    enemy.setData('hp', SWARMER.hp);
    enemy.setData('nextMeleeAtMs', 0);
  }

  /** Recompute every live pursuit vector. */
  pursue(targetX: number, targetY: number): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const enemy = child;

      const angle = Phaser.Math.Angle.Between(
        enemy.x,
        enemy.y,
        targetX,
        targetY,
      );
      enemy.setVelocity(
        Math.cos(angle) * SWARMER.speed,
        Math.sin(angle) * SWARMER.speed,
      );
      enemy.setRotation(angle);
    }
  }

  static hp(enemy: Phaser.Physics.Arcade.Image): number {
    const value: unknown = enemy.getData('hp');
    return typeof value === 'number' ? value : 0;
  }

  static setHp(enemy: Phaser.Physics.Arcade.Image, value: number): void {
    enemy.setData('hp', value);
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

  static kill(enemy: Phaser.Physics.Arcade.Image): void {
    enemy.disableBody(true, true);
  }
}
