/** Three-state tether beacon. SRS 6.1. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { TetherState } from '../game/eventBus';
import { HudPanel } from './HudPanel';

const LABEL: Record<TetherState, string> = {
  tethered: 'Tethered',
  grace: 'Leaving',
  decaying: 'Decaying -0.6 %/s',
};

const STYLE: Record<TetherState, string> = {
  tethered: 'text-tether',
  grace: 'text-grace animate-pulse',
  decaying: 'text-decay animate-pulse',
};

export function TetherBeacon() {
  const [state, setState] = useState<TetherState>('tethered');

  useEffect(() => {
    const onChange = (e: { state: TetherState }) => setState(e.state);
    bus.on('TETHER_STATE_CHANGED', onChange);
    return () => bus.off('TETHER_STATE_CHANGED', onChange);
  }, []);

  return (
    <HudPanel className={`text-xs tracking-widest uppercase ${STYLE[state]}`}>
      {LABEL[state]}
    </HudPanel>
  );
}
