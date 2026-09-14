// src/game/eventBus.test.ts
import { describe, expect, it } from 'vitest';
import { bus } from './eventBus';

describe('eventBus: debug menu events', () => {
  it('delivers DEBUG_MENU_TOGGLED and DEBUG_SET_SCALE payloads', () => {
    let toggled: { open: boolean } | undefined;
    let scale: { tier: number } | undefined;
    const onToggle = (p: { open: boolean }) => {
      toggled = p;
    };
    const onScale = (p: { tier: 0.75 | 1 | 1.5 | 2 }) => {
      scale = p;
    };

    bus.on('DEBUG_MENU_TOGGLED', onToggle);
    bus.on('DEBUG_SET_SCALE', onScale);
    bus.emit('DEBUG_MENU_TOGGLED', { open: true });
    bus.emit('DEBUG_SET_SCALE', { tier: 1.5 });
    bus.off('DEBUG_MENU_TOGGLED', onToggle);
    bus.off('DEBUG_SET_SCALE', onScale);

    expect(toggled).toEqual({ open: true });
    expect(scale).toEqual({ tier: 1.5 });
  });

  it('delivers DEBUG_SET_GOD_MODE, DEBUG_KILL_ALL, and DEBUG_SET_MATURITY', () => {
    let god: boolean | undefined;
    let killAllFired = false;
    let maturityPct: number | undefined;
    const onGod = (p: { enabled: boolean }) => {
      god = p.enabled;
    };
    const onKillAll = () => {
      killAllFired = true;
    };
    const onMaturity = (p: { pct: number }) => {
      maturityPct = p.pct;
    };

    bus.on('DEBUG_SET_GOD_MODE', onGod);
    bus.on('DEBUG_KILL_ALL', onKillAll);
    bus.on('DEBUG_SET_MATURITY', onMaturity);
    bus.emit('DEBUG_SET_GOD_MODE', { enabled: true });
    bus.emit('DEBUG_KILL_ALL');
    bus.emit('DEBUG_SET_MATURITY', { pct: 100 });
    bus.off('DEBUG_SET_GOD_MODE', onGod);
    bus.off('DEBUG_KILL_ALL', onKillAll);
    bus.off('DEBUG_SET_MATURITY', onMaturity);

    expect(god).toBe(true);
    expect(killAllFired).toBe(true);
    expect(maturityPct).toBe(100);
  });

  it('delivers DEBUG_SET_DIFFICULTY, DEBUG_SET_TIMESCALE, and DEBUG_SPAWN_ENEMY', () => {
    let mode: string | undefined;
    let factor: number | undefined;
    let kind: string | undefined;
    const onDifficulty = (p: { mode: string }) => {
      mode = p.mode;
    };
    const onTimescale = (p: { factor: number }) => {
      factor = p.factor;
    };
    const onSpawn = (p: { kind: string }) => {
      kind = p.kind;
    };

    bus.on('DEBUG_SET_DIFFICULTY', onDifficulty);
    bus.on('DEBUG_SET_TIMESCALE', onTimescale);
    bus.on('DEBUG_SPAWN_ENEMY', onSpawn);
    bus.emit('DEBUG_SET_DIFFICULTY', { mode: 'easy' });
    bus.emit('DEBUG_SET_TIMESCALE', { factor: 2 });
    bus.emit('DEBUG_SPAWN_ENEMY', { kind: 'brute' });
    bus.off('DEBUG_SET_DIFFICULTY', onDifficulty);
    bus.off('DEBUG_SET_TIMESCALE', onTimescale);
    bus.off('DEBUG_SPAWN_ENEMY', onSpawn);

    expect(mode).toBe('easy');
    expect(factor).toBe(2);
    expect(kind).toBe('brute');
  });
});
