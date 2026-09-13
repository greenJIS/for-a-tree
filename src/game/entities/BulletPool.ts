/**
 * Pre-allocated projectile pool for Carbine, Scatter Pulser, and Mag-Rail Staker.
 * SRS 4.1. Zero runtime allocations in update loop.
 */
import Phaser from 'phaser';
import { ARENA, CARBINE, RAIL, SCATTER } from '../config';
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

    for (const child of this.group.getChildren()) {
      if (isArcadeImage(child)) {
        child.setData('hitIds', new Set<number>());
      }
    }
  }

  fireCarbine(x: number, y: number, rotation: number, damageMult = 1): void {
    const bullet: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(bullet)) return;

    bullet.enableBody(true, x, y, true, true);
    bullet.setFrame(FRAME.bulletCarbine);
    bullet.setDisplaySize(20, 8);
    bullet.setRotation(rotation);
    bullet.setVelocity(
      Math.cos(rotation) * CARBINE.bulletSpeed,
      Math.sin(rotation) * CARBINE.bulletSpeed,
    );
    bullet.setData('damage', CARBINE.damage * damageMult);
    bullet.setData('knockback', CARBINE.knockback);
    bullet.setData('piercing', false);
  }

  fireScatter(x: number, y: number, rotation: number, damageMult = 1): void {
    const halfAngle = SCATTER.spreadAngleRad / 2;
    const step = SCATTER.spreadAngleRad / (SCATTER.pelletCount - 1);

    for (let i = 0; i < SCATTER.pelletCount; i += 1) {
      const bullet: unknown = this.group.getFirstDead(false);
      if (!isArcadeImage(bullet)) break;

      const angle = rotation - halfAngle + step * i;
      bullet.enableBody(true, x, y, true, true);
      bullet.setFrame(FRAME.bulletScatter);
      bullet.setDisplaySize(12, 12);
      bullet.setRotation(angle);
      bullet.setVelocity(
        Math.cos(angle) * SCATTER.bulletSpeed,
        Math.sin(angle) * SCATTER.bulletSpeed,
      );
      bullet.setData('damage', SCATTER.damage * damageMult);
      bullet.setData('knockback', SCATTER.knockback);
      bullet.setData('piercing', false);
    }
  }

  fireRail(x: number, y: number, rotation: number, damageMult = 1): void {
    const bullet: unknown = this.group.getFirstDead(false);
    if (!isArcadeImage(bullet)) return;

    bullet.enableBody(true, x, y, true, true);
    bullet.setFrame(FRAME.bulletRail);
    bullet.setDisplaySize(40, 6);
    bullet.setRotation(rotation);
    bullet.setVelocity(
      Math.cos(rotation) * RAIL.bulletSpeed,
      Math.sin(rotation) * RAIL.bulletSpeed,
    );
    bullet.setData('damage', RAIL.damage * damageMult);
    bullet.setData('knockback', RAIL.knockback);
    bullet.setData('piercing', true);
    const set = bullet.getData('hitIds') as Set<number> | undefined;
    if (set instanceof Set) {
      set.clear();
    } else {
      bullet.setData('hitIds', new Set<number>());
    }
  }

  /** Backwards compatibility alias for fireCarbine */
  fire(x: number, y: number, rotation: number): void {
    this.fireCarbine(x, y, rotation, 1);
  }

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

  static damage(bullet: Phaser.Physics.Arcade.Image): number {
    const d: unknown = bullet.getData('damage');
    return typeof d === 'number' ? d : CARBINE.damage;
  }

  static knockback(bullet: Phaser.Physics.Arcade.Image): number {
    const k: unknown = bullet.getData('knockback');
    return typeof k === 'number' ? k : CARBINE.knockback;
  }

  static isPiercing(bullet: Phaser.Physics.Arcade.Image): boolean {
    return bullet.getData('piercing') === true;
  }

  static hasHit(bullet: Phaser.Physics.Arcade.Image, enemyId: number): boolean {
    const set = bullet.getData('hitIds');
    return set instanceof Set && set.has(enemyId);
  }

  static recordHit(bullet: Phaser.Physics.Arcade.Image, enemyId: number): void {
    const set = bullet.getData('hitIds');
    if (set instanceof Set) set.add(enemyId);
  }

  static kill(bullet: Phaser.Physics.Arcade.Image): void {
    bullet.disableBody(true, true);
  }
}
