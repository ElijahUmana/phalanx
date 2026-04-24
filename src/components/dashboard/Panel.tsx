'use client';

import type { ReactNode } from 'react';

export interface PanelProps {
  title: string;
  subtitle?: string;
  accent?: 'emerald' | 'amber' | 'rose' | 'cyan' | 'violet' | 'sky' | 'zinc';
  active?: boolean;
  children: ReactNode;
  className?: string;
}

const ACCENT_CLASSES: Record<NonNullable<PanelProps['accent']>, string> = {
  emerald: 'text-emerald-400 border-emerald-500/30',
  amber: 'text-amber-400 border-amber-500/30',
  rose: 'text-rose-400 border-rose-500/30',
  cyan: 'text-cyan-400 border-cyan-500/30',
  violet: 'text-violet-400 border-violet-500/30',
  sky: 'text-sky-400 border-sky-500/30',
  zinc: 'text-zinc-400 border-zinc-700',
};

export function Panel({
  title,
  subtitle,
  accent = 'zinc',
  active = false,
  children,
  className = '',
}: PanelProps) {
  const dotColor =
    accent === 'zinc'
      ? 'bg-zinc-600'
      : accent === 'emerald'
        ? 'bg-emerald-400'
        : accent === 'amber'
          ? 'bg-amber-400'
          : accent === 'rose'
            ? 'bg-rose-400'
            : accent === 'cyan'
              ? 'bg-cyan-400'
              : accent === 'violet'
                ? 'bg-violet-400'
                : 'bg-sky-400';

  return (
    <section
      className={`relative flex h-full flex-col overflow-hidden rounded-md border bg-zinc-900/50 ${ACCENT_CLASSES[accent]} ${className}`}
    >
      <header className="flex items-center justify-between gap-2 border-b border-current/20 bg-zinc-950/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${dotColor} ${active ? 'pulse-dot' : ''}`}
            aria-hidden
          />
          <h3 className="font-mono text-xs uppercase tracking-wider">{title}</h3>
        </div>
        {subtitle && (
          <span className="font-mono text-[10px] text-zinc-500">{subtitle}</span>
        )}
      </header>
      <div className="panel-scroll flex-1 overflow-y-auto px-3 py-2 text-zinc-200">
        {children}
      </div>
    </section>
  );
}

export function Line({
  label,
  value,
  muted = false,
}: {
  label?: string;
  value: ReactNode;
  muted?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 font-mono text-xs ${muted ? 'text-zinc-500' : 'text-zinc-300'}`}
    >
      {label && <span className="shrink-0 text-zinc-500">{label}</span>}
      <span className="truncate">{value}</span>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">
      {children}
    </div>
  );
}
