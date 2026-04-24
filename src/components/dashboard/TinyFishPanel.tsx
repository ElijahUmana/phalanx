'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function TinyFishPanel() {
  const events = useEventsBySource('tinyfish');
  return (
    <Panel
      title="tinyfish · web action"
      subtitle="browser + search + PR creation"
      accent="amber"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>Web agent idle.</Empty>
      ) : (
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'tinyfish.search') {
              return (
                <div key={i} className="text-amber-300">
                  search: <span className="text-zinc-300">{String(d.query ?? '')}</span>
                  <span className="ml-1 text-zinc-500">
                    · {Number(d.resultsCount ?? 0)} hits
                  </span>
                </div>
              );
            }
            if (e.type === 'tinyfish.fetch') {
              return (
                <div key={i} className="text-amber-200">
                  <div>
                    fetch:{' '}
                    <a
                      href={String(d.url ?? '#')}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:underline"
                    >
                      {String(d.url ?? '')}
                    </a>
                  </div>
                  {typeof d.excerpt === 'string' && (
                    <div className="pl-4 text-zinc-500">“{d.excerpt}”</div>
                  )}
                </div>
              );
            }
            if (e.type === 'tinyfish.navigate') {
              return (
                <div key={i} className="text-amber-300">
                  navigate:{' '}
                  <span className="text-zinc-300">{String(d.action ?? '')}</span>
                  <div className="pl-4 text-[10px] text-zinc-500">
                    → {String(d.url ?? '')}
                  </div>
                </div>
              );
            }
            if (e.type === 'tinyfish.pr.created') {
              return (
                <div key={i} className="text-emerald-300">
                  pr created:{' '}
                  <a
                    href={String(d.prUrl ?? '#')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-300 hover:underline"
                  >
                    {String(d.prUrl ?? '')}
                  </a>
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
