/** Aegis Pulse Battery status badge. SRS 6.1, bottom-left. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

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

  const style = isActive
    ? 'text-tether font-semibold border-tether/60 bg-tether/20'
    : isCharged
      ? 'text-tether animate-pulse border-tether/40 bg-tether/10'
      : 'text-white/40 border-sand-800 bg-sand-950/60';

  return (
    <div
      className={`border px-3 py-1.5 text-xs tracking-widest uppercase transition-colors ${style}`}
    >
      {text}
    </div>
  );
}
