/**
 * Canister ejection and rest-position math. SRS 3.6, clamped by delta spec
 * section 4's barren zone: a canister must never come to rest closer to the
 * tree than barrenRadius, or catalysts would cash in for free without a
 * carry step.
 *
 * Rather than tune an Arcade Physics drag body to stop at an exact point,
 * this computes the natural drag-stopping distance analytically
 * (travel = speed^2 / (2 * drag)) and clamps it, then hands the caller a
 * rest position and a duration to animate a tween over -- deterministic and
 * unit-testable without a physics engine.
 *
 * Pure TypeScript by design -- no Phaser import -- so it is unit-testable.
 */
import { AURA_RADIUS_BASE, BARREN_MARGIN, CANISTER } from '../config';

export type CanisterRest = {
  x: number;
  y: number;
  travelPx: number;
  durationMs: number;
};

const BARREN_RADIUS = AURA_RADIUS_BASE + BARREN_MARGIN;

export function computeCanisterRest(
  killX: number,
  killY: number,
  treeX: number,
  treeY: number,
  rng: () => number = Math.random,
): CanisterRest {
  const homeDist = Math.hypot(treeX - killX, treeY - killY);

  if (homeDist < CANISTER.nearTreeThresholdPx) {
    const angle = rng() * Math.PI * 2;
    const speed =
      CANISTER.nearTreeEjectSpeedMin +
      rng() * (CANISTER.nearTreeEjectSpeedMax - CANISTER.nearTreeEjectSpeedMin);
    const travelPx = (speed * speed) / (2 * CANISTER.drag);
    return {
      x: killX + Math.cos(angle) * travelPx,
      y: killY + Math.sin(angle) * travelPx,
      travelPx,
      durationMs: speed > 0 ? (travelPx / speed) * 1000 * 2 : 1,
    };
  }

  const dirX = (treeX - killX) / homeDist;
  const dirY = (treeY - killY) / homeDist;

  const speed =
    CANISTER.ejectSpeedMin +
    rng() * (CANISTER.ejectSpeedMax - CANISTER.ejectSpeedMin);
  const naturalTravel = (speed * speed) / (2 * CANISTER.drag);
  const maxAllowedTravel = Math.max(0, homeDist - BARREN_RADIUS);
  const travelPx = Math.min(naturalTravel, maxAllowedTravel);

  return {
    x: killX + dirX * travelPx,
    y: killY + dirY * travelPx,
    travelPx,
    durationMs: speed > 0 ? (travelPx / speed) * 1000 * 2 : 1,
  };
}
