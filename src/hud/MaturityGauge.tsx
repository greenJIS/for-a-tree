/**
 * Maturity gauge with the growth-ceiling tick mark. Delta spec 7.1.
 *
 * Below the ceiling the fill is growth-coloured and the live rate shows.
 * At or above it the fill switches to the catalyst colour and the rate is
 * replaced by CATALYST REQUIRED — the only tutorial the ceiling gets.
 */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function MaturityGauge() {
  const [maturityPct, setMaturityPct] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [ratePerSec, setRatePerSec] = useState(0);
  const [ceilingPct, setCeilingPct] = useState(60);

  useEffect(() => {
    const onTick = (e: {
      maturityPct: number;
      generation: number;
      ratePerSec: number;
      ceilingPct: number;
    }) => {
      setMaturityPct(e.maturityPct);
      setGeneration(e.generation);
      setRatePerSec(e.ratePerSec);
      setCeilingPct(e.ceilingPct);
    };
    bus.on('TREE_GROWTH_TICK', onTick);
    return () => bus.off('TREE_GROWTH_TICK', onTick);
  }, []);

  const stalled = maturityPct >= ceilingPct;

  return (
    <div className="flex w-80 flex-col gap-1">
      <div className="flex justify-between text-xs tracking-widest uppercase">
        <span className="text-white/70">Maturity</span>
        <span className="text-growth">Gen {generation}</span>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className={`h-full transition-[width] duration-100 ease-linear ${
            stalled ? 'bg-grace' : 'bg-growth'
          }`}
          style={{ width: `${Math.min(100, maturityPct)}%` }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-white/80"
          style={{ left: `${ceilingPct}%` }}
        />
      </div>

      <div className="text-center text-[10px] tracking-widest uppercase">
        {stalled ? (
          <span className="text-grace">Catalyst required</span>
        ) : (
          <span className="text-white/50">+{ratePerSec.toFixed(2)} %/s</span>
        )}
      </div>
    </div>
  );
}
