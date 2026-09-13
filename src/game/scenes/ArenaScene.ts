/**
 * The one Phaser scene. Owns every entity and drives the pure systems.
 * SRS 2.1.
 */
import Phaser from 'phaser';
import {
  ARENA,
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  CARBINE,
  GROWTH_CEILING,
  MELEE_COOLDOWN_MS,
  PLAYER,
  TICK_INTERVAL_MS,
  TREE_POS,
} from '../config';
import { FRAME } from '../frames';
import { BulletPool } from '../entities/BulletPool';
import { EnemyPool } from '../entities/EnemyPool';
import { Player } from '../entities/Player';
import { SpawnDirector, type MutantKind } from '../systems/SpawnDirector';
import { TetherSystem } from '../systems/TetherSystem';
import { TreeSystem } from '../systems/TreeSystem';
import { bus } from '../eventBus';
import type { TetherState } from '../eventBus';
import { isArcadeImage } from '../guards';
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
  #enemies!: EnemyPool;
  #hp: number = PLAYER.maxHp;
  #invulnUntilMs = 0;
  #kills = 0;
  #startedAtMs = 0;
  #over = false;
  #director = new SpawnDirector();
  #elapsedSec = 0;
  #msSinceDifficultyTick = 0;

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
    this.#enemies = new EnemyPool(this, 60);

    this.#startedAtMs = this.time.now;

    this.physics.add.overlap(
      this.#bullets.group,
      this.#enemies.group,
      (bulletObj, enemyObj) => {
        if (!isArcadeImage(bulletObj) || !isArcadeImage(enemyObj)) return;
        const bullet = bulletObj;
        const enemy = enemyObj;
        if (!bullet.active || !enemy.active) return;

        BulletPool.kill(bullet);

        const damage =
          CARBINE.damage * (1 - EnemyPool.ballisticReduction(enemy));
        const remaining = EnemyPool.hp(enemy) - damage;
        if (remaining <= 0) {
          EnemyPool.kill(enemy);
          this.#kills += 1;
          return;
        }

        EnemyPool.setHp(enemy, remaining);
        enemy.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
        this.time.delayedCall(60, () => enemy.clearTint());
      },
    );

    this.physics.add.overlap(
      this.#player.sprite,
      this.#enemies.group,
      (_playerObj, enemyObj) => {
        if (!isArcadeImage(enemyObj)) return;
        this.#takeMeleeFrom(enemyObj);
      },
    );

    bus.emit('PLAYER_HP_CHANGED', {
      current: this.#hp,
      max: PLAYER.maxHp,
    });
  }

  override update(_time: number, delta: number): void {
    if (this.#over) return;

    const dtSec = delta / 1000;
    this.#elapsedSec += dtSec;

    let aliveThreat = 0;
    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      aliveThreat += EnemyPool.threat(child);
    }
    for (const kind of this.#director.update(dtSec, aliveThreat)) {
      this.#spawnAtEdge(kind);
    }

    this.#msSinceDifficultyTick += delta;
    if (this.#msSinceDifficultyTick >= TICK_INTERVAL_MS) {
      this.#msSinceDifficultyTick = 0;
      let aliveEnemies = 0;
      for (const child of this.#enemies.group.getChildren()) {
        if (isArcadeImage(child) && child.active) aliveEnemies += 1;
      }
      bus.emit('DIFFICULTY_TICK', {
        elapsedMs: this.#elapsedSec * 1000,
        waveLabel: Math.floor(this.#elapsedSec / 30) + 1,
        aliveEnemies,
      });
    }

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
    this.#enemies.pursue(this.#player.x, this.#player.y);

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

  #takeMeleeFrom(enemy: Phaser.Physics.Arcade.Image): void {
    if (this.#over || !enemy.active) return;

    const now = this.time.now;
    if (now < this.#invulnUntilMs) return;
    if (now < EnemyPool.nextMeleeAtMs(enemy)) return;
    if (this.#player.isDashing) return;

    EnemyPool.setNextMeleeAtMs(enemy, now + MELEE_COOLDOWN_MS);
    this.#invulnUntilMs = now + PLAYER.invulnMs;
    this.#hp = Math.max(0, this.#hp - EnemyPool.melee(enemy));

    bus.emit('PLAYER_HP_CHANGED', {
      current: this.#hp,
      max: PLAYER.maxHp,
    });

    this.cameras.main.shake(80, 0.004);
    this.tweens.add({
      targets: this.#player.sprite,
      alpha: 0.2,
      duration: 1000 / PLAYER.flickerHz / 2,
      yoyo: true,
      repeat: Math.floor((PLAYER.invulnMs / 1000) * PLAYER.flickerHz),
      onComplete: () => this.#player.sprite.setAlpha(1),
    });

    if (this.#hp === 0) this.#endRun();
  }

  #endRun(): void {
    this.#over = true;
    this.physics.pause();
    bus.emit('GAME_OVER', {
      score: this.#kills * 50,
      generation: this.#tree.generation,
      kills: this.#kills,
      survivedMs: this.time.now - this.#startedAtMs,
    });
  }

  #spawnAtEdge(kind: MutantKind): void {
    const inset = 24;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const edge = Phaser.Math.Between(0, 3);
      const x =
        edge === 0 || edge === 2
          ? Phaser.Math.Between(inset, ARENA.width - inset)
          : edge === 1
            ? ARENA.width - inset
            : inset;
      const y =
        edge === 1 || edge === 3
          ? Phaser.Math.Between(inset, ARENA.height - inset)
          : edge === 0
            ? inset
            : ARENA.height - inset;

      const distance = Phaser.Math.Distance.Between(
        x,
        y,
        this.#player.x,
        this.#player.y,
      );
      if (distance >= 120) {
        this.#enemies.spawn(x, y, kind, this.#elapsedSec);
        return;
      }
    }
  }
}
