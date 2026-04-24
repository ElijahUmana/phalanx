'use client';

import { useState } from 'react';
import { useScan } from './ScanProvider';

const DEFAULT_REPO = 'https://github.com/ElijahUmana/phalanx';

export function ScanInput() {
  const { state, startScan, reset } = useScan();
  const [repoUrl, setRepoUrl] = useState(DEFAULT_REPO);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isRunning = state.status === 'scanning' || state.status === 'connecting';
  const isFinished = state.status === 'complete' || state.status === 'failed';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isRunning || submitting) return;
    setFormError(null);
    setSubmitting(true);
    try {
      if (state.status !== 'idle') reset();
      await startScan(repoUrl.trim());
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Scan failed to start');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-zinc-900/60 px-3 py-2 focus-within:border-emerald-500">
        <span className="select-none font-mono text-xs uppercase tracking-wide text-zinc-500">
          phalanx $
        </span>
        <input
          type="url"
          value={repoUrl}
          onChange={(e) => setRepoUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          required
          disabled={isRunning || submitting}
          className="flex-1 bg-transparent font-mono text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
          aria-label="GitHub repository URL"
        />
        <button
          type="submit"
          disabled={isRunning || submitting}
          className="rounded bg-emerald-500 px-4 py-1.5 text-sm font-medium text-emerald-950 shadow-sm transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
        >
          {isRunning ? 'Scanning…' : isFinished ? 'Scan again' : 'Scan repository'}
        </button>
      </div>
      {formError && (
        <p className="font-mono text-xs text-rose-400">error: {formError}</p>
      )}
      {state.scanId && (
        <p className="font-mono text-xs text-zinc-500">
          scan id: <span className="text-zinc-400">{state.scanId}</span>
        </p>
      )}
    </form>
  );
}
