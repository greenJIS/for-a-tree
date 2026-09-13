/** Static reference row for controls that never have cooldown/charge state
 * (unlike Aegis/Dash/Reload, which get their own live-state HudPanel).
 * Bottom-left, below the live-state panels. */
import { HudPanel } from './HudPanel';

export function ControlsReference() {
  return (
    <HudPanel className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] tracking-widest text-white/50 uppercase">
      <span>[1-3] Weapon</span>
      <span>[WASD] Move</span>
      <span>[Mouse] Fire</span>
      <span>[Esc/P] Pause</span>
    </HudPanel>
  );
}
