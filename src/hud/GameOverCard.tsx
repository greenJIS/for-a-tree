/** Game-over scorecard on the modal layer. SRS 2.1, z-30. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Summary = {
  score: number;
  generation: number;
  kills: number;
  survivedMs: number;
};

export function GameOverCard() {
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    const onOver = (e: Summary) => setSummary(e);
    bus.on('GAME_OVER', onOver);
    return () => bus.off('GAME_OVER', onOver);
  }, []);

  if (!summary) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80">
      <div className="flex flex-col items-center gap-4 border border-sand-800 bg-sand-900 px-12 py-10">
        <h2 className="text-2xl tracking-[0.3em] text-decay uppercase">
          Guardian Fallen
        </h2>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm text-white/70">
          <dt>Generations</dt>
          <dd className="text-right text-growth">{summary.generation}</dd>
          <dt>Kills</dt>
          <dd className="text-right">{summary.kills}</dd>
          <dt>Survived</dt>
          <dd className="text-right">
            {Math.floor(summary.survivedMs / 1000)}s
          </dd>
          <dt>Score</dt>
          <dd className="text-right">{summary.score}</dd>
        </dl>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-2 border border-growth px-6 py-2 text-xs tracking-widest text-growth uppercase hover:bg-growth/10"
        >
          Redeploy
        </button>
      </div>
    </div>
  );
}
