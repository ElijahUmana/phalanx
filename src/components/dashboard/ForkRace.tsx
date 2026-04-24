'use client';

import { Panel, Empty } from './Panel';
import { useScan, type Fork, type ForkStatus } from './ScanProvider';

const STATUS_LABEL: Record<ForkStatus, string> = {
  forking: 'forking db',
  provisioning: 'provisioning backend',
  validating: 'running tests',
  cancelled: 'cancelled',
  complete: 'complete',
};

const STATUS_PROGRESS: Record<ForkStatus, number> = {
  forking: 0.25,
  provisioning: 0.5,
  validating: 0.75,
  cancelled: 1,
  complete: 1,
};

function StatusBadge({ status }: { status: ForkStatus }) {
  if (status === 'cancelled') {
    return (
      <span className="rounded border border-rose-500/40 bg-rose-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-rose-300">
        cancelled
      </span>
    );
  }
  if (status === 'complete') {
    return (
      <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-emerald-300">
        winner candidate
      </span>
    );
  }
  return (
    <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[10px] uppercase text-amber-300">
      {STATUS_LABEL[status]}
    </span>
  );
}

function Lane({ fork, isWinner }: { fork: Fork; isWinner: boolean }) {
  const progress = STATUS_PROGRESS[fork.status];
  const trackColor =
    fork.status === 'cancelled'
      ? 'bg-rose-500/40'
      : isWinner
        ? 'bg-emerald-400'
        : fork.status === 'complete'
          ? 'bg-emerald-500/60'
          : 'bg-amber-400/70';

  return (
    <div
      className={`rounded-md border px-3 py-2.5 transition-colors ${
        fork.status === 'cancelled'
          ? 'border-rose-500/30 bg-rose-500/5'
          : isWinner
            ? 'border-emerald-500/50 bg-emerald-500/10'
            : 'border-zinc-800 bg-zinc-950/40'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-sm font-medium text-zinc-100">
              {fork.hypothesis.name}
            </span>
            <span className="truncate font-mono text-xs text-zinc-500">
              {fork.hypothesis.strategy}
            </span>
          </div>
          <div className="mt-0.5 font-mono text-[10px] text-zinc-600">
            {fork.forkId}
          </div>
        </div>
        <StatusBadge status={fork.status} />
      </div>

      <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full transition-all duration-500 ${trackColor} ${
            fork.status !== 'cancelled' && fork.status !== 'complete'
              ? 'shimmer'
              : ''
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {(fork.testsPassed !== undefined || fork.backendUrl) && (
        <div className="mt-2 flex gap-3 font-mono text-[10px] text-zinc-500">
          {fork.testsPassed !== undefined && fork.testsTotal !== undefined && (
            <span>
              tests:{' '}
              <span
                className={
                  fork.testsPassed === fork.testsTotal
                    ? 'text-emerald-400'
                    : 'text-amber-400'
                }
              >
                {fork.testsPassed}/{fork.testsTotal}
              </span>
            </span>
          )}
          {fork.score !== undefined && (
            <span>
              score: <span className="text-zinc-300">{fork.score.toFixed(2)}</span>
            </span>
          )}
          {fork.backendUrl && (
            <span className="truncate">staging: {fork.backendUrl}</span>
          )}
        </div>
      )}
    </div>
  );
}

export function ForkRace() {
  const { state } = useScan();
  const anyActive = state.forks.some(
    (f) => f.status === 'forking' || f.status === 'provisioning' || f.status === 'validating',
  );

  return (
    <Panel
      title="Fork race"
      subtitle={`${state.forks.length} parallel hypotheses`}
      accent="emerald"
      active={anyActive}
    >
      {state.forks.length === 0 ? (
        <Empty>Awaiting remediation hypotheses…</Empty>
      ) : (
        <div className="flex flex-col gap-2">
          {state.forks.map((f) => (
            <Lane
              key={f.forkId}
              fork={f}
              isWinner={state.evidence.winningForkId === f.forkId}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}
