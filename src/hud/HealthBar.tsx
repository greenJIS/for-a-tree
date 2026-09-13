/** HP bar and numeric readout. SRS 6.1, top-left. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function HealthBar() {
  const [hp, setHp] = useState({ current: 100, max: 100 });

  useEffect(() => {
    const onChange = (e: { current: number; max: number }) => setHp(e);
    bus.on('PLAYER_HP_CHANGED', onChange);
    return () => bus.off('PLAYER_HP_CHANGED', onChange);
  }, []);

  return (
    <div className="flex w-56 flex-col gap-1">
      <div className="h-3 w-full overflow-hidden rounded-sm bg-black/60">
        <div
          className="h-full bg-decay transition-[width] duration-150"
          style={{ width: `${(hp.current / hp.max) * 100}%` }}
        />
      </div>
      <span className="text-xs tracking-widest text-white/70 uppercase">
        HP {Math.round(hp.current)} / {hp.max}
      </span>
    </div>
  );
}
