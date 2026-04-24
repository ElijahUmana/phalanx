'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function X402Panel() {
  const events = useEventsBySource('x402');
  return (
    <Panel
      title="x402 · agent micropayment"
      subtitle="base sepolia · cdp wallet"
      accent="amber"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>No payments yet.</Empty>
      ) : (
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'x402.payment') {
              const explorerUrl =
                typeof d.explorerUrl === 'string' ? d.explorerUrl : '#';
              return (
                <div key={i} className="text-amber-200">
                  <div className="text-amber-300">
                    $<span className="text-emerald-300">
                      {Number(d.amountUsd ?? 0).toFixed(3)}
                    </span>{' '}
                    → {String(d.recipient ?? '')}
                  </div>
                  <div className="pl-4 text-[10px]">
                    <a
                      href={explorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sky-300 hover:underline"
                    >
                      {String(d.txHash ?? '')}
                    </a>
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
