'use client';

import { Panel } from './Panel';
import { useScan } from './ScanProvider';

function Row({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const body = (
    <span className="break-all font-mono text-xs text-zinc-200">{value}</span>
  );
  return (
    <div className="flex flex-col gap-0.5 border-b border-zinc-800/60 py-2 last:border-b-0">
      <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-emerald-300"
        >
          {body}
        </a>
      ) : (
        body
      )}
    </div>
  );
}

export function EvidenceChain() {
  const { state } = useScan();
  const ev = state.evidence;
  const isShown = state.status === 'complete' && Object.keys(ev).length > 0;

  return (
    <Panel
      title="Evidence chain"
      subtitle={isShown ? 'cryptographically signed' : 'pending'}
      accent={isShown ? 'emerald' : 'zinc'}
      active={isShown}
    >
      {!isShown ? (
        <div className="flex h-full items-center justify-center text-center">
          <p className="font-mono text-xs text-zinc-600">
            {state.status === 'failed'
              ? 'Scan failed — no evidence to publish.'
              : 'Evidence package assembles after winner selection.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col">
          {state.cves[0] && (
            <Row label="CVE" value={state.cves[0].cveId} />
          )}
          {state.cves[0] && (
            <Row
              label="affected package"
              value={`${state.cves[0].packageName} · ${state.cves[0].severity}`}
            />
          )}
          {ev.winningForkId && (
            <Row label="winning fork" value={ev.winningForkId} />
          )}
          {ev.beforeImage && ev.afterImage && (
            <Row
              label="chainguard dfc"
              value={`${ev.beforeImage} → ${ev.afterImage}`}
            />
          )}
          {ev.sbomHash && <Row label="sbom hash" value={ev.sbomHash} />}
          {ev.sigstoreUrl && (
            <Row
              label="sigstore signature"
              value={ev.sigstoreUrl}
              href={ev.sigstoreUrl}
            />
          )}
          {ev.slsaLevel !== undefined && (
            <Row label="slsa level" value={`L${ev.slsaLevel}`} />
          )}
          {ev.txHash && ev.explorerUrl && (
            <Row
              label="x402 payment (base sepolia)"
              value={ev.txHash}
              href={ev.explorerUrl}
            />
          )}
          {ev.prUrl && (
            <Row label="remediation pr" value={ev.prUrl} href={ev.prUrl} />
          )}
          {ev.evidenceHash && (
            <Row label="evidence hash" value={ev.evidenceHash} />
          )}
          {ev.citedMdUrl && (
            <Row
              label="published to cited.md"
              value={ev.citedMdUrl}
              href={ev.citedMdUrl}
            />
          )}
          {state.durationMs !== null && (
            <Row
              label="total duration"
              value={`${(state.durationMs / 1000).toFixed(1)}s`}
            />
          )}
        </div>
      )}
    </Panel>
  );
}
