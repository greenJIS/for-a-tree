/**
 * One-shot particle bursts for death, delivery, barren-zone voids, and
 * muzzle flashes. SRS 6.2. Every effect reuses existing spritesheet frames
 * (FRAME.particle, FRAME.muzzleFlash) tinted per call site -- no new art,
 * no shaders, per CLAUDE.md.
 *
 * One emitter per effect type, created once and fired with `.explode()`,
 * so nothing allocates per burst.
 */
import Phaser from 'phaser';
import { MUZZLE_OFFSET } from '../config';
import { FRAME } from '../frames';

export class ParticleFX {
  readonly #splatter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #spore: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #dust: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly #muzzle: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.#splatter = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 300,
        speed: { min: 60, max: 160 },
        scale: { start: 0.06, end: 0 },
        quantity: 10,
        tint: 0xdc2626,
        emitting: false,
      })
      .setDepth(20);

    this.#spore = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 500,
        speed: { min: 40, max: 120 },
        scale: { start: 0.07, end: 0 },
        quantity: 12,
        tint: 0x3ddc84,
        emitting: false,
      })
      .setDepth(20);

    this.#dust = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.particle,
        lifespan: 400,
        speed: { min: 20, max: 60 },
        scale: { start: 0.05, end: 0 },
        alpha: { start: 0.5, end: 0 },
        quantity: 6,
        tint: 0x6b7280,
        emitting: false,
      })
      .setDepth(20);

    this.#muzzle = scene.add
      .particles(0, 0, 'sheet', {
        frame: FRAME.muzzleFlash,
        lifespan: 80,
        speed: 0,
        scale: { start: 0.08, end: 0 },
        quantity: 1,
        tint: 0xffffff,
        blendMode: Phaser.BlendModes.ADD,
        emitting: false,
      })
      .setDepth(20);
  }

  /** Red death splatter. Called on every enemy kill. */
  splatter(x: number, y: number): void {
    this.#splatter.explode(10, x, y);
  }

  /** Green spore burst. Called on every catalyst delivery. */
  sporeBurst(x: number, y: number): void {
    this.#spore.explode(12, x, y);
  }

  /** Grey dust puff, no chime -- a kill inside the barren zone that drops nothing. */
  dustPuff(x: number, y: number): void {
    this.#dust.explode(6, x, y);
  }

  /** White muzzle flash at the gun tip, offset from the player along their aim. */
  muzzleFlash(x: number, y: number, rotation: number): void {
    this.#muzzle.setConfig({ rotate: Phaser.Math.RadToDeg(rotation) });
    this.#muzzle.explode(
      1,
      x + Math.cos(rotation) * MUZZLE_OFFSET,
      y + Math.sin(rotation) * MUZZLE_OFFSET,
    );
  }
}
