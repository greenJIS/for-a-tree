/**
 * Player entity: 8-direction movement with instant response, mouse aim.
 * SRS 3.1.
 */
import Phaser from 'phaser';
import { ARENA, DASH, PLAYER } from '../config';
import { FRAME } from '../frames';
import { bus } from '../eventBus';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Image;

  readonly #scene: Phaser.Scene;
  readonly #keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };
  #dashUntilMs = 0;
  #dashReadyAtMs = 0;
  #dashVector = new Phaser.Math.Vector2(0, 0);
  #shiftKey!: Phaser.Input.Keyboard.Key;
  #speedMultiplier = 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.#scene = scene;

    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
    this.sprite.setCollideWorldBounds(true);
    scene.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);

    if (this.sprite.body instanceof Phaser.Physics.Arcade.Body) {
      this.sprite.body.pushable = false;
    }

    const keyboard = scene.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');

    const codes = Phaser.Input.Keyboard.KeyCodes;
    this.#keys = {
      up: [keyboard.addKey(codes.W), keyboard.addKey(codes.UP)],
      down: [keyboard.addKey(codes.S), keyboard.addKey(codes.DOWN)],
      left: [keyboard.addKey(codes.A), keyboard.addKey(codes.LEFT)],
      right: [keyboard.addKey(codes.D), keyboard.addKey(codes.RIGHT)],
    };

    keyboard.addCapture([codes.UP, codes.DOWN, codes.LEFT, codes.RIGHT]);

    this.#shiftKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
  }

  static #anyDown(keys: Phaser.Input.Keyboard.Key[]): boolean {
    return keys.some((key) => key.isDown);
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get isDashing(): boolean {
    return this.#scene.time.now < this.#dashUntilMs;
  }

  setSpeedMultiplier(mult: number): void {
    this.#speedMultiplier = mult;
  }

  /**
   * Start a dash if off cooldown. Direction is the current movement input,
   * or the aim vector when standing still. Delta spec 3.
   */
  tryDash(moveDir: Phaser.Math.Vector2): boolean {
    const now = this.#scene.time.now;
    if (now < this.#dashReadyAtMs || this.isDashing) return false;

    this.#dashVector =
      moveDir.lengthSq() > 0
        ? moveDir.clone().normalize()
        : new Phaser.Math.Vector2(
            Math.cos(this.sprite.rotation),
            Math.sin(this.sprite.rotation),
          );

    this.#dashUntilMs = now + DASH.durationMs;
    this.#dashReadyAtMs = now + DASH.cooldownMs;

    bus.emit('DASH_STATUS', {
      cooldownRemainingMs: DASH.cooldownMs,
      ready: false,
    });
    this.#scene.time.delayedCall(DASH.cooldownMs, () => {
      bus.emit('DASH_STATUS', { cooldownRemainingMs: 0, ready: true });
    });

    for (let i = 0; i < 3; i += 1) {
      this.#scene.time.delayedCall(i * 50, () => this.#spawnGhost());
    }

    return true;
  }

  #spawnGhost(): void {
    const ghost = this.#scene.add.image(
      this.sprite.x,
      this.sprite.y,
      'sheet',
      FRAME.player,
    );
    ghost.setDisplaySize(40, 40);
    ghost.setRotation(this.sprite.rotation);
    ghost.setAlpha(0.4);
    this.#scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: 200,
      onComplete: () => ghost.destroy(),
    });
  }

  update(): void {
    const dir = new Phaser.Math.Vector2(
      (Player.#anyDown(this.#keys.right) ? 1 : 0) -
        (Player.#anyDown(this.#keys.left) ? 1 : 0),
      (Player.#anyDown(this.#keys.down) ? 1 : 0) -
        (Player.#anyDown(this.#keys.up) ? 1 : 0),
    );
    if (dir.lengthSq() > 0) dir.normalize();

    if (Phaser.Input.Keyboard.JustDown(this.#shiftKey)) {
      this.tryDash(dir);
    }

    if (this.isDashing) {
      const speed = DASH.distance / (DASH.durationMs / 1000);
      this.sprite.setVelocity(
        this.#dashVector.x * speed,
        this.#dashVector.y * speed,
      );
    } else {
      this.sprite.setVelocity(
        dir.x * PLAYER.moveSpeed * this.#speedMultiplier,
        dir.y * PLAYER.moveSpeed * this.#speedMultiplier,
      );
    }

    const pointer = this.#scene.input.activePointer;
    this.sprite.setRotation(
      Phaser.Math.Angle.Between(
        this.sprite.x,
        this.sprite.y,
        pointer.worldX,
        pointer.worldY,
      ),
    );
  }
}
