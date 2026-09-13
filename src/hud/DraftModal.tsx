/** Draft modal overlay on Generation reached. SRS 6.1, z-30. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { UpgradeCard } from '../game/eventBus';

type DraftPayload = {
  generation: number;
  cards: UpgradeCard[];
};

export function DraftModal() {
  const [draft, setDraft] = useState<DraftPayload | null>(null);

  useEffect(() => {
    const onDraft = (e: DraftPayload) => setDraft(e);
    bus.on('GENERATION_REACHED', onDraft);
    return () => bus.off('GENERATION_REACHED', onDraft);
  }, []);

  if (!draft) return null;

  const handleChoose = (cardId: string) => {
    bus.emit('APPLY_UPGRADE_SELECTION', { cardId });
    bus.emit('RESUME_FROM_DRAFT');
    setDraft(null);
  };

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-xs">
      <div className="flex w-full max-w-3xl flex-col items-center gap-6 border border-sand-800 bg-sand-900 p-8 shadow-2xl">
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-[0.25em] text-growth uppercase">
            Generation {draft.generation} Reached
          </h2>
          <p className="mt-1 text-xs tracking-widest text-white/60 uppercase">
            Select an evolutionary adaptation
          </p>
        </div>

        <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-3">
          {draft.cards.map((card) => (
            <div
              key={card.id}
              className="flex flex-col justify-between border border-sand-800 bg-sand-950 p-5 transition-colors hover:border-growth/60"
            >
              <div className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-bold tracking-wider text-white uppercase">
                    {card.name}
                  </h3>
                  <span
                    className={`shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] tracking-widest uppercase ${
                      card.repeatable
                        ? 'border-growth/40 bg-growth/10 text-growth'
                        : 'border-white/20 bg-white/5 text-white/50'
                    }`}
                  >
                    {card.repeatable ? 'Repeatable' : 'Unique'}
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-white/70">
                  {card.body}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleChoose(card.id)}
                className="mt-6 cursor-pointer border border-growth bg-growth/10 px-4 py-2 text-xs font-semibold tracking-widest text-growth uppercase transition-colors hover:bg-growth hover:text-sand-950"
              >
                Choose
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
