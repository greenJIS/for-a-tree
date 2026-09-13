/**
 * Application shell.
 *
 * React owns the page chrome, HUD and modal layers; Phaser owns the
 * simulation and mounts into #phaser-root. The two communicate only through
 * the typed event bus. SRS 2.1.
 */
import { usePhaserGame } from './game/usePhaserGame';

function App() {
  const containerRef = usePhaserGame();

  return (
    <main className="flex h-full w-full items-center justify-center bg-sand-950">
      <div
        className="relative aspect-video w-full max-w-[1280px] overflow-hidden
          border border-sand-800 bg-sand-900 shadow-2xl shadow-black/60"
      >
        <div id="phaser-root" ref={containerRef} className="absolute inset-0" />
      </div>
    </main>
  );
}

export default App;
