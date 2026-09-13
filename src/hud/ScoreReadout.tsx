/** Live score and high-score readout. SRS 6.1, top-right. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import { ScoreSystem } from '../game/systems/ScoreSystem';

export function ScoreReadout() {
  const [score, setScore] = useState(0);
  const [savedHigh] = useState(() => new ScoreSystem().getHighScore());

  useEffect(() => {
    const onScore = (e: { score: number }) => setScore(e.score);
    bus.on('SCORE_UPDATED', onScore);
    bus.on('GAME_OVER', onScore);
    return () => {
      bus.off('SCORE_UPDATED', onScore);
      bus.off('GAME_OVER', onScore);
    };
  }, []);

  const highScore = Math.max(savedHigh, score);

  return (
    <div className="flex flex-col items-end gap-0.5 text-right">
      <span className="text-xs tracking-widest text-white/50 uppercase">
        HI: {highScore}
      </span>
      <span className="text-sm tracking-widest text-growth uppercase">
        SCORE: {score}
      </span>
    </div>
  );
}
