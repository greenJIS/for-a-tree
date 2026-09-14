/** Secret PIN-gated debug overlay. Backtick to open, z-30 modal layer. */
import { useEffect, useState } from 'react';
import type { DifficultyMode } from '../game/config';
import { bus } from '../game/eventBus';
import { pinAuth } from '../game/debug/pinAuth';
import { SCALE_TIERS, type ScaleTier } from '../game/debug/scale';
import type { MutantKind } from '../game/systems/SpawnDirector';

type Screen = 'set-1' | 'set-2' | 'enter' | 'menu';

const KEYPAD_ROWS: string[][] = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
];

const DIFFICULTY_LABELS: Record<DifficultyMode, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Advanced',
};

const SPAWN_KINDS: { kind: MutantKind; label: string }[] = [
  { kind: 'swarmer', label: '+ Swarmer' },
  { kind: 'detonator', label: '+ Detonator' },
  { kind: 'brute', label: '+ Brute' },
];

export function DebugMenu() {
  const [open, setOpen] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [digits, setDigits] = useState('');
  const [firstPin, setFirstPin] = useState('');
  const [error, setError] = useState(false);
  const [godMode, setGodMode] = useState(false);
  const [difficulty, setDifficulty] = useState<DifficultyMode>('hard');
  const [scaleTier, setScaleTier] = useState<ScaleTier>(2);
  const [timescale, setTimescaleState] = useState(1);

  useEffect(() => {
    const onToggle = ({ open: nowOpen }: { open: boolean }) => {
      setOpen(nowOpen);
      setDigits('');
      setFirstPin('');
      setError(false);
    };
    bus.on('DEBUG_MENU_TOGGLED', onToggle);
    return () => bus.off('DEBUG_MENU_TOGGLED', onToggle);
  }, []);

  // ArenaScene.create() resets god mode, scale, and timescale back to
  // shipped defaults on every restart, not just the first run -- but
  // deliberately does NOT reset difficulty (Task 7 writes the override into
  // the registry precisely so it survives a restart). Re-sync the menu's
  // displayed values for the three that do reset -- otherwise e.g. God Mode
  // could read "on" here while the sim (freshly restarted) has already
  // reset it to off. PIN authentication is intentionally NOT reset here;
  // only a full page reload should ask for the PIN again. Tasks 6, 8, and 9
  // each add one reset line inside onRestart below, alongside the useState
  // they introduce; Task 7 (difficulty) deliberately adds none.
  useEffect(() => {
    const onRestart = () => {
      setGodMode(false);
      setScaleTier(2);
      setTimescaleState(1);
    };
    bus.on('RESTART_SIMULATION', onRestart);
    return () => bus.off('RESTART_SIMULATION', onRestart);
  }, []);

  if (!open) return null;

  const screen: Screen = authenticated
    ? 'menu'
    : pinAuth.hasPin()
      ? 'enter'
      : firstPin
        ? 'set-2'
        : 'set-1';

  const press = (digit: string) => {
    if (digits.length >= 4) return;
    setError(false);
    const next = digits + digit;
    setDigits(next);
    if (next.length !== 4) return;

    if (screen === 'set-1') {
      setFirstPin(next);
      setDigits('');
      return;
    }

    if (screen === 'set-2') {
      if (next === firstPin) {
        void pinAuth
          .setPin(next)
          .then(() => setAuthenticated(true))
          .catch(() => {
            setError(true);
            setDigits('');
            setFirstPin('');
          });
      } else {
        setError(true);
        setFirstPin('');
        setDigits('');
      }
      return;
    }

    // screen === 'enter'
    void pinAuth
      .verifyPin(next)
      .then((ok) => {
        if (ok) {
          setAuthenticated(true);
        } else {
          setError(true);
          setDigits('');
        }
      })
      .catch(() => {
        setError(true);
        setDigits('');
        setFirstPin('');
      });
  };

  const backspace = () => setDigits((prev) => prev.slice(0, -1));

  const title =
    screen === 'set-1'
      ? 'Set Admin PIN'
      : screen === 'set-2'
        ? 'Confirm PIN'
        : 'Enter PIN';

  return (
    <div className="pointer-events-auto absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-xs">
      {screen === 'menu' ? (
        <div className="flex max-h-[92%] w-[420px] flex-col gap-3 overflow-y-auto border border-tether bg-sand-900 p-4 shadow-2xl">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold tracking-wide text-white">
              DEBUG MENU <span className="font-normal text-white/30">— paused</span>
            </h2>
            <span className="text-xs text-white/30">` close</span>
          </div>
          <div className="flex items-center justify-between border border-sand-800 bg-sand-950 p-3">
            <div>
              <p className="text-[10px] tracking-wider text-grace uppercase">
                God Mode
              </p>
              <p className="mt-0.5 text-[11px] text-white/40">
                No damage + infinite ammo
              </p>
            </div>
            <input
              type="checkbox"
              checked={godMode}
              onChange={(e) => {
                setGodMode(e.target.checked);
                bus.emit('DEBUG_SET_GOD_MODE', { enabled: e.target.checked });
              }}
              className="h-5 w-5 accent-grace"
            />
          </div>
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Difficulty Override
            </p>
            <div className="mt-2 flex gap-2">
              {(Object.keys(DIFFICULTY_LABELS) as DifficultyMode[]).map(
                (mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setDifficulty(mode);
                      bus.emit('DEBUG_SET_DIFFICULTY', { mode });
                    }}
                    className={`cursor-pointer rounded px-3 py-1.5 text-xs ${
                      difficulty === mode
                        ? 'border border-tether bg-sand-800 text-tether'
                        : 'border border-sand-800 bg-sand-950 text-white/60'
                    }`}
                  >
                    {DIFFICULTY_LABELS[mode]}
                  </button>
                ),
              )}
            </div>
          </div>
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Display Scale
            </p>
            <div className="mt-2 flex gap-2">
              {SCALE_TIERS.map((tier) => (
                <button
                  key={tier}
                  type="button"
                  onClick={() => {
                    setScaleTier(tier);
                    bus.emit('DEBUG_SET_SCALE', { tier });
                  }}
                  className={`cursor-pointer rounded px-3 py-1.5 text-xs ${
                    scaleTier === tier
                      ? 'border border-tether bg-sand-800 text-tether'
                      : 'border border-sand-800 bg-sand-950 text-white/60'
                  }`}
                >
                  {tier}x
                </button>
              ))}
            </div>
          </div>
          <div className="border border-sand-800 bg-sand-950 p-3">
            <div className="flex justify-between">
              <p className="text-[10px] tracking-wider text-tether uppercase">
                Timescale
              </p>
              <p className="text-xs text-white/60">{timescale.toFixed(1)}x</p>
            </div>
            <input
              type="range"
              min={0.5}
              max={3}
              step={0.1}
              value={timescale}
              onChange={(e) => {
                const factor = Number(e.target.value);
                setTimescaleState(factor);
                bus.emit('DEBUG_SET_TIMESCALE', { factor });
              }}
              className="mt-2 w-full accent-tether"
            />
          </div>
          <div className="border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-tether uppercase">
              Force Spawn
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {SPAWN_KINDS.map(({ kind, label }) => (
                <button
                  key={kind}
                  type="button"
                  onClick={() => bus.emit('DEBUG_SPAWN_ENEMY', { kind })}
                  className="cursor-pointer rounded border border-sand-800 bg-sand-950 px-3 py-1.5 text-xs text-white/60 hover:border-tether"
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => bus.emit('DEBUG_KILL_ALL')}
                className="cursor-pointer rounded bg-decay px-3 py-1.5 text-xs font-semibold text-sand-950"
              >
                Kill All
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between border border-sand-800 bg-sand-950 p-3">
            <p className="text-[10px] tracking-wider text-growth uppercase">
              Tree Maturity
            </p>
            <button
              type="button"
              onClick={() => bus.emit('DEBUG_SET_MATURITY', { pct: 100 })}
              className="cursor-pointer rounded bg-growth px-3 py-1.5 text-xs font-semibold text-sand-950"
            >
              Force 100%
            </button>
          </div>
        </div>
      ) : (
        <div className="w-[280px] border border-tether bg-sand-900 p-5">
          <p className="text-[10px] tracking-widest text-tether uppercase">
            Admin Access
          </p>
          <h2 className="mt-1 text-lg font-bold text-white">{title}</h2>
          {screen === 'set-1' && (
            <p className="mt-1 text-xs text-white/40">
              No PIN set on this PC. Choose a 4-digit PIN.
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs text-decay">
              {screen === 'enter' ? 'Incorrect PIN.' : 'PINs did not match.'}{' '}
              Try again.
            </p>
          )}
          <div className="mt-4 flex justify-center gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-3.5 w-3.5 rounded-full border-2 ${
                  i < digits.length
                    ? 'border-tether bg-tether'
                    : 'border-tether'
                }`}
              />
            ))}
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            {KEYPAD_ROWS.flat().map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => press(digit)}
                className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/70 hover:border-tether"
              >
                {digit}
              </button>
            ))}
            <div />
            <button
              type="button"
              onClick={() => press('0')}
              className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/70 hover:border-tether"
            >
              0
            </button>
            <button
              type="button"
              onClick={backspace}
              className="cursor-pointer border border-sand-800 bg-sand-950 py-2 text-sm text-white/40 hover:border-tether"
            >
              ⌫
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-white/30">
            ` to close
          </p>
        </div>
      )}
    </div>
  );
}
