/**
 * The single channel between Phaser and React. SRS 2.2, amended by
 * docs/superpowers/specs/2026-09-13-for-a-tree-loop-correction-design.md
 * section 6.
 *
 * The Phaser scene is the source of truth. React holds a mirror for
 * rendering only and must never write game state.
 */
import mitt from 'mitt';

export type TetherState = 'tethered' | 'grace' | 'decaying';

export type CatalystTier = 'silt' | 'nitrate' | 'phyto';

export type UpgradeCard = {
  id: string;
  name: string;
  body: string;
  effect: string;
  repeatable: boolean;
};

export type GameEvents = {
  // Phaser -> React
  PLAYER_HP_CHANGED: { current: number; max: number };
  AMMO_UPDATED: {
    weaponId: string;
    clip: number;
    clipMax: number;
    reserve: number;
    reloading: boolean;
  };
  WEAPON_SWITCHED: { weaponId: string; unlocked: string[] };
  TREE_GROWTH_TICK: {
    maturityPct: number;
    generation: number;
    ratePerSec: number;
    ceilingPct: number;
  };
  GROWTH_STALLED: { ceilingPct: number };
  TETHER_STATE_CHANGED: { state: TetherState };
  CATALYSTS_CARRIED: { tiers: CatalystTier[]; cap: number };
  CATALYSTS_DELIVERED: { totalPct: number; count: number };
  GENERATION_REACHED: { generation: number; cards: UpgradeCard[] };
  AEGIS_STATUS: {
    charges: number;
    capacity: number;
    activeRemainingMs: number;
  };
  DASH_STATUS: { cooldownRemainingMs: number; ready: boolean };
  DIFFICULTY_TICK: {
    elapsedMs: number;
    waveLabel: number;
    aliveEnemies: number;
  };
  SCORE_UPDATED: { score: number };
  GAME_OVER: {
    score: number;
    generation: number;
    kills: number;
    survivedMs: number;
  };

  // React -> Phaser
  APPLY_UPGRADE_SELECTION: { cardId: string };
  RESUME_FROM_DRAFT: void;
  TOGGLE_PAUSE: void;
  RESTART_SIMULATION: void;
};

export const bus = mitt<GameEvents>();
