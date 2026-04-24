// Scan orchestrator — wires every lib/* module into a single Phase 0→6 flow.
//
// Hybrid strategy: phases with real modules shipped (#3 Ghost, #4 Redis,
// #6 InsForge, #10 Nexla) call real code and emit events from real data.
// Phases still in progress (#2 WunderGraph, #5 TinyFish, #7 x402, #8 Guild,
// #9 Chainguard, #11 Senso) fall back to synthetic events on realistic
// timings so the dashboard stays populated end-to-end. When the remaining
// tasks land, the mock branches collapse to real calls — no event contract
// change required.

import { randomUUID } from 'node:crypto';
import { emitEvent } from '@/lib/events/emitter';
import { auditRepo } from './audit';
import {
  ingestAll as nexlaIngestAll,
  ingestSource as nexlaIngest,
  writebackAll as nexlaWritebackAll,
} from '@/lib/nexla';
import {
  provisionBackend as insforgeProvision,
  validateBackend as insforgeValidate,
  cleanupBackend as insforgeCleanup,
} from '@/lib/insforge';

export interface ScanOptions {
  scanId: string;
  repoUrl: string;
}

const DEMO_CVE = {
  cveId: 'CVE-2020-8203',
  packageName: 'lodash',
  severity: 'HIGH',
  description:
    'Prototype pollution in lodash.zipObjectDeep via crafted property paths.',
  sourceUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2020-8203',
};

const HYPOTHESES = [
  { name: 'upgrade-minor', strategy: 'bump to 4.17.19' },
  { name: 'upgrade-major', strategy: 'bump to 4.17.21' },
  { name: 'pin-and-patch', strategy: 'apply vendor patch, keep pinned' },
  { name: 'swap-chainguard', strategy: 'replace with @chainguard/lodash-zero-cve' },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runScan(opts: ScanOptions): Promise<void> {
  const { scanId, repoUrl } = opts;
  const startedAt = Date.now();

  await emitEvent(scanId, {
    source: 'scan',
    type: 'scan.started',
    data: { repoUrl },
  });

  try {
    // ── Phase 0: Audit — REAL (fetch + parse package.json) ──────────────
    const audit = await auditRepo(scanId, repoUrl);

    // ── Phase 1: Nexla feed ingestion — REAL (NVD + OSV live, GHSA optional)
    await nexlaIngestAll(scanId, audit.packages[0]?.name).catch((err) => {
      console.warn('[scan] nexla ingestAll non-fatal:', err);
    });

    // CVE selection — demo narrative anchors on lodash@<=4.17.15 so TinyFish
    // enrichment panel + evidence chain render coherently. Real CVE lookup
    // lives in a future iteration of the audit phase.
    await sleep(300);
    await emitEvent(scanId, {
      source: 'scan',
      type: 'cve.found',
      data: DEMO_CVE,
    });

    // ── Phase 1b: TinyFish enrichment — MOCK (blocked on #5) ────────────
    await sleep(250);
    await emitEvent(scanId, {
      source: 'tinyfish',
      type: 'tinyfish.search',
      data: {
        query: `${DEMO_CVE.packageName} ${DEMO_CVE.cveId} exploit PoC`,
        resultsCount: 7,
      },
    });
    await sleep(350);
    await emitEvent(scanId, {
      source: 'tinyfish',
      type: 'tinyfish.fetch',
      data: {
        url: 'https://github.com/lodash/lodash/security/advisories/GHSA-p6mc-m468-83gw',
        excerpt: 'Prototype pollution via lodash.zipObjectDeep. Patched in 4.17.19.',
      },
    });

    // ── Phase 2: Redis coordination — MOCK (pushed Redis API doesn't expose
    //     helpers yet; scaffold-data has a local refactor in flight)
    await sleep(200);
    await emitEvent(scanId, {
      source: 'redis',
      type: 'redis.vector.match',
      data: {
        cveId: DEMO_CVE.cveId,
        similarCveId: 'CVE-2019-10744',
        cosineScore: 0.87,
        playbook: 'upgrade-minor-version',
      },
    });
    await sleep(150);
    await emitEvent(scanId, {
      source: 'redis',
      type: 'redis.langcache.hit',
      data: { hitRate: 0.72, promptHash: 'prototype-pollution-analysis' },
    });
    for (const aid of ['analyst-1', 'analyst-2', 'analyst-3', 'analyst-4']) {
      await sleep(100);
      await emitEvent(scanId, {
        source: 'redis',
        type: 'redis.stream.dispatch',
        data: {
          cveId: DEMO_CVE.cveId,
          analystAgentId: aid,
          streamName: 'cve-investigations',
        },
      });
    }

    // ── Phase 2b: WunderGraph federated queries — MOCK (blocked on #2) ──
    await sleep(200);
    await emitEvent(scanId, {
      source: 'wundergraph',
      type: 'wundergraph.query',
      data: {
        operation: 'dependencyBlastRadius',
        scope: 'read:sbom',
        agentId: 'analyst-1',
      },
    });
    await sleep(200);
    await emitEvent(scanId, {
      source: 'wundergraph',
      type: 'wundergraph.scope.denied',
      data: {
        operation: 'deployPatch',
        requiredScope: 'write:production',
        agentId: 'analyst-1',
      },
    });

    // ── Phase 2c: Guild analyst runs — MOCK (blocked on #8) ─────────────
    for (const aid of ['analyst-1', 'analyst-2', 'analyst-3', 'analyst-4']) {
      await sleep(150);
      await emitEvent(scanId, {
        source: 'guild',
        type: 'guild.action',
        data: {
          agentId: aid,
          agentName: 'Analyst',
          action: 'impact.analysis',
          inputHash: randomUUID().slice(0, 8),
          outputHash: randomUUID().slice(0, 8),
        },
      });
    }

    // ── Phase 3: Parallel speculative forks — MIX REAL (InsForge) / MOCK ─
    const forks = HYPOTHESES.map((h) => ({
      forkId: `fork-${h.name}-${randomUUID().slice(0, 6)}`,
      hypothesis: h,
    }));

    // Fork started (mock event — real Ghost API doesn't take scanId on
    // the pushed HEAD; will swap once scaffold-data's refactor lands).
    for (let i = 0; i < forks.length; i++) {
      await sleep(i * 70);
      await emitEvent(scanId, {
        source: 'ghost',
        type: 'ghost.fork.started',
        data: {
          forkId: forks[i].forkId,
          hypothesis: forks[i].hypothesis,
          cveId: DEMO_CVE.cveId,
          parentDb: 'phalanx-deps',
        },
      });
    }
    for (let i = 0; i < forks.length; i++) {
      await sleep(300 + i * 40);
      await emitEvent(scanId, {
        source: 'ghost',
        type: 'ghost.fork.complete',
        data: { forkId: forks[i].forkId, durationMs: 480 + i * 60 },
      });
    }

    // Real InsForge provisioning — one staging backend per hypothesis.
    const backends = await Promise.all(
      forks.map((f) => insforgeProvision(scanId, f.forkId, f.hypothesis.name)),
    );

    // ── Phase 3b: Cancellation money shot — MOCK cancel event (Redis
    //     broadcastCancel signature on pushed HEAD doesn't accept scanId).
    //     Once scaffold-data's signature refactor ships, swap this for
    //     broadcastCancel(scanId, cveId, 'false_positive').
    await sleep(700);
    const cancelled = forks[2];
    await emitEvent(scanId, {
      source: 'redis',
      type: 'redis.pubsub.cancel',
      data: {
        cveId: DEMO_CVE.cveId,
        reason:
          'Analyst-3 determined vendor patch already applied upstream; false positive.',
      },
    });
    await emitEvent(scanId, {
      source: 'hypothesis',
      type: 'hypothesis.cancelled',
      data: {
        forkId: cancelled.forkId,
        backendId: backends[2].backendId,
        reason: 'false-positive',
      },
    });
    await insforgeCleanup(scanId, backends[2].backendId, 'cancelled');

    // ── Phase 3c: Validate surviving forks — REAL InsForge validate ─────
    const survivors = forks.filter((_, i) => i !== 2);
    const survivorBackends = backends.filter((_, i) => i !== 2);
    await Promise.all(
      survivorBackends.map((b, i) =>
        sleep(300 + i * 180).then(() => insforgeValidate(scanId, b.backendId)),
      ),
    );

    // ── Phase 4: TinyFish web action + x402 payment — MOCK ──────────────
    await sleep(300);
    await emitEvent(scanId, {
      source: 'tinyfish',
      type: 'tinyfish.navigate',
      data: {
        url: 'https://www.npmjs.com/package/lodash/v/4.17.19',
        action: 'verify-patched-version',
      },
    });
    await sleep(350);
    await emitEvent(scanId, {
      source: 'x402',
      type: 'x402.payment',
      data: {
        amountUsd: 0.25,
        txHash:
          '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        explorerUrl:
          'https://sepolia.basescan.org/tx/0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
        recipient: 'agentic.market (external PoC verification)',
      },
    });

    // ── Phase 5: Winner selection + approval gate — MOCK (blocked on #8)
    await sleep(300);
    const winner = survivors[0];
    await emitEvent(scanId, {
      source: 'guild',
      type: 'guild.approval.granted',
      data: {
        gateId: 'prod-deploy-gate',
        approver: 'human-in-the-loop',
        decisionReason: `${winner.hypothesis.name} passed integration tests with zero blast-radius expansion`,
      },
    });

    // ── Phase 5b: Chainguard baseline — MOCK (blocked on #9) ────────────
    await sleep(250);
    await emitEvent(scanId, {
      source: 'chainguard',
      type: 'chainguard.dfc.convert',
      data: {
        beforeImage: 'node:18-alpine',
        afterImage: 'cgr.dev/chainguard/node:latest',
        diff: {
          cveCountBefore: 14,
          cveCountAfter: 0,
          baseImageSizeBefore: '172MB',
          baseImageSizeAfter: '68MB',
        },
      },
    });
    await sleep(250);
    await emitEvent(scanId, {
      source: 'chainguard',
      type: 'chainguard.sbom',
      data: {
        imageHash:
          'sha256:8f4c9e1d3b2a5f67890a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f67',
        sigstoreUrl:
          'https://search.sigstore.dev/?hash=sha256%3A8f4c9e1d3b2a5f67890a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f67',
        slsaLevel: 3,
      },
    });

    // ── Phase 6: PR + publication — MOCK (blocked on #5 / #11) ──────────
    await sleep(300);
    await emitEvent(scanId, {
      source: 'tinyfish',
      type: 'tinyfish.pr.created',
      data: {
        prUrl: 'https://github.com/ElijahUmana/phalanx/pull/1',
        repo: repoUrl,
        reviewers: ['security-team', 'dependabot[bot]'],
      },
    });

    const slug = `${DEMO_CVE.cveId.toLowerCase()}-remediation`;
    await sleep(250);
    await emitEvent(scanId, {
      source: 'senso',
      type: 'senso.published',
      data: {
        citedMdUrl: `https://cited.md/elijah/${slug}`,
        handle: 'elijah',
        slug,
        evidenceHash: `sha256:${randomUUID().replace(/-/g, '')}`,
      },
    });

    // ── Phase 6b: Nexla writeback — REAL ────────────────────────────────
    await nexlaWritebackAll(scanId, `Phalanx remediation: ${DEMO_CVE.cveId} fixed via ${winner.hypothesis.name}`, {
      cveId: DEMO_CVE.cveId,
      winningForkId: winner.forkId,
      evidenceUrl: `https://cited.md/elijah/${slug}`,
    }).catch((err) => {
      console.warn('[scan] nexla writeback non-fatal:', err);
    });

    // ── Phase 6c: Cleanup non-winner backends ───────────────────────────
    await Promise.all(
      survivorBackends
        .filter((b) => b.forkId !== winner.forkId)
        .map((b) => insforgeCleanup(scanId, b.backendId, 'scan-complete')),
    );

    await emitEvent(scanId, {
      source: 'scan',
      type: 'scan.complete',
      data: {
        winningForkId: winner.forkId,
        evidenceUrl: `https://cited.md/elijah/${slug}`,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emitEvent(scanId, {
      source: 'scan',
      type: 'scan.failed',
      data: { error: message },
    });
    throw err;
  }
}

// Exported for ingestion-only use-cases (e.g. a cron that just polls feeds).
export { nexlaIngest };
