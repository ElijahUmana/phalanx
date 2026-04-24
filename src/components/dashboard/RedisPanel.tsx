'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function RedisPanel() {
  const events = useEventsBySource('redis');
  return (
    <Panel
      title="redis · coordination"
      subtitle="streams · pubsub · vectors · langcache"
      accent="rose"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>Redis idle.</Empty>
      ) : (
        <div className="flex flex-col gap-1 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'redis.vector.match') {
              const score = Number(d.cosineScore ?? 0);
              return (
                <div key={i} className="text-violet-300">
                  VSIM: <span className="text-zinc-300">{String(d.cveId ?? '')}</span>
                  {' ~ '}
                  <span className="text-zinc-300">
                    {String(d.similarCveId ?? '')}
                  </span>
                  {' · cosine '}
                  <span className="text-emerald-300">{score.toFixed(2)}</span>
                </div>
              );
            }
            if (e.type === 'redis.stream.dispatch') {
              return (
                <div key={i} className="text-amber-300">
                  XADD {String(d.streamName ?? 'cve-investigations')} →{' '}
                  <span className="text-zinc-300">
                    {String(d.analystAgentId ?? '')}
                  </span>
                </div>
              );
            }
            if (e.type === 'redis.langcache.hit') {
              const rate = Number(d.hitRate ?? 0);
              return (
                <div key={i} className="text-cyan-300">
                  LangCache HIT · rate{' '}
                  <span className="text-emerald-300">
                    {(rate * 100).toFixed(0)}%
                  </span>
                </div>
              );
            }
            if (e.type === 'redis.pubsub.cancel') {
              return (
                <div key={i} className="text-rose-300">
                  <span className="text-zinc-500">PUBLISH</span> cancel:
                  {String(d.cveId ?? '')} ⚡
                  <div className="pl-4 text-[10px] text-zinc-500">
                    {String(d.reason ?? '')}
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
