'use client';

import { useScan } from './ScanProvider';

export function CancelEvent() {
  const { state } = useScan();
  if (!state.cancelFlash) return null;
  // Hide once the scan wraps up; during the scan the toast stays visible
  // with a one-shot flash animation (see globals.css .cancel-flash).
  if (state.status === 'complete' || state.status === 'failed') return null;

  return (
    <div
      key={state.cancelFlash.at}
      className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 cancel-flash"
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-md border border-rose-500/50 bg-rose-950/90 px-4 py-3 shadow-lg shadow-rose-500/20 backdrop-blur">
        <span className="inline-block h-2 w-2 rounded-full bg-rose-400 pulse-dot" />
        <div>
          <div className="font-mono text-xs uppercase tracking-wider text-rose-300">
            redis pub/sub · cancel
          </div>
          <div className="mt-0.5 text-sm text-rose-100">
            {state.cancelFlash.reason}
          </div>
        </div>
      </div>
    </div>
  );
}
