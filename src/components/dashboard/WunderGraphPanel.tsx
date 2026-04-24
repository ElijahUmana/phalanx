'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function WunderGraphPanel() {
  const events = useEventsBySource('wundergraph');
  return (
    <Panel
      title="wundergraph cosmo"
      subtitle="federated supergraph · OAuth scopes"
      accent="violet"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>Supergraph idle.</Empty>
      ) : (
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'wundergraph.query') {
              return (
                <div key={i} className="text-violet-300">
                  <span className="text-emerald-400">allow</span>{' '}
                  {String(d.operation ?? '')}{' '}
                  <span className="text-zinc-500">
                    [@requiresScopes({String(d.scope ?? '')})]
                  </span>
                  <div className="pl-4 text-[10px] text-zinc-500">
                    agent: {String(d.agentId ?? '')}
                  </div>
                </div>
              );
            }
            if (e.type === 'wundergraph.scope.denied') {
              return (
                <div key={i} className="text-rose-300">
                  <span className="text-rose-500">deny</span>{' '}
                  {String(d.operation ?? '')}{' '}
                  <span className="text-zinc-500">
                    (needs {String(d.requiredScope ?? '')})
                  </span>
                  <div className="pl-4 text-[10px] text-zinc-500">
                    agent: {String(d.agentId ?? '')} — blast radius contained
                  </div>
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
