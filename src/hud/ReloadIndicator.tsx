/** Reload key indicator, bottom-left beside Aegis/Dash. Mirrors AmmoReadout's
 * existing `reloading` field off AMMO_UPDATED -- no new event needed. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';
import type { GameEvents } from '../game/eventBus';
import { HudPanel } from './HudPanel';

type AmmoPayload = GameEvents['AMMO_UPDATED'];

export function ReloadIndicator() {
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    const onUpdate = (e: AmmoPayload) => setReloading(e.reloading);
    bus.on('AMMO_UPDATED', onUpdate);
    return () => bus.off('AMMO_UPDATED', onUpdate);
  }, []);

  return (
    <HudPanel
      tone={reloading ? 'grace' : 'neutral'}
      className={`text-xs tracking-widest uppercase ${
        reloading ? 'text-grace animate-pulse' : 'text-white/40'
      }`}
    >
      {reloading ? '[R] RELOADING' : '[R] RELOAD'}
    </HudPanel>
  );
}
