/** Dash cooldown indicator. Delta spec 7.2, bottom-left beside Aegis. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { GameEvents } from '../game/eventBus';
import { HudPanel } from './HudPanel';

type DashPayload = GameEvents['DASH_STATUS'];

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
    <HudPanel
      tone={ready ? 'growth' : 'idle'}
      className={`relative overflow-hidden text-xs tracking-widest uppercase ${
        ready ? 'text-growth' : 'text-white/40'
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
    </HudPanel>
  );
}
