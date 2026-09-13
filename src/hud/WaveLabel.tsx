/** Current wave indicator in top-centre cluster. SRS 6.1. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function WaveLabel() {
  const [wave, setWave] = useState(1);

  useEffect(() => {
    const onTick = (e: { waveLabel: number }) => setWave(e.waveLabel);
    bus.on('DIFFICULTY_TICK', onTick);
    return () => bus.off('DIFFICULTY_TICK', onTick);
  }, []);

  return (
    <div className="text-xs tracking-[0.25em] text-white/70 uppercase">
      WAVE {wave}
    </div>
  );
}
