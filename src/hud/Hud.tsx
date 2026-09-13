/** HUD root. Layered over the canvas at z-20, never intercepts input. */
import { AmmoReadout } from './AmmoReadout';
import { CarriedCatalystPips } from './CarriedCatalystPips';
import { DecayVignette } from './DecayVignette';
import { GameOverCard } from './GameOverCard';
import { HealthBar } from './HealthBar';
import { MaturityGauge } from './MaturityGauge';
import { TetherBeacon } from './TetherBeacon';

export function Hud() {
  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      <DecayVignette />

      <div className="absolute top-4 left-4">
        <HealthBar />
      </div>

      <div className="absolute top-4 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <MaturityGauge />
        <TetherBeacon />
        <CarriedCatalystPips />
      </div>

      <div className="absolute right-4 bottom-4">
        <AmmoReadout />
      </div>

      <GameOverCard />
    </div>
  );
}
