/** Rust-red screen-edge vignette while decaying. SRS 6.2. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { TetherState } from '../game/eventBus';

export function DecayVignette() {
  const [decaying, setDecaying] = useState(false);

  useEffect(() => {
    const onChange = (e: { state: TetherState }) =>
      setDecaying(e.state === 'decaying');
    bus.on('TETHER_STATE_CHANGED', onChange);
    return () => bus.off('TETHER_STATE_CHANGED', onChange);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-0 transition-opacity
        duration-400 ${decaying ? 'opacity-100' : 'opacity-0'}`}
      style={{
        boxShadow: 'inset 0 0 160px 40px rgba(244, 63, 94, 0.55)',
      }}
    />
  );
}
