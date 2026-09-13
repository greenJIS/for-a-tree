/**
 * Player entity: 8-direction movement with instant response, mouse aim.
 * SRS 3.1.
 */
import Phaser from 'phaser';
import { ARENA, PLAYER } from '../config';
import { FRAME } from '../frames';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Image;

  readonly #scene: Phaser.Scene;
  readonly #keys: {
    up: Phaser.Input.Keyboard.Key[];
    down: Phaser.Input.Keyboard.Key[];
    left: Phaser.Input.Keyboard.Key[];
    right: Phaser.Input.Keyboard.Key[];
  };

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.#scene = scene;

    this.sprite = scene.physics.add.image(x, y, 'sheet', FRAME.player);
    this.sprite.setDisplaySize(40, 40);
    this.sprite.setCollideWorldBounds(true);
    scene.physics.world.setBounds(0, 0, ARENA.width, ARENA.height);

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

  update(): void {
    const dir = new Phaser.Math.Vector2(
      (Player.#anyDown(this.#keys.right) ? 1 : 0) -
        (Player.#anyDown(this.#keys.left) ? 1 : 0),
      (Player.#anyDown(this.#keys.down) ? 1 : 0) -
        (Player.#anyDown(this.#keys.up) ? 1 : 0),
    );

    if (dir.lengthSq() > 0) dir.normalize();
    this.sprite.setVelocity(dir.x * PLAYER.moveSpeed, dir.y * PLAYER.moveSpeed);

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
