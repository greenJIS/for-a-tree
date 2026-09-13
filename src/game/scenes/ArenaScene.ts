/**
 * The one Phaser scene. Owns every entity and drives the pure systems.
 * SRS 2.1.
 */
import Phaser from 'phaser';
import {
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  CARBINE,
  GROWTH_CEILING,
  TICK_INTERVAL_MS,
  TREE_POS,
} from '../config';
import { FRAME } from '../frames';
import { BulletPool } from '../entities/BulletPool';
import { Player } from '../entities/Player';
import { TetherSystem } from '../systems/TetherSystem';
import { TreeSystem } from '../systems/TreeSystem';
import { bus } from '../eventBus';
import type { TetherState } from '../eventBus';
import spritesheetUrl from '../../assets/spritesheet.png';

export class ArenaScene extends Phaser.Scene {
  #player!: Player;
  #tether = new TetherSystem();
  #tree = new TreeSystem();
  #auraSprite!: Phaser.GameObjects.Image;
  #treeSprite!: Phaser.GameObjects.Image;
  #lastTetherState: TetherState = 'tethered';
  #msSinceTick = 0;
  #bullets!: BulletPool;
  #nextShotAtMs = 0;

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

    this.#auraSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    this.#auraSprite.setDisplaySize(AURA_RADIUS_BASE * 2, AURA_RADIUS_BASE * 2);
    this.#auraSprite.setTint(0x22d3ee);

    this.#treeSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.treeSprout,
    );
    this.#treeSprite.setDisplaySize(64, 64);

    this.#player = new Player(this, TREE_POS.x, TREE_POS.y);
    this.#bullets = new BulletPool(this, 200);
  }

  override update(_time: number, delta: number): void {
    const dtSec = delta / 1000;
    this.#player.update();

    const pointer = this.input.activePointer;
    if (pointer.leftButtonDown() && this.time.now >= this.#nextShotAtMs) {
      this.#nextShotAtMs = this.time.now + 1000 / CARBINE.fireRatePerSec;
      this.#bullets.fire(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
    }
    this.#bullets.cull();

    const dist = Phaser.Math.Distance.Between(
      this.#player.x,
      this.#player.y,
      TREE_POS.x,
      TREE_POS.y,
    );
    const state = this.#tether.update(dtSec, dist <= AURA_RADIUS_BASE);

    if (state !== this.#lastTetherState) {
      this.#lastTetherState = state;
      bus.emit('TETHER_STATE_CHANGED', { state });
      this.#auraSprite.setTint(
        state === 'tethered'
          ? 0x22d3ee
          : state === 'grace'
            ? 0xfbbf24
            : 0xf43f5e,
      );
    }

    const result = this.#tree.update(dtSec, state);
    if (result.stalledCrossing) {
      bus.emit('GROWTH_STALLED', { ceilingPct: GROWTH_CEILING });
    }

    const phaseSize = [0, 64, 96, 128, 160][this.#tree.phase];
    this.#treeSprite.setDisplaySize(phaseSize, phaseSize);
    this.#treeSprite.setFrame(
      this.#tree.phase === 1 ? FRAME.treeSprout : FRAME.treeSapling,
    );

    this.#msSinceTick += delta;
    if (this.#msSinceTick >= TICK_INTERVAL_MS) {
      this.#msSinceTick = 0;
      bus.emit('TREE_GROWTH_TICK', {
        maturityPct: result.maturityPct,
        generation: result.generation,
        ratePerSec: result.ratePerSec,
        ceilingPct: GROWTH_CEILING,
      });
    }
  }
}
