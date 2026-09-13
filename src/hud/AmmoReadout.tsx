/** Weapon, magazine, reserve, and reload indicator. SRS 6.1, bottom-right. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

type Ammo = {
  weaponId: string;
  clip: number;
  clipMax: number;
  reserve: number;
  reloading: boolean;
};

export function AmmoReadout() {
  const [ammo, setAmmo] = useState<Ammo>({
    weaponId: 'carbine',
    clip: 24,
    clipMax: 24,
    reserve: 0,
    reloading: false,
  });

  useEffect(() => {
    const onUpdate = (e: Ammo) => setAmmo(e);
    const onSwitch = (e: { weaponId: string; unlocked: string[] }) =>
      setAmmo((prev) => ({ ...prev, weaponId: e.weaponId }));
    bus.on('AMMO_UPDATED', onUpdate);
    bus.on('WEAPON_SWITCHED', onSwitch);
    return () => {
      bus.off('AMMO_UPDATED', onUpdate);
      bus.off('WEAPON_SWITCHED', onSwitch);
    };
  }, []);

  return (
    <div className="flex flex-col items-end gap-1 text-right">
      <span className="text-xs tracking-widest text-white/70 uppercase">
        {ammo.weaponId}
      </span>
      <span className="text-lg text-growth">
        {ammo.clip} / {ammo.clipMax}
      </span>
      <span className="text-xs text-white/50">reserve {ammo.reserve}</span>
      {ammo.reloading && (
        <span className="text-xs tracking-widest text-grace uppercase">
          Reloading
        </span>
      )}
    </div>
  );
}
