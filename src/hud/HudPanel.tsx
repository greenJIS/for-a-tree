/**
 * Shared "organic glass" HUD chrome: translucent dark panel, backdrop blur,
 * rounded corners, soft green glow border -- echoes the aura ring's woven-
 * vine look. `tone` swaps the border/glow/background color for components
 * with live state (ready/active/idle) without duplicating the frame classes
 * in every component.
 */
import type { ReactNode } from 'react';

export type HudPanelTone = 'neutral' | 'growth' | 'tether' | 'grace' | 'idle';

const TONE_STYLE: Record<HudPanelTone, string> = {
  neutral: 'border-growth/40 shadow-[0_0_10px_rgba(61,220,132,0.15)]',
  growth: 'border-growth/70 shadow-[0_0_14px_rgba(61,220,132,0.3)]',
  tether: 'border-tether/60 bg-tether/10 shadow-[0_0_14px_rgba(34,211,238,0.3)]',
  grace: 'border-grace/60 bg-grace/10 shadow-[0_0_14px_rgba(251,191,36,0.3)]',
  idle: 'border-sand-800 bg-sand-950/60 shadow-none',
};

export function HudPanel({
  tone = 'neutral',
  className = '',
  children,
}: {
  tone?: HudPanelTone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={`rounded-2xl border bg-sand-900/45 px-3 py-1.5 backdrop-blur-sm transition-colors ${TONE_STYLE[tone]} ${className}`}
    >
      {children}
    </div>
  );
}
