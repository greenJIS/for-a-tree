/**
 * Maturity gauge with the growth-ceiling tick mark. Delta spec 7.1.
 *
 * Below the ceiling the fill is growth-coloured and the live rate shows.
 * At or above it the fill switches to the catalyst colour and the rate is
 * replaced by CATALYST REQUIRED -- the only tutorial the ceiling gets.
 * GROWTH_STALLED additionally fires a one-shot pulse at the exact moment
 * the ceiling is first crossed, since the derived colour swap alone is easy
 * to miss mid-combat.
 */
import { useEffect, useRef, useState } from 'react';
import { bus } from '../game/eventBus';
import { HudPanel } from './HudPanel';

export function MaturityGauge() {
  const [maturityPct, setMaturityPct] = useState(0);
  const [generation, setGeneration] = useState(0);
  const [ratePerSec, setRatePerSec] = useState(0);
  const [ceilingPct, setCeilingPct] = useState(60);
  const [justStalled, setJustStalled] = useState(false);
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    const onStalled = () => {
      setJustStalled(true);
      clearTimeout(pulseTimer.current);
      pulseTimer.current = setTimeout(() => setJustStalled(false), 400);
    };
    bus.on('TREE_GROWTH_TICK', onTick);
    bus.on('GROWTH_STALLED', onStalled);
    return () => {
      bus.off('TREE_GROWTH_TICK', onTick);
      bus.off('GROWTH_STALLED', onStalled);
      clearTimeout(pulseTimer.current);
    };
  }, []);

  const stalled = maturityPct >= ceilingPct;

  return (
    <HudPanel className="flex w-80 flex-col gap-1">
      <div className="flex justify-between text-xs tracking-widest uppercase">
        <span className="text-white/70">Maturity</span>
        <span className="text-growth">Gen {generation}</span>
      </div>

      <div
        className={`relative h-3 w-full overflow-hidden rounded-sm bg-black/60 ${
          justStalled ? 'animate-pulse' : ''
        }`}
      >
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
    </HudPanel>
  );
}
