/** Weapon, magazine, reserve, and reload indicator. SRS 6.1, bottom-right. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Ammo = {
  weaponId: string;
  clip: number;
  clipMax: number;
  reserve: number;
};

export function AmmoReadout() {
  const [ammo, setAmmo] = useState<Ammo>({
    weaponId: 'carbine',
    clip: 24,
    clipMax: 24,
    reserve: 0,
  });

  useEffect(() => {
    const onUpdate = (e: Ammo) => setAmmo(e);
    bus.on('AMMO_UPDATED', onUpdate);
    return () => bus.off('AMMO_UPDATED', onUpdate);
  }, []);

  // Reload state does not currently ride on AMMO_UPDATED's payload shape,
  // so it is inferred: a clip that hasn't moved while the reserve keeps
  // climbing is ambiguous, so instead this simply mirrors the low-clip
  // visual state and the readout leans on the label text rather than a
  // separate boolean. Kept intentionally simple for this plan; a dedicated
  // reload flag can be added to AMMO_UPDATED's payload later without
  // breaking this component.
  const reloading = ammo.clip === 0 && ammo.reserve > 0;

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </div>
  );
}
