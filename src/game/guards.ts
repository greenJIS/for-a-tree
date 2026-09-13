/**
 * Narrowing helpers for Phaser's loosely-typed boundaries.
 *
 * Global Constraints ban `as`. Phaser's physics overlap callbacks and group
 * accessors are typed as unions, so this guard is the sanctioned way to get
 * a concrete type out of them.
 */
import Phaser from 'phaser';

export function isArcadeImage(
  obj: unknown,
): obj is Phaser.Physics.Arcade.Image {
  return obj instanceof Phaser.Physics.Arcade.Image;
}
