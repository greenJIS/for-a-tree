/**
 * Pooled catalyst canisters: ejection, magnet pull, lifetime, and the
 * despawn warning flash. SRS 3.6.
 *
 * Ejection position is computed once by the pure CanisterPhysics module and
 * animated with a tween rather than a physics body, so the barren-zone
 * clamp from delta spec 4 is exact rather than dependent on drag tuning.
 */
import Phaser from 'phaser';
import { CANISTER } from '../config';
import { computeCanisterRest } from '../systems/CanisterPhysics';
import { FRAME } from '../frames';
import type { CatalystTier } from '../eventBus';

const TIER_TINT: Record<CatalystTier, number> = {
  silt: 0xa8875a,
  nitrate: 0x3ddc84,
  phyto: 0xa855f7,
};

export class CanisterPool {
  readonly group: Phaser.GameObjects.Group;
  readonly #scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, size: number) {
    this.#scene = scene;
    this.group = scene.add.group({
      classType: Phaser.GameObjects.Image,
      defaultKey: 'sheet',
      defaultFrame: FRAME.canister,
      maxSize: size,
    });

    this.group.createMultiple({
      key: 'sheet',
      frame: FRAME.canister,
      quantity: size,
      active: false,
      visible: false,
    });
  }

  eject(
    killX: number,
    killY: number,
    treeX: number,
    treeY: number,
    tier: CatalystTier,
    auraRadius: number,
  ): void {
    const canister: unknown = this.group.getFirstDead(false);
    if (!(canister instanceof Phaser.GameObjects.Image)) return;

    const rest = computeCanisterRest(killX, killY, treeX, treeY, auraRadius);

    canister.setActive(true);
    canister.setVisible(true);
    canister.setPosition(killX, killY);
    canister.setDisplaySize(CANISTER.displaySize, CANISTER.displaySize);
    canister.setAlpha(1);
    canister.setTint(TIER_TINT[tier]);
    canister.setData('tier', tier);
    canister.setData('spawnedAtMs', this.#scene.time.now);
    canister.setData('settled', false);

    this.#scene.tweens.add({
      targets: canister,
      x: rest.x,
      y: rest.y,
      duration: Math.max(1, rest.durationMs),
      ease: 'Quad.easeOut',
      onComplete: () => canister.setData('settled', true),
    });
  }

  /** Magnet pull toward the player, plus lifetime and despawn flashing. */
  update(playerX: number, playerY: number, magnetRadiusMult = 1): void {
    const now = this.#scene.time.now;

    for (const child of this.group.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Image) || !child.active)
        continue;

      const spawnedAtMs: unknown = child.getData('spawnedAtMs');
      const age = now - (typeof spawnedAtMs === 'number' ? spawnedAtMs : now);

      if (age >= CANISTER.lifetimeMs) {
        CanisterPool.kill(child);
        continue;
      }

      if (age >= CANISTER.lifetimeMs - CANISTER.despawnWarnMs) {
        const phase = Math.floor((age / 1000) * CANISTER.despawnFlashHz);
        child.setAlpha(phase % 2 === 0 ? 1 : 0.3);
      }

      if (!child.getData('settled')) continue;

      const dist = Phaser.Math.Distance.Between(
        child.x,
        child.y,
        playerX,
        playerY,
      );
      if (dist <= CANISTER.magnetRadius * magnetRadiusMult && dist > 0) {
        const angle = Phaser.Math.Angle.Between(
          child.x,
          child.y,
          playerX,
          playerY,
        );
        const step = CANISTER.magnetPullSpeed * (1 / 60);
        child.x += Math.cos(angle) * Math.min(step, dist);
        child.y += Math.sin(angle) * Math.min(step, dist);
      }
    }
  }

  static tier(canister: Phaser.GameObjects.Image): CatalystTier {
    const value: unknown = canister.getData('tier');
    return value === 'nitrate' || value === 'phyto' ? value : 'silt';
  }

  static kill(canister: Phaser.GameObjects.Image): void {
    canister.setActive(false);
    canister.setVisible(false);
  }
}
