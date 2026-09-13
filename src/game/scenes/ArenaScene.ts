/**
 * The one Phaser scene. Owns every entity and drives the pure systems.
 * SRS 2.1.
 */
import Phaser from 'phaser';
import {
  AEGIS,
  ARENA,
  AURA_RADIUS_BASE,
  BARREN_MARGIN,
  CARBINE,
  CATALYST_VALUE,
  DETONATOR,
  GROWTH_CEILING,
  MELEE_COOLDOWN_MS,
  PLAYER,
  RAIL,
  SCATTER,
  TICK_INTERVAL_MS,
  TREE_POS,
  UPGRADE_EFFECTS,
} from '../config';
import { FRAME } from '../frames';
import { BulletPool } from '../entities/BulletPool';
import { CanisterPool } from '../entities/CanisterPool';
import { EnemyPool } from '../entities/EnemyPool';
import { Player } from '../entities/Player';
import { AegisSystem } from '../systems/AegisSystem';
import { ScoreSystem } from '../systems/ScoreSystem';
import { UpgradeSystem } from '../systems/UpgradeSystem';
import { WeaponInventory, type WeaponId } from '../systems/WeaponInventory';
import { CarrySystem } from '../systems/CarrySystem';
import { PityDropSystem } from '../systems/PityDropSystem';
import { SpawnDirector, type MutantKind } from '../systems/SpawnDirector';
import { TetherSystem } from '../systems/TetherSystem';
import { TreeSystem } from '../systems/TreeSystem';
import { ParticleFX } from '../systems/ParticleFX';
import { SoundEffects } from '../audio/SoundEffects';
import { bus } from '../eventBus';
import type { TetherState } from '../eventBus';
import { isArcadeImage } from '../guards';
import spritesheetUrl from '../../assets/spritesheet.png';
import groundUrl from '../../assets/ground.png';

const WEAPON_FIRE_RATES: Record<WeaponId, number> = {
  carbine: CARBINE.fireRatePerSec,
  scatter: SCATTER.fireRatePerSec,
  rail: RAIL.fireRatePerSec,
};

const WEAPON_MAG_SIZES: Record<WeaponId, number> = {
  carbine: CARBINE.magSize,
  scatter: SCATTER.magSize,
  rail: RAIL.magSize,
};

export class ArenaScene extends Phaser.Scene {
  #audio = new SoundEffects();
  #player!: Player;
  #tether = new TetherSystem();
  #tree = new TreeSystem();
  #auraSprite!: Phaser.GameObjects.Image;
  #barrenSprite!: Phaser.GameObjects.Image;
  #treeSprite!: Phaser.GameObjects.Image;
  #lastTetherState: TetherState = 'tethered';
  #msSinceTick = 0;
  #bullets!: BulletPool;
  #nextShotAtMs = 0;
  #weapons = new WeaponInventory();
  #lastEmittedAmmo: {
    weaponId: WeaponId;
    clip: number;
    clipMax: number;
    reserve: number;
    reloading: boolean;
  } | null = null;
  #reloadKey?: Phaser.Input.Keyboard.Key;
  #key1?: Phaser.Input.Keyboard.Key;
  #key2?: Phaser.Input.Keyboard.Key;
  #key3?: Phaser.Input.Keyboard.Key;
  #escKey?: Phaser.Input.Keyboard.Key;
  #pKey?: Phaser.Input.Keyboard.Key;
  #nextEnemyId = 0;
  #aegis = new AegisSystem();
  #aegisSprite!: Phaser.GameObjects.Image;
  #spaceKey?: Phaser.Input.Keyboard.Key;
  #lastAegisCharges = -1;
  #lastAegisCapacity = -1;
  #lastAegisActive = false;
  #lastAegisRemainingSec = -1;
  #msSinceAegisTick = 0;
  #enemies!: EnemyPool;
  #canisters!: CanisterPool;
  #particles!: ParticleFX;
  #carry = new CarrySystem();
  #pity = new PityDropSystem();
  #hp: number = PLAYER.maxHp;
  #invulnUntilMs = 0;
  #kills = 0;
  #catalystsDeliveredCount = 0;
  #over = false;
  #director = new SpawnDirector();
  #elapsedSec = 0;
  #msSinceDifficultyTick = 0;
  #upgrades = new UpgradeSystem();
  #scores = new ScoreSystem();
  #pausedForDraft = false;
  #pendingDraftGenerations: number[] = [];
  #isPaused = false;

  get #maxHp(): number {
    return PLAYER.maxHp + this.#upgrades.maxHpBonus;
  }

  get #auraRadius(): number {
    return AURA_RADIUS_BASE + this.#upgrades.auraRadiusBonus;
  }

  #triggerGeneration(generation: number): void {
    this.#audio.generation();
    this.#aegis.grantCharge(this.#upgrades.aegisCapacity);
    this.cameras.main.flash(300, 220, 255, 200);
    this.#playGenerationRing();

    if (this.#pausedForDraft) {
      this.#pendingDraftGenerations.push(generation);
    } else {
      this.#pausedForDraft = true;
      this.physics.pause();
      this.#audio.setMusicIntensity(false);
      this.time.delayedCall(500, () => {
        const cards = this.#upgrades.draw(generation);
        bus.emit('GENERATION_REACHED', { generation, cards });
      });
    }
  }

  #playGenerationRing(): void {
    const ring = this.add.graphics();
    ring.setPosition(TREE_POS.x, TREE_POS.y);
    ring.lineStyle(4, 0x3ddc84, 1);
    ring.strokeCircle(0, 0, 20);
    ring.setDepth(50);
    this.tweens.add({
      targets: ring,
      alpha: 0,
      scale: 7,
      duration: 500,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  #emitAegisStatus(nowMs: number): void {
    const charges = this.#aegis.charges;
    const capacity = this.#upgrades.aegisCapacity;
    const isAegisActive = this.#aegis.isActive(nowMs);
    const activeRemainingMs = isAegisActive
      ? this.#aegis.activeRemainingMs(nowMs)
      : 0;
    this.#lastAegisCharges = charges;
    this.#lastAegisCapacity = capacity;
    this.#lastAegisActive = isAegisActive;
    this.#lastAegisRemainingSec = Math.ceil(activeRemainingMs / 1000);
    bus.emit('AEGIS_STATUS', {
      charges,
      capacity,
      activeRemainingMs,
    });
  }

  constructor() {
    super('arena');
  }

  preload(): void {
    this.load.spritesheet('sheet', spritesheetUrl, {
      frameWidth: 512,
      frameHeight: 512,
    });
    this.load.image('ground', groundUrl);
  }

  create(): void {
    this.#tether = new TetherSystem();
    this.#tree = new TreeSystem();
    this.#weapons = new WeaponInventory();
    this.#aegis = new AegisSystem();
    this.#carry = new CarrySystem();
    this.#pity = new PityDropSystem();
    this.#director = new SpawnDirector();
    this.#upgrades = new UpgradeSystem();
    this.#scores = new ScoreSystem();

    this.#hp = PLAYER.maxHp;
    this.#invulnUntilMs = 0;
    this.#kills = 0;
    this.#catalystsDeliveredCount = 0;
    this.#over = false;
    this.#isPaused = false;
    this.#pausedForDraft = false;
    this.#pendingDraftGenerations = [];
    this.#elapsedSec = 0;
    this.#msSinceTick = 0;
    this.#msSinceAegisTick = 0;
    this.#msSinceDifficultyTick = 0;
    this.#nextShotAtMs = 0;
    this.#nextEnemyId = 0;
    this.#lastTetherState = 'tethered';
    this.#lastEmittedAmmo = null;
    this.#lastAegisCharges = -1;
    this.#lastAegisCapacity = -1;
    this.#lastAegisActive = false;
    this.#lastAegisRemainingSec = -1;

    this.physics.resume();
    this.#audio.stopMusic();
    this.#audio.startMusic();
    this.#audio.setMusicIntensity(true);

    this.input.on('pointerdown', () => this.#audio.resume());
    this.input.keyboard?.on('keydown', () => this.#audio.resume());

    this.add.tileSprite(
      ARENA.width / 2,
      ARENA.height / 2,
      ARENA.width,
      ARENA.height,
      'ground',
    );

    // Barren ring first, so the bright aura ring draws over it.
    // Delta spec 7.3.
    this.#barrenSprite = this.add.image(
      TREE_POS.x,
      TREE_POS.y,
      'sheet',
      FRAME.auraRing,
    );
    this.#barrenSprite.setDisplaySize(
      (this.#auraRadius + BARREN_MARGIN) * 2,
      (this.#auraRadius + BARREN_MARGIN) * 2,
    );
    this.#barrenSprite.setAlpha(0.25);
    this.#barrenSprite.setTint(0x6b7280);

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
    this.#aegisSprite = this.add.image(
      this.#player.x,
      this.#player.y,
      'sheet',
      FRAME.aegisDome,
    );
    this.#aegisSprite.setDisplaySize(64, 64);
    this.#aegisSprite.setDepth(5);
    this.#aegisSprite.setBlendMode(Phaser.BlendModes.ADD);
    this.#aegisSprite.setVisible(false);

    this.#bullets = new BulletPool(this, 200);
    this.#enemies = new EnemyPool(this, 60);
    this.#enemies.group.getChildren().forEach((child, index) => {
      child.setData('id', index + 1);
    });
    this.#canisters = new CanisterPool(this, 30);
    this.#particles = new ParticleFX(this);

    const keyboard = this.input.keyboard;
    if (keyboard) {
      this.#reloadKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
      this.#spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      keyboard.addCapture([Phaser.Input.Keyboard.KeyCodes.SPACE]);
      this.#key1 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ONE);
      this.#key2 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.TWO);
      this.#key3 = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.THREE);
      this.#escKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
      this.#pKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    }

    this.physics.add.overlap(
      this.#bullets.group,
      this.#enemies.group,
      (bulletObj, enemyObj) => {
        if (!isArcadeImage(bulletObj) || !isArcadeImage(enemyObj)) return;
        const bullet = bulletObj;
        const enemy = enemyObj;
        if (!bullet.active || !enemy.active) return;

        if (BulletPool.isPiercing(bullet)) {
          let enemyId = enemy.getData('id');
          if (typeof enemyId !== 'number') {
            enemyId = ++this.#nextEnemyId;
            enemy.setData('id', enemyId);
          }
          if (BulletPool.hasHit(bullet, enemyId)) return;
          BulletPool.recordHit(bullet, enemyId);
        } else {
          BulletPool.kill(bullet);
        }

        const damage =
          BulletPool.damage(bullet) * (1 - EnemyPool.ballisticReduction(enemy));
        const remaining = EnemyPool.hp(enemy) - damage;
        if (remaining <= 0) {
          const killX = enemy.x;
          const killY = enemy.y;
          EnemyPool.kill(enemy);
          this.#kills += 1;
          this.#handleKillDrop(killX, killY);
          this.#particles.splatter(killX, killY);
          this.#audio.alienSplat();
          return;
        }

        EnemyPool.setHp(enemy, remaining);

        const kb = BulletPool.knockback(bullet);
        if (kb > 0 && enemy.body instanceof Phaser.Physics.Arcade.Body) {
          const angle = bullet.rotation;
          enemy.setVelocity(
            enemy.body.velocity.x + Math.cos(angle) * kb,
            enemy.body.velocity.y + Math.sin(angle) * kb,
          );
        }

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
      max: this.#maxHp,
    });

    bus.emit('WEAPON_SWITCHED', {
      weaponId: this.#weapons.activeWeaponId,
      unlocked: this.#weapons.unlockedIds,
    });

    const activeId = this.#weapons.activeWeaponId;
    const clip = this.#weapons.activeClip;
    const clipMax = WEAPON_MAG_SIZES[activeId];
    const reserve = Math.floor(this.#weapons.activeReserve);
    const reloading = this.#weapons.isReloading;
    this.#lastEmittedAmmo = {
      weaponId: activeId,
      clip,
      clipMax,
      reserve,
      reloading,
    };
    bus.emit('AMMO_UPDATED', {
      weaponId: activeId,
      clip,
      clipMax,
      reserve,
      reloading,
    });

    this.#emitAegisStatus(this.time.now);

    bus.emit('SCORE_UPDATED', { score: 0 });
    bus.emit('TREE_GROWTH_TICK', {
      maturityPct: 0,
      generation: 0,
      ratePerSec: 0,
      ceilingPct: GROWTH_CEILING,
    });
    bus.emit('TETHER_STATE_CHANGED', { state: 'tethered' });
    bus.emit('CATALYSTS_CARRIED', {
      tiers: [],
      cap: this.#upgrades.carryCapacity,
    });
    bus.emit('DIFFICULTY_TICK', {
      elapsedMs: 0,
      waveLabel: 1,
      aliveEnemies: 0,
    });

    const onApplyUpgrade = ({ cardId }: { cardId: string }) => {
      this.#upgrades.apply(cardId);
      if (cardId === 'scatter-requisition') {
        this.#weapons.unlock('scatter');
        bus.emit('WEAPON_SWITCHED', {
          weaponId: this.#weapons.activeWeaponId,
          unlocked: this.#weapons.unlockedIds,
        });
      } else if (cardId === 'rail-requisition') {
        this.#weapons.unlock('rail');
        bus.emit('WEAPON_SWITCHED', {
          weaponId: this.#weapons.activeWeaponId,
          unlocked: this.#weapons.unlockedIds,
        });
      } else if (cardId === 'bio-surge') {
        const result = this.#tree.deliver(UPGRADE_EFFECTS.bioSurgeMaturityPct);
        if (result.generationTriggered) {
          this.#triggerGeneration(result.generation);
        }
      } else if (cardId === 'kinetic-dampers') {
        this.#hp = this.#maxHp;
        bus.emit('PLAYER_HP_CHANGED', {
          current: this.#hp,
          max: this.#maxHp,
        });
      } else if (cardId === 'nano-suture-kit') {
        this.#hp = Math.min(
          this.#maxHp,
          this.#hp + UPGRADE_EFFECTS.nanoSutureHealHp,
        );
        bus.emit('PLAYER_HP_CHANGED', {
          current: this.#hp,
          max: this.#maxHp,
        });
        this.#player.setSpeedMultiplier(
          this.#carry.speedMultiplier() * this.#upgrades.moveSpeedMult,
        );
      } else if (cardId === 'wider-canopy') {
        this.#auraSprite.setDisplaySize(
          this.#auraRadius * 2,
          this.#auraRadius * 2,
        );
        this.#barrenSprite.setDisplaySize(
          (this.#auraRadius + BARREN_MARGIN) * 2,
          (this.#auraRadius + BARREN_MARGIN) * 2,
        );
      } else if (cardId === 'vacuum-coils') {
        bus.emit('CATALYSTS_CARRIED', {
          tiers: this.#carry.tiers,
          cap: this.#upgrades.carryCapacity,
        });
      } else if (cardId === 'second-wind') {
        this.#emitAegisStatus(this.time.now);
      }
    };

    const onResumeFromDraft = () => {
      if (this.#over) return;
      if (this.#pendingDraftGenerations.length > 0) {
        const nextGen = this.#pendingDraftGenerations.shift()!;
        const cards = this.#upgrades.draw(nextGen);
        bus.emit('GENERATION_REACHED', { generation: nextGen, cards });
      } else {
        this.physics.resume();
        this.#pausedForDraft = false;
        this.#audio.setMusicIntensity(true);
      }
    };

    const onBlur = () => {
      if (this.#over || this.#pausedForDraft || this.#isPaused) return;
      bus.emit('TOGGLE_PAUSE');
    };
    window.addEventListener('blur', onBlur);

    const onTogglePause = () => {
      if (this.#over || this.#pausedForDraft) return;
      this.#isPaused = !this.#isPaused;
      if (this.#isPaused) {
        this.physics.pause();
        this.#audio.setMusicIntensity(false);
      } else {
        this.physics.resume();
        this.#audio.setMusicIntensity(true);
      }
    };

    const onRestartSimulation = () => {
      this.scene.restart();
    };

    bus.on('APPLY_UPGRADE_SELECTION', onApplyUpgrade);
    bus.on('RESUME_FROM_DRAFT', onResumeFromDraft);
    bus.on('TOGGLE_PAUSE', onTogglePause);
    bus.on('RESTART_SIMULATION', onRestartSimulation);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('blur', onBlur);
      bus.off('APPLY_UPGRADE_SELECTION', onApplyUpgrade);
      bus.off('RESUME_FROM_DRAFT', onResumeFromDraft);
      bus.off('TOGGLE_PAUSE', onTogglePause);
      bus.off('RESTART_SIMULATION', onRestartSimulation);
    });
  }

  override update(_time: number, delta: number): void {
    if (!this.#over && !this.#pausedForDraft) {
      if (
        (this.#escKey && Phaser.Input.Keyboard.JustDown(this.#escKey)) ||
        (this.#pKey && Phaser.Input.Keyboard.JustDown(this.#pKey))
      ) {
        bus.emit('TOGGLE_PAUSE');
      }
    }

    if (this.#over || this.#pausedForDraft || this.#isPaused) return;

    const dtSec = delta / 1000;
    this.#elapsedSec += dtSec;

    if (this.#spaceKey && Phaser.Input.Keyboard.JustDown(this.#spaceKey)) {
      if (this.#aegis.tryActivate(this.time.now)) {
        this.#audio.aegisOn();
      }
    }

    const isAegisActive = this.#aegis.isActive(this.time.now);
    this.#aegisSprite.setPosition(this.#player.x, this.#player.y);
    this.#aegisSprite.rotation += dtSec * 1.5;
    this.#aegisSprite.setVisible(isAegisActive);

    this.#msSinceAegisTick += delta;
    const currentCharges = this.#aegis.charges;
    const currentCap = this.#upgrades.aegisCapacity;
    const remainingMs = isAegisActive
      ? this.#aegis.activeRemainingMs(this.time.now)
      : 0;
    const remainingSec = Math.ceil(remainingMs / 1000);

    const aegisChanged =
      currentCharges !== this.#lastAegisCharges ||
      currentCap !== this.#lastAegisCapacity ||
      isAegisActive !== this.#lastAegisActive ||
      (isAegisActive && remainingSec !== this.#lastAegisRemainingSec);

    if (
      aegisChanged ||
      (isAegisActive && this.#msSinceAegisTick >= TICK_INTERVAL_MS)
    ) {
      this.#msSinceAegisTick = 0;
      this.#emitAegisStatus(this.time.now);
    }

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
      const currentScore = this.#scores.calculate({
        kills: this.#kills,
        elapsedSec: this.#elapsedSec,
        generations: this.#tree.generation,
        catalystsDelivered: this.#catalystsDeliveredCount,
      });
      bus.emit('SCORE_UPDATED', { score: currentScore });
    }

    this.#updateDetonators();

    this.#player.update();

    this.#bullets.cull();
    this.#enemies.pursue(this.#player.x, this.#player.y);

    if (isAegisActive) {
      const px = this.#player.x;
      const py = this.#player.y;
      const pBody = this.#player.sprite.body;
      for (const child of this.#enemies.group.getChildren()) {
        if (!isArcadeImage(child) || !child.active) continue;

        const dist = Phaser.Math.Distance.Between(child.x, child.y, px, py);
        const eBody = child.body;
        const isContact =
          dist <= 32 ||
          (pBody &&
            eBody &&
            pBody.right >= eBody.x &&
            pBody.x <= eBody.right &&
            pBody.bottom >= eBody.y &&
            pBody.y <= eBody.bottom);

        if (!isContact) continue;

        const remaining = EnemyPool.hp(child) - AEGIS.retaliationDps * dtSec;
        if (remaining <= 0) {
          const killX = child.x;
          const killY = child.y;
          EnemyPool.kill(child);
          this.#kills += 1;
          this.#handleKillDrop(killX, killY);
          this.#particles.splatter(killX, killY);
          this.#audio.alienSplat();
          continue;
        }

        EnemyPool.setHp(child, remaining);
        const angle = Phaser.Math.Angle.Between(px, py, child.x, child.y);
        child.setVelocity(
          Math.cos(angle) * AEGIS.knockback,
          Math.sin(angle) * AEGIS.knockback,
        );
      }
    }

    const dist = Phaser.Math.Distance.Between(
      this.#player.x,
      this.#player.y,
      TREE_POS.x,
      TREE_POS.y,
    );
    const state = this.#tether.update(dtSec, dist <= this.#auraRadius);

    if (state !== this.#lastTetherState) {
      const prevState = this.#lastTetherState;
      this.#lastTetherState = state;
      bus.emit('TETHER_STATE_CHANGED', { state });
      if (state === 'decaying' && prevState !== 'decaying') {
        this.#audio.decayWarn();
      }
      this.#auraSprite.setTint(
        state === 'tethered'
          ? 0x22d3ee
          : state === 'grace'
            ? 0xfbbf24
            : 0xf43f5e,
      );
    }

    if (state === 'tethered' && this.#carry.count > 0) {
      const { totalPct, count } = this.#carry.deliverAll();
      const result = this.#tree.deliver(
        totalPct * this.#upgrades.catalystValueMult,
      );
      if (result.generationTriggered) {
        this.#triggerGeneration(result.generation);
      }
      this.#catalystsDeliveredCount += count;
      this.#particles.sporeBurst(TREE_POS.x, TREE_POS.y);
      this.#audio.deliver();
      this.#player.setSpeedMultiplier(this.#upgrades.moveSpeedMult);
      bus.emit('CATALYSTS_CARRIED', {
        tiers: [],
        cap: this.#upgrades.carryCapacity,
      });
      bus.emit('CATALYSTS_DELIVERED', {
        totalPct: result.maturityPct,
        count,
      });
    }

    this.#canisters.update(
      this.#player.x,
      this.#player.y,
      this.#upgrades.magnetRadiusMult,
    );
    this.#handleCanisterPickups(state);

    if (this.#key1 && Phaser.Input.Keyboard.JustDown(this.#key1)) {
      if (this.#weapons.switchWeapon('carbine')) {
        bus.emit('WEAPON_SWITCHED', {
          weaponId: this.#weapons.activeWeaponId,
          unlocked: this.#weapons.unlockedIds,
        });
      }
    }
    if (this.#key2 && Phaser.Input.Keyboard.JustDown(this.#key2)) {
      if (this.#weapons.switchWeapon('scatter')) {
        bus.emit('WEAPON_SWITCHED', {
          weaponId: this.#weapons.activeWeaponId,
          unlocked: this.#weapons.unlockedIds,
        });
      }
    }
    if (this.#key3 && Phaser.Input.Keyboard.JustDown(this.#key3)) {
      if (this.#weapons.switchWeapon('rail')) {
        bus.emit('WEAPON_SWITCHED', {
          weaponId: this.#weapons.activeWeaponId,
          unlocked: this.#weapons.unlockedIds,
        });
      }
    }

    const pointer = this.input.activePointer;
    if (
      pointer.leftButtonDown() &&
      this.time.now >= this.#nextShotAtMs &&
      this.#weapons.tryFire()
    ) {
      const activeId = this.#weapons.activeWeaponId;
      this.#nextShotAtMs = this.time.now + 1000 / WEAPON_FIRE_RATES[activeId];
      this.#particles.muzzleFlash(
        this.#player.x,
        this.#player.y,
        this.#player.sprite.rotation,
      );
      if (activeId === 'carbine') {
        this.#bullets.fireCarbine(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.carbine();
      } else if (activeId === 'scatter') {
        this.#bullets.fireScatter(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.scatter();
      } else if (activeId === 'rail') {
        this.#bullets.fireRail(
          this.#player.x,
          this.#player.y,
          this.#player.sprite.rotation,
          this.#upgrades.weaponDamageMult,
        );
        this.#audio.rail();
      }
    }

    if (this.#reloadKey && Phaser.Input.Keyboard.JustDown(this.#reloadKey)) {
      this.#weapons.startReload();
    }

    this.#weapons.update(dtSec, state, this.#upgrades.ammoRegenMult);
    const activeId = this.#weapons.activeWeaponId;
    const clip = this.#weapons.activeClip;
    const clipMax = WEAPON_MAG_SIZES[activeId];
    const displayReserve = Math.floor(this.#weapons.activeReserve);
    const reloading = this.#weapons.isReloading;
    if (
      !this.#lastEmittedAmmo ||
      this.#lastEmittedAmmo.weaponId !== activeId ||
      this.#lastEmittedAmmo.clip !== clip ||
      this.#lastEmittedAmmo.clipMax !== clipMax ||
      this.#lastEmittedAmmo.reserve !== displayReserve ||
      this.#lastEmittedAmmo.reloading !== reloading
    ) {
      this.#lastEmittedAmmo = {
        weaponId: activeId,
        clip,
        clipMax,
        reserve: displayReserve,
        reloading,
      };
      bus.emit('AMMO_UPDATED', {
        weaponId: activeId,
        clip,
        clipMax,
        reserve: displayReserve,
        reloading,
      });
    }

    const result = this.#tree.update(
      dtSec,
      state,
      this.#upgrades.tetherGrowthMult,
      this.#upgrades.decayRateMult,
    );
    if (result.generationTriggered) {
      this.#triggerGeneration(result.generation);
    }
    if (result.stalledCrossing) {
      this.#audio.growthStalled();
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
        ratePerSec: result.ratePerSec * this.#upgrades.tetherGrowthMult,
        ceilingPct: GROWTH_CEILING,
      });
    }
  }

  #takeMeleeFrom(enemy: Phaser.Physics.Arcade.Image): void {
    if (this.#over || !enemy.active) return;
    if (this.#aegis.isActive(this.time.now)) return;

    const now = this.time.now;
    if (now < this.#invulnUntilMs) return;
    if (now < EnemyPool.nextMeleeAtMs(enemy)) return;
    if (this.#player.isDashing) return;

    EnemyPool.setNextMeleeAtMs(enemy, now + MELEE_COOLDOWN_MS);
    this.#invulnUntilMs = now + PLAYER.invulnMs;
    this.#hp = Math.max(0, this.#hp - EnemyPool.melee(enemy));

    bus.emit('PLAYER_HP_CHANGED', {
      current: this.#hp,
      max: this.#maxHp,
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
    this.#carry.clear();
    this.#over = true;
    this.physics.pause();
    const finalScore = this.#scores.calculate({
      kills: this.#kills,
      elapsedSec: this.#elapsedSec,
      generations: this.#tree.generation,
      catalystsDelivered: this.#catalystsDeliveredCount,
    });
    this.#scores.saveHighScore(finalScore);
    bus.emit('SCORE_UPDATED', { score: finalScore });
    bus.emit('GAME_OVER', {
      score: finalScore,
      generation: this.#tree.generation,
      kills: this.#kills,
      survivedMs: this.#elapsedSec * 1000,
    });
  }

  /**
   * Barren-zone eligibility, then pity, then ejection. Delta spec 4: a
   * kill inside barrenRadius produces no canister at all, and does NOT
   * advance the pity counter -- defending the tree must never silently
   * burn the player's accumulated drop odds.
   */
  #handleKillDrop(killX: number, killY: number): void {
    const barrenRadius = this.#auraRadius + BARREN_MARGIN;
    const homeDist = Phaser.Math.Distance.Between(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
    );
    if (homeDist < barrenRadius) {
      this.#particles.dustPuff(killX, killY);
      return;
    }

    const tier = this.#pity.rollOnKill();
    if (!tier) return;

    this.#canisters.eject(
      killX,
      killY,
      TREE_POS.x,
      TREE_POS.y,
      tier,
      this.#auraRadius,
    );
  }

  /**
   * A canister that reaches the player is picked up. While tethered it
   * cashes in immediately, with no carry step -- SRS 3.3. Otherwise it
   * joins the carry stack, capped at 3, and the player's speed multiplier
   * updates to reflect the new weight.
   */
  #handleCanisterPickups(state: TetherState): void {
    for (const child of this.#canisters.group.getChildren()) {
      if (!(child instanceof Phaser.GameObjects.Image) || !child.active)
        continue;
      if (!child.getData('settled')) continue;

      const dist = Phaser.Math.Distance.Between(
        child.x,
        child.y,
        this.#player.x,
        this.#player.y,
      );
      if (dist > 24) continue;

      const tier = CanisterPool.tier(child);

      if (state === 'tethered') {
        const result = this.#tree.deliver(
          CATALYST_VALUE[tier] * this.#upgrades.catalystValueMult,
        );
        if (result.generationTriggered) {
          this.#triggerGeneration(result.generation);
        }
        CanisterPool.kill(child);
        this.#particles.sporeBurst(TREE_POS.x, TREE_POS.y);
        this.#audio.deliver();
        this.#catalystsDeliveredCount += 1;
        bus.emit('CATALYSTS_DELIVERED', {
          totalPct: result.maturityPct,
          count: 1,
        });
        if (this.#pausedForDraft) break;
        continue;
      }

      if (!this.#carry.add(tier, this.#upgrades.carryCapacity)) continue;
      CanisterPool.kill(child);
      this.#audio.pickup();
      this.#player.setSpeedMultiplier(
        this.#carry.speedMultiplier() * this.#upgrades.moveSpeedMult,
      );
      bus.emit('CATALYSTS_CARRIED', {
        tiers: this.#carry.tiers,
        cap: this.#upgrades.carryCapacity,
      });
    }
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

  /**
   * Bio-Detonator telegraph and explosion. SRS 4.3: on closing within
   * lockRangePx of the player it locks in place, flashes white for
   * telegraphMs, then explodes for AoE damage against the player and any
   * other enemy within explosionRadiusPx -- including other Detonators,
   * which makes baiting them into a crowd a real tactic. Killing it during
   * the telegraph (a bullet overlap disables its body) naturally prevents
   * the explosion, since a dead enemy is skipped by every check below.
   */
  #updateDetonators(): void {
    const now = this.time.now;

    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      if (EnemyPool.kind(child) !== 'detonator') continue;

      const lockedUntilMs = EnemyPool.lockedUntilMs(child);

      if (lockedUntilMs === 0) {
        const distToPlayer = Phaser.Math.Distance.Between(
          child.x,
          child.y,
          this.#player.x,
          this.#player.y,
        );
        if (distToPlayer <= DETONATOR.lockRangePx) {
          EnemyPool.setLockedUntilMs(child, now + DETONATOR.telegraphMs);
          child.setVelocity(0, 0);
          this.tweens.add({
            targets: child,
            alpha: 0.3,
            duration: 120,
            yoyo: true,
            repeat: Math.floor(DETONATOR.telegraphMs / 240),
          });
        }
        continue;
      }

      if (now < lockedUntilMs) continue;

      this.#explodeDetonator(child);
    }
  }

  #explodeDetonator(detonator: Phaser.Physics.Arcade.Image): void {
    const damage = EnemyPool.melee(detonator);
    const cx = detonator.x;
    const cy = detonator.y;

    this.#handleKillDrop(cx, cy);
    EnemyPool.kill(detonator);
    this.#kills += 1;
    this.#particles.splatter(cx, cy);
    this.#audio.alienSplat();

    if (
      Phaser.Math.Distance.Between(cx, cy, this.#player.x, this.#player.y) <=
      DETONATOR.explosionRadiusPx
    ) {
      this.#takeExplosionDamage(damage);
    }

    for (const child of this.#enemies.group.getChildren()) {
      if (!isArcadeImage(child) || !child.active) continue;
      if (child === detonator) continue;
      if (
        Phaser.Math.Distance.Between(cx, cy, child.x, child.y) <=
        DETONATOR.explosionRadiusPx
      ) {
        const remaining = EnemyPool.hp(child) - damage;
        if (remaining <= 0) {
          this.#handleKillDrop(child.x, child.y);
          EnemyPool.kill(child);
          this.#kills += 1;
          this.#particles.splatter(child.x, child.y);
          this.#audio.alienSplat();
        } else {
          EnemyPool.setHp(child, remaining);
        }
      }
    }
  }

  #takeExplosionDamage(damage: number): void {
    if (this.#over) return;
    if (this.#aegis.isActive(this.time.now)) return;

    this.#hp = Math.max(0, this.#hp - damage);
    bus.emit('PLAYER_HP_CHANGED', { current: this.#hp, max: this.#maxHp });
    this.cameras.main.shake(120, 0.006);

    if (this.#hp === 0) this.#endRun();
  }
}
