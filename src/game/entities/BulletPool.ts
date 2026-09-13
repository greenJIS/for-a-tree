/**
 * Pre-allocated projectile pool. SRS 8 requires zero runtime allocation in
 * update, so the group is filled once at construction and recycled.
 */
import Phaser from 'phaser';
import { ARENA, CARBINE } from '../config';
import { FRAME } from '../frames';
import { isArcadeImage } from '../guards';

export class BulletPool {
  readonly group: Phaser.Physics.Arcade.Group;

  constructor(scene: Phaser.Scene, size: number) {
    this.group = scene.physics.add.group({
      defaultKey: 'sheet',
      defaultFrame: FRAME.bulletCarbine,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.bulletCarbine,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  fire(x: number, y: number, rotation: number): void {
    const bullet: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(bullet)) return;

    bullet.enableBody(true, x, y, true, true);
    bullet.setDisplaySize(20, 8);
    bullet.setRotation(rotation);
    bullet.setVelocity(
      Math.cos(rotation) * CARBINE.bulletSpeed,
      Math.sin(rotation) * CARBINE.bulletSpeed,
    );
  }

  /** Recycle anything that has left the arena. */
  cull(): void {
    for (const child of this.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      const bullet = child;
      if (
        bullet.x < -32 ||
        bullet.x > ARENA.width + 32 ||
        bullet.y < -32 ||
        bullet.y > ARENA.height + 32
      ) {
        bullet.disableBody(true, true);
      }
    }
  }

  static kill(bullet: Phaser.Physics.Arcade.Image): void {
    bullet.disableBody(true, true);
  }
}
