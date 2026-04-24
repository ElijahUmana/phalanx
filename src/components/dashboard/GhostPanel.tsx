'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function GhostPanel() {
  const events = useEventsBySource('ghost');
  return (
    <Panel
      title="ghost · fork terminal"
      subtitle="zero-copy dependency state"
      accent="sky"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>$ ghost fork phalanx-deps → waiting…</Empty>
      ) : (
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'ghost.fork.started') {
              return (
                <div key={i} className="text-sky-300">
                  <span className="text-zinc-500">$</span> ghost fork{' '}
                  <span className="text-emerald-300">
                    {String(d.parentDb ?? 'phalanx-deps')}
                  </span>{' '}
                  → <span className="text-amber-300">{String(d.forkId ?? '')}</span>
                </div>
              );
            }
            if (e.type === 'ghost.fork.complete') {
              return (
                <div key={i} className="text-zinc-500">
                  <span className="text-emerald-400">✓</span> fork{' '}
                  {String(d.forkId ?? '')} ready in{' '}
                  <span className="text-zinc-300">{Number(d.durationMs ?? 0)}ms</span>
                </div>
              );
            }
            if (e.type === 'ghost.memory.match') {
              return (
                <div key={i} className="text-violet-300">
                  memory: {String(d.pattern ?? '')} · score{' '}
                  {Number(d.score ?? 0).toFixed(2)}
                </div>
              );
            }
            return (
              <div key={i} className="text-zinc-500">
                {e.type}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
