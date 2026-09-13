/** Pause modal overlay on ESC, P, or window blur. SRS 2.1, z-30. */
import { useEffect, useState } from 'react';
import { bus } from '../game/eventBus';

export function PauseModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    const onToggle = () => setIsOpen((prev) => !prev);
    const onRestart = () => setIsOpen(false);
    bus.on('TOGGLE_PAUSE', onToggle);
    bus.on('RESTART_SIMULATION', onRestart);
    return () => {
      bus.off('TOGGLE_PAUSE', onToggle);
      bus.off('RESTART_SIMULATION', onRestart);
    };
  }, []);

  if (!isOpen) return null;

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-xs">
      <div className="flex flex-col items-center gap-6 border border-sand-800 bg-sand-900 px-12 py-10 shadow-2xl">
        <h2 className="text-2xl font-bold tracking-[0.3em] text-growth uppercase">
          PAUSED
        </h2>
        <div className="flex w-44 flex-col gap-3">
          <button
            type="button"
            onClick={() => bus.emit('TOGGLE_PAUSE')}
            className="cursor-pointer border border-growth bg-growth/10 px-6 py-2.5 text-center text-xs font-semibold tracking-widest text-growth uppercase transition-colors hover:bg-growth hover:text-sand-950"
          >
            Resume
          </button>
          <button
            type="button"
            onClick={() => bus.emit('RESTART_SIMULATION')}
            className="cursor-pointer border border-sand-700 bg-sand-950/60 px-6 py-2.5 text-center text-xs font-semibold tracking-widest text-white/70 uppercase transition-colors hover:border-decay hover:bg-decay/10 hover:text-decay"
          >
            Restart
          </button>
        </div>
      </div>
    </div>
  );
}
