/** Carried-catalyst pips, next to the maturity gauge. SRS 6.1, 3.3. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { CatalystTier } from '../game/eventBus';

const TIER_COLOR: Record<CatalystTier, string> = {
  silt: 'bg-[#a8875a]',
  nitrate: 'bg-growth',
  phyto: 'bg-[#a855f7]',
};

export function CarriedCatalystPips() {
  const [tiers, setTiers] = useState<CatalystTier[]>([]);
  const [cap, setCap] = useState(3);

  useEffect(() => {
    const onChange = (e: { tiers: CatalystTier[]; cap: number }) => {
      setTiers(e.tiers);
      setCap(e.cap);
    };
    bus.on('CATALYSTS_CARRIED', onChange);
    return () => bus.off('CATALYSTS_CARRIED', onChange);
  }, []);

  if (cap === 0) return null;

  return (
    <div className="flex gap-1">
      {Array.from({ length: cap }, (_, i) => (
        <div
          key={i}
          className={`h-2 w-2 rounded-full ${
            i < tiers.length ? TIER_COLOR[tiers[i]] : 'bg-white/20'
          }`}
        />
      ))}
    </div>
  );
}
