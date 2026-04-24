'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function NexlaPanel() {
  const events = useEventsBySource('nexla');
  return (
    <Panel
      title="nexla · bidirectional pipelines"
      subtitle="CVE feeds · dynamic sources · writeback"
      accent="cyan"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>No pipelines yet.</Empty>
      ) : (
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'nexla.feed.ingest') {
              return (
                <div key={i} className="text-cyan-300">
                  ingest <span className="text-emerald-300">{String(d.source ?? '')}</span>
                  {' · '}
                  <span className="text-zinc-300">{Number(d.count ?? 0)}</span>{' '}
                  <span className="text-zinc-500">records</span>
                </div>
              );
            }
            if (e.type === 'nexla.pipeline.built') {
              return (
                <div key={i} className="text-violet-300">
                  pipeline built: {String(d.sourceUrl ?? '')} →{' '}
                  {String(d.targetSystem ?? '')}
                </div>
              );
            }
            if (e.type === 'nexla.writeback') {
              return (
                <div key={i} className="text-amber-300">
                  writeback → <span className="text-emerald-300">{String(d.targetSystem ?? '')}</span>
                  {' · '}
                  <span className="text-zinc-400">{String(d.artifact ?? '')}</span>
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
