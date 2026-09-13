/** Aegis Pulse Battery status badge. SRS 6.1, bottom-left. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import { HudPanel, type HudPanelTone } from './HudPanel';

type AegisPayload = {
  charges: number;
  capacity: number;
  activeRemainingMs: number;
};

export function AegisBadge() {
  const [status, setStatus] = useState<AegisPayload>({
    charges: 0,
    capacity: 1,
    activeRemainingMs: 0,
  });

  useEffect(() => {
    const onStatus = (e: AegisPayload) => setStatus(e);
    bus.on('AEGIS_STATUS', onStatus);
    return () => bus.off('AEGIS_STATUS', onStatus);
  }, []);

  const isActive = status.activeRemainingMs > 0;
  const isCharged = status.charges > 0;

  const seconds = Math.ceil(status.activeRemainingMs / 1000);

  const text = isActive
    ? `[SPACE] AEGIS ${seconds}s`
    : isCharged
      ? `[SPACE] AEGIS x${status.charges}`
      : '[SPACE] AEGIS OFFLINE';

  const tone: HudPanelTone = isActive || isCharged ? 'tether' : 'idle';
  const textStyle = isActive
    ? 'text-tether font-semibold'
    : isCharged
      ? 'text-tether animate-pulse'
      : 'text-white/40';

  return (
    <HudPanel
      tone={tone}
      className={`text-xs tracking-widest uppercase ${textStyle}`}
    >
      {text}
    </HudPanel>
  );
}
