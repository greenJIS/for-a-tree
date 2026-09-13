/** Current wave indicator in top-centre cluster. SRS 6.1. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import { HudPanel } from './HudPanel';

export function WaveLabel() {
  const [wave, setWave] = useState(1);

  useEffect(() => {
    const onTick = (e: { waveLabel: number }) => setWave(e.waveLabel);
    bus.on('DIFFICULTY_TICK', onTick);
    return () => bus.off('DIFFICULTY_TICK', onTick);
  }, []);

  return (
    <HudPanel className="text-xs tracking-[0.25em] text-white/70 uppercase">
      WAVE {wave}
    </HudPanel>
  );
}
