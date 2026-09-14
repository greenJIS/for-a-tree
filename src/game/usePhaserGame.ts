/**
 * Mounts Phaser into a div once a difficulty mode is chosen, and destroys
 * it on unmount. Waits on `mode` rather than being called conditionally --
 * Rules of Hooks forbid calling a hook only after a mode is picked, so this
 * hook is always called and no-ops internally until `mode` is non-null.
 *
 * React StrictMode double-invokes effects in development, so the ref guard
 * is load-bearing — without it two Phaser.Game instances are created.
 */
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from './createGame';
import type { DifficultyMode } from './config';

export function usePhaserGame(
  mode: DifficultyMode | null,
): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mode === null || gameRef.current) return;

    gameRef.current = createGame(container, mode);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, [mode]);

  return containerRef;
}
