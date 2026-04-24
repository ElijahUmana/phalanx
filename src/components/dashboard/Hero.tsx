'use client';

import { useScan } from './ScanProvider';

export function Hero() {
  const { state } = useScan();
  const cve = state.cves[0];

  const statusLabel =
    state.status === 'idle'
      ? 'idle'
      : state.status === 'connecting'
        ? 'connecting'
        : state.status === 'scanning'
          ? 'scanning'
          : state.status === 'complete'
            ? 'remediation published'
            : 'failed';

  const statusColor =
    state.status === 'complete'
      ? 'text-emerald-400'
      : state.status === 'failed'
        ? 'text-rose-400'
        : state.status === 'scanning'
          ? 'text-amber-400'
          : 'text-zinc-500';

  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-zinc-800 pb-4">
      <div className="min-w-0">
        <h1 className="flex items-baseline gap-3 text-2xl font-semibold tracking-tight text-zinc-100">
          Phalanx
          <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-500">
            parallel-fork CVE response fabric
          </span>
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-zinc-400">
          Autonomous agent fleet. Forks your dependency state N ways, validates
          each hypothesis in an isolated live backend, cancels false positives
          mid-flight, and ships the winner with a cryptographic evidence chain.
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 font-mono text-[11px]">
        <div>
          <span className="text-zinc-500">status: </span>
          <span className={statusColor}>{statusLabel}</span>
        </div>
        {state.deps && (
          <div className="text-zinc-500">
            deps parsed: <span className="text-zinc-300">{state.deps.totalPackages}</span>
          </div>
        )}
        {cve && (
          <div className="text-zinc-500">
            cve:{' '}
            <span className="text-rose-300">{cve.cveId}</span>
            <span className="text-zinc-600"> · </span>
            <span className="text-amber-300">{cve.severity}</span>
          </div>
        )}
        {state.forks.length > 0 && (
          <div className="text-zinc-500">
            forks:{' '}
            <span className="text-emerald-300">
              {state.forks.filter((f) => f.status === 'complete').length}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-300">{state.forks.length}</span>
            <span className="text-zinc-600"> · cancelled </span>
            <span className="text-rose-300">
              {state.forks.filter((f) => f.status === 'cancelled').length}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
