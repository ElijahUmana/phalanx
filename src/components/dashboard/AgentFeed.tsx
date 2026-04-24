'use client';

import { useEffect, useRef } from 'react';
import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

function formatAction(
  data: Record<string, unknown>,
): { agent: string; action: string; detail?: string } {
  const agentName =
    (typeof data.agentName === 'string' && data.agentName) ||
    (typeof data.agentId === 'string' && data.agentId) ||
    'guild';
  const action = typeof data.action === 'string' ? data.action : 'action';
  const detail =
    typeof data.decisionReason === 'string'
      ? data.decisionReason
      : typeof data.gateId === 'string'
        ? `gate: ${data.gateId}`
        : undefined;
  return { agent: agentName, action, detail };
}

function timestampDelta(startedAt: number | null, t: number): string {
  if (!startedAt) return '+0.0s';
  const dt = (t - startedAt) / 1000;
  return `+${dt.toFixed(1)}s`;
}

export function AgentFeed() {
  const guildEvents = useEventsBySource('guild');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const startedAt = guildEvents[0]?.timestamp ?? null;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [guildEvents.length]);

  return (
    <Panel
      title="Guild audit log"
      subtitle={`${guildEvents.length} events`}
      accent="violet"
      active={guildEvents.length > 0}
    >
      {guildEvents.length === 0 ? (
        <Empty>Audit log quiet — waiting for agent activity.</Empty>
      ) : (
        <div ref={scrollRef} className="flex flex-col gap-1.5">
          {guildEvents.map((e, i) => {
            const { agent, action, detail } = formatAction(e.data);
            const isApproval = e.type === 'guild.approval.granted';
            return (
              <div
                key={`${e.timestamp}-${i}`}
                className={`rounded border px-2 py-1.5 font-mono text-[11px] leading-tight ${
                  isApproval
                    ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-200'
                    : 'border-zinc-800/80 bg-zinc-950/40 text-zinc-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500">
                    {timestampDelta(startedAt, e.timestamp)}
                  </span>
                  <span className="text-violet-300">{agent}</span>
                </div>
                <div>
                  <span className="text-zinc-500">→</span> {action}
                </div>
                {detail && (
                  <div className="mt-0.5 text-zinc-500">{detail}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
