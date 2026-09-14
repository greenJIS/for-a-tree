/** Difficulty-select screen shown before a run starts. Fills the game's
 * aspect-video frame the same way Hud's modals do, but has no game to lay
 * over yet -- it renders in place of the Phaser canvas + Hud, not on top of
 * them. SRS 2.1. */
import type { DifficultyMode } from '../game/config';

const MODE_ORDER: readonly DifficultyMode[] = ['easy', 'medium', 'hard'];

const MODE_COPY: Record<DifficultyMode, { label: string; body: string }> = {
  easy: {
    label: 'Easy',
    body: 'Lighter mutant pressure. Learn the loop.',
  },
  medium: {
    label: 'Medium',
    body: 'Balanced pressure. Recommended.',
  },
  hard: {
    label: 'Hard',
    body: 'Full mutant pressure from the start.',
  },
};

type Props = {
  onSelect: (mode: DifficultyMode) => void;
};

export function TitleScreen({ onSelect }: Props) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-10 bg-sand-950">
      <h1 className="text-3xl font-bold tracking-[0.3em] text-growth uppercase">
        For a Tree
      </h1>
      <div className="flex gap-4">
        {MODE_ORDER.map((mode) => {
          const isRecommended = mode === 'medium';
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onSelect(mode)}
              className={
                isRecommended
                  ? 'flex w-40 cursor-pointer flex-col items-center gap-2 border border-growth bg-growth/10 px-6 py-4 text-center text-xs font-semibold tracking-widest text-growth uppercase transition-colors hover:bg-growth hover:text-sand-950'
                  : 'flex w-40 cursor-pointer flex-col items-center gap-2 border border-sand-700 bg-sand-950/60 px-6 py-4 text-center text-xs font-semibold tracking-widest text-white/70 uppercase transition-colors hover:border-growth hover:bg-growth/10 hover:text-growth'
              }
            >
              <span>{MODE_COPY[mode].label}</span>
              <span className="text-[10px] font-normal normal-case tracking-normal text-white/50">
                {MODE_COPY[mode].body}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
