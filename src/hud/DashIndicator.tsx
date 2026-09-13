/** Dash cooldown indicator. Delta spec 7.2, bottom-left beside Aegis. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type DashPayload = { cooldownRemainingMs: number; ready: boolean };

export function DashIndicator() {
  const [ready, setReady] = useState(true);
  const [cooldownMs, setCooldownMs] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);

  useEffect(() => {
    const onStatus = (e: DashPayload) => {
      setReady(e.ready);
      if (!e.ready) {
        setCooldownMs(e.cooldownRemainingMs);
        setPulseKey((k) => k + 1);
      }
    };
    bus.on('DASH_STATUS', onStatus);
    return () => bus.off('DASH_STATUS', onStatus);
  }, []);

  return (
    <div
      className={`relative overflow-hidden border px-3 py-1.5 text-xs tracking-widest uppercase transition-colors ${
        ready
          ? 'border-growth/40 bg-growth/10 text-growth'
          : 'border-sand-800 bg-sand-950/60 text-white/40'
      }`}
    >
      {!ready && (
        <div
          key={pulseKey}
          className="absolute inset-0 origin-left bg-white/10"
          style={{ animation: `dash-cooldown ${cooldownMs}ms linear forwards` }}
        />
      )}
      <span className="relative">
        {ready ? '[SHIFT] DASH READY' : '[SHIFT] DASH'}
      </span>
    </div>
  );
}
