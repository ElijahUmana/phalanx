'use client';

import { Panel, Empty } from './Panel';
import { useEventsBySource } from './ScanProvider';

export function ChainguardPanel() {
  const events = useEventsBySource('chainguard');
  return (
    <Panel
      title="chainguard · zero-cve baseline"
      subtitle="DFC · SBOM · Sigstore"
      accent="emerald"
      active={events.length > 0}
    >
      {events.length === 0 ? (
        <Empty>No remediation baseline yet.</Empty>
      ) : (
        <div className="flex flex-col gap-1.5 font-mono text-[11px]">
          {events.map((e, i) => {
            const d = e.data as Record<string, unknown>;
            if (e.type === 'chainguard.dfc.convert') {
              const diff = d.diff as Record<string, unknown> | undefined;
              return (
                <div key={i} className="text-emerald-300">
                  dfc: <span className="text-rose-400">{String(d.beforeImage ?? '')}</span>
                  {' → '}
                  <span className="text-emerald-400">
                    {String(d.afterImage ?? '')}
                  </span>
                  {diff && (
                    <div className="pl-4 text-[10px] text-zinc-500">
                      CVE {String(diff.cveCountBefore ?? '?')} →{' '}
                      <span className="text-emerald-300">
                        {String(diff.cveCountAfter ?? '?')}
                      </span>
                      {' · '}
                      size {String(diff.baseImageSizeBefore ?? '?')} →{' '}
                      {String(diff.baseImageSizeAfter ?? '?')}
                    </div>
                  )}
                </div>
              );
            }
            if (e.type === 'chainguard.sbom') {
              return (
                <div key={i} className="text-emerald-300">
                  sbom + sigstore signed
                  <div className="pl-4 text-[10px] text-zinc-500">
                    hash: {String(d.imageHash ?? '')}
                  </div>
                  {d.slsaLevel !== undefined && (
                    <div className="pl-4 text-[10px] text-emerald-400">
                      SLSA L{Number(d.slsaLevel)} attested
                    </div>
                  )}
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
