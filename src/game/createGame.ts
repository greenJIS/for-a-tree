/**
 * Phaser.Game construction. Fixed 1280x720 with Scale.FIT and CENTER_BOTH,
 * so the arena letterboxes intact. SRS 2.3 and 8.
 */
import Phaser from 'phaser';
import { ARENA } from './config';
import { ArenaScene } from './scenes/ArenaScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: ARENA.width,
    height: ARENA.height,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [ArenaScene],
  });
}
