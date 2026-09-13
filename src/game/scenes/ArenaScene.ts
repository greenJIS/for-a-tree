/**
 * The one Phaser scene. Owns every entity and drives the pure systems.
 * SRS 2.1.
 */
import Phaser from 'phaser';
import { AURA_RADIUS_BASE, BARREN_MARGIN, TREE_POS } from '../config';
import { FRAME } from '../frames';
import spritesheetUrl from '../../assets/spritesheet.png';

export class ArenaScene extends Phaser.Scene {
  constructor() {
    super('arena');
  }

  preload(): void {
    this.load.spritesheet('sheet', spritesheetUrl, {
      frameWidth: 512,
      frameHeight: 512,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#1a1410');

    // Barren ring first, so the bright aura ring draws over it.
    // Delta spec 7.3.
    const barren = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    barren.setDisplaySize(
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
      (AURA_RADIUS_BASE + BARREN_MARGIN) * 2,
    );
    barren.setAlpha(0.25);
    barren.setTint(0x6b7280);

    const aura = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    aura.setDisplaySize(AURA_RADIUS_BASE * 2, AURA_RADIUS_BASE * 2);
    aura.setTint(0x22d3ee);

    const tree = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.treeSprout,
    );
    tree.setDisplaySize(64, 64);
  }
}
