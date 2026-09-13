/**
 * Mounts Phaser into a div on mount and destroys it on unmount.
 *
 * React StrictMode double-invokes effects in development, so the ref guard
 * is load-bearing — without it two Phaser.Game instances are created.
 */
import { useEffect, useRef } from 'react';
import type Phaser from 'phaser';
import { createGame } from './createGame';

export function usePhaserGame(): React.RefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Phaser.Game | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    gameRef.current = createGame(container);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  }, []);

  return containerRef;
}
