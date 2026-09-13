/** HUD root. Layered over the canvas at z-20, never intercepts input. */
import { DecayVignette } from './DecayVignette';
import { MaturityGauge } from './MaturityGauge';
import { TetherBeacon } from './TetherBeacon';

export function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <DecayVignette />
      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <MaturityGauge />
        <TetherBeacon />
      </div>
    </div>
  );
}
