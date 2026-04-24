'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function InsForgePanel() {
  const events = useEventsBySource('insforge');
  return (
    <Panel
      title="insforge · staging backends"
      subtitle="per-hypothesis live validation"
      accent="cyan"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>No staging backends provisioned yet.</Empty>
      ) : (
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'insforge.provision') {
              return (
                <div key={i} className="text-cyan-300">
                  <span className="text-zinc-500">mcp</span>{' '}
                  <span className="text-emerald-400">provision</span>{' '}
                  <span className="text-zinc-400">{String(d.backendId ?? '')}</span>
                  <div className="pl-4 text-[10px] text-zinc-500">
                    {String(d.url ?? '')}
                  </div>
                </div>
              );
            }
            if (e.type === 'insforge.validate') {
              const score = Number(d.score ?? 0);
              return (
                <div
                  key={i}
                  className={
                    score >= 0.95 ? 'text-emerald-300' : 'text-amber-300'
                  }
                >
                  validate {String(d.backendId ?? '')} ·{' '}
                  {Number(d.testsPassed ?? 0)}/{Number(d.testsTotal ?? 0)} tests ·
                  score {score.toFixed(2)}
                </div>
              );
            }
            if (e.type === 'insforge.cleanup') {
              return (
                <div key={i} className="text-rose-400">
                  <span className="text-zinc-500">$</span> cleanup{' '}
                  {String(d.backendId ?? '')} ✗
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
