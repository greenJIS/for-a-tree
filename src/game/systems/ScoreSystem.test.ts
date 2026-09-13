import { beforeEach, describe, expect, it } from 'vitest';
import { ScoreSystem } from './ScoreSystem';

describe('ScoreSystem', () => {
  let scoreSystem: ScoreSystem;
  let fakeStorage: Record<string, string>;

  beforeEach(() => {
    fakeStorage = {};
    const mockStorage = {
      getItem: (k: string) => fakeStorage[k] ?? null,
      setItem: (k: string, v: string) => {
        fakeStorage[k] = v;
      },
    };
    scoreSystem = new ScoreSystem(mockStorage as Storage);
  });

  it('computes exact score formula from SRS 5.4', () => {
    // formula: kills * 50 + floor(elapsedSeconds / 30) * 250 + generations * 2500 + catalystsDelivered * 25
    const score = scoreSystem.calculate({
      kills: 10,
      elapsedSec: 75, // floor(75 / 30) = 2 -> 500 pts
      generations: 1, // 2500 pts
      catalystsDelivered: 4, // 100 pts
    });
    // 10*50 (500) + 2*250 (500) + 1*2500 (2500) + 4*25 (100) = 3600
    expect(score).toBe(3600);
  });

  it('reads 0 high score when storage is empty', () => {
    expect(scoreSystem.getHighScore()).toBe(0);
  });

  it('persists a new high score if score exceeds previous', () => {
    expect(scoreSystem.saveHighScore(1200)).toBe(1200);
    expect(scoreSystem.getHighScore()).toBe(1200);
  });

  it('does not overwrite higher score with lower score', () => {
    scoreSystem.saveHighScore(2000);
    expect(scoreSystem.saveHighScore(1500)).toBe(2000);
    expect(scoreSystem.getHighScore()).toBe(2000);
  });

  it('handles invalid or non-numeric storage gracefully', () => {
    fakeStorage['foratree.highscore'] = 'invalid_number';
    expect(scoreSystem.getHighScore()).toBe(0);
  });

  it('handles storage errors gracefully', () => {
    const errorStorage = {
      getItem: () => {
        throw new Error('access denied');
      },
      setItem: () => {
        throw new Error('quota exceeded');
      },
    };
    const errSystem = new ScoreSystem(errorStorage as unknown as Storage);
    expect(errSystem.getHighScore()).toBe(0);
    expect(errSystem.saveHighScore(100)).toBe(100);
  });

  it('works without storage passed', () => {
    const noStorageSystem = new ScoreSystem();
    expect(noStorageSystem.getHighScore()).toBe(0);
    expect(noStorageSystem.saveHighScore(500)).toBe(500);
  });
});
