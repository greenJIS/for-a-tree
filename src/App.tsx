/**
 * Application shell.
 *
 * React owns the page chrome and (later) the HUD and modal layers; Phaser owns
 * the simulation and mounts into `#phaser-root`. The two communicate only
 * through the typed event bus described in docs/For_a_Tree_SRS.md section 2.2.
 */
function App() {
  return (
    <main className="flex h-full w-full items-center justify-center bg-sand-950">
      <div
        className="relative aspect-video w-full max-w-[1280px] overflow-hidden
          border border-sand-800 bg-sand-900 shadow-2xl shadow-black/60"
      >
        <div id="phaser-root" className="absolute inset-0" />

        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-3">
          <h1 className="text-4xl font-semibold tracking-[0.3em] text-growth uppercase">
            For a Tree
          </h1>
          <p className="text-sm tracking-widest text-white/40 uppercase">
            Engine not mounted
          </p>
        </div>
      </div>
    </main>
  );
}

export default App;
