// TEMPORARY: Mock scan runner used while teammates build #3-#11.
// Emits synthetic events with realistic timings so the dashboard can be built
// end-to-end. Task #13 will delete this file and wire the real lib/* modules
// into orchestrator.ts directly.
//
// The event types and data shapes here are the canonical wire format every
// real module must match. See src/lib/events/types.ts for the contract.

import { randomUUID } from 'node:crypto';
import { emitEvent } from '@/lib/events/emitter';

export interface MockScanResult {
  winningForkId: string;
  evidenceUrl: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const DEMO_CVE = {
  cveId: 'CVE-2020-8203',
  packageName: 'lodash',
  affectedVersion: '4.17.15',
  patchedVersion: '4.17.19',
  severity: 'HIGH',
  description:
    'Prototype pollution in lodash.zipObjectDeep via crafted property paths.',
};

const DEMO_PACKAGES = [
  { name: 'lodash', version: '4.17.15', registry: 'npm' },
  { name: 'express', version: '4.18.2', registry: 'npm' },
  { name: 'react', version: '18.2.0', registry: 'npm' },
  { name: 'axios', version: '1.4.0', registry: 'npm' },
  { name: 'minimist', version: '1.2.5', registry: 'npm' },
];

export async function runMockScan(opts: {
  scanId: string;
  repoUrl: string;
}): Promise<MockScanResult> {
  const { scanId, repoUrl } = opts;

  // ─── Phase 0: On-demand audit ──────────────────────────────────────────
  await sleep(400);
  await emitEvent(scanId, {
    type: 'deps.parsed',
    source: 'scan',
    data: {
      repoUrl,
      manifestFiles: ['package.json', 'package-lock.json'],
      totalPackages: DEMO_PACKAGES.length,
      packages: DEMO_PACKAGES,
    },
  });

  await sleep(600);
  await emitEvent(scanId, {
    type: 'nexla.feed.ingest',
    source: 'nexla',
    data: { source: 'NVD', count: 247 },
  });
  await sleep(200);
  await emitEvent(scanId, {
    type: 'nexla.feed.ingest',
    source: 'nexla',
    data: { source: 'GHSA', count: 189 },
  });
  await sleep(200);
  await emitEvent(scanId, {
    type: 'nexla.feed.ingest',
    source: 'nexla',
    data: { source: 'OSV', count: 412 },
  });

  await sleep(500);
  await emitEvent(scanId, {
    type: 'cve.found',
    source: 'scan',
    data: {
      ...DEMO_CVE,
      sourceUrl: `https://nvd.nist.gov/vuln/detail/${DEMO_CVE.cveId}`,
    },
  });

  // ─── Phase 1: TinyFish enrichment ─────────────────────────────────────
  await sleep(300);
  await emitEvent(scanId, {
    type: 'tinyfish.search',
    source: 'tinyfish',
    data: {
      query: `${DEMO_CVE.packageName} ${DEMO_CVE.cveId} exploit PoC`,
      resultsCount: 7,
    },
  });
  await sleep(500);
  await emitEvent(scanId, {
    type: 'tinyfish.fetch',
    source: 'tinyfish',
    data: {
      url: `https://github.com/lodash/lodash/security/advisories/GHSA-p6mc-m468-83gw`,
      excerpt:
        'Prototype pollution via lodash.zipObjectDeep. Patched in 4.17.19.',
    },
  });

  // ─── Phase 2: Redis coordination + analysis ───────────────────────────
  await sleep(300);
  await emitEvent(scanId, {
    type: 'redis.vector.match',
    source: 'redis',
    data: {
      cveId: DEMO_CVE.cveId,
      similarCveId: 'CVE-2019-10744',
      cosineScore: 0.87,
      playbook: 'upgrade-minor-version',
    },
  });
  await sleep(200);
  await emitEvent(scanId, {
    type: 'redis.langcache.hit',
    source: 'redis',
    data: { hitRate: 0.72, promptHash: 'prototype-pollution-analysis' },
  });

  const analystIds = ['analyst-1', 'analyst-2', 'analyst-3', 'analyst-4'];
  for (const aid of analystIds) {
    await sleep(150);
    await emitEvent(scanId, {
      type: 'redis.stream.dispatch',
      source: 'redis',
      data: {
        cveId: DEMO_CVE.cveId,
        analystAgentId: aid,
        streamName: 'cve-investigations',
      },
    });
  }

  await sleep(300);
  await emitEvent(scanId, {
    type: 'wundergraph.query',
    source: 'wundergraph',
    data: {
      operation: 'dependencyBlastRadius',
      scope: 'read:sbom',
      agentId: 'analyst-1',
    },
  });
  await sleep(250);
  await emitEvent(scanId, {
    type: 'wundergraph.scope.denied',
    source: 'wundergraph',
    data: {
      operation: 'deployPatch',
      requiredScope: 'write:production',
      agentId: 'analyst-1',
    },
  });

  for (const aid of analystIds) {
    await sleep(200);
    await emitEvent(scanId, {
      type: 'guild.action',
      source: 'guild',
      data: {
        agentId: aid,
        agentName: 'Analyst',
        action: 'impact.analysis',
        inputHash: randomUUID().slice(0, 8),
        outputHash: randomUUID().slice(0, 8),
      },
    });
  }

  // ─── Phase 3: Parallel speculative remediation ────────────────────────
  const hypotheses = [
    { name: 'upgrade-minor', strategy: 'bump to 4.17.19' },
    { name: 'upgrade-major', strategy: 'bump to 4.17.21' },
    { name: 'pin-and-patch', strategy: 'apply vendor patch, keep pinned' },
    {
      name: 'swap-chainguard',
      strategy: 'replace with @chainguard/lodash-zero-cve',
    },
  ];

  const forks = hypotheses.map((h) => ({
    forkId: `fork-${h.name}-${randomUUID().slice(0, 6)}`,
    hypothesis: h,
  }));

  // Fire forks in parallel — the visual money shot
  const forkStartMs = Date.now();
  await Promise.all(
    forks.map(async (f, i) => {
      await sleep(i * 80);
      await emitEvent(scanId, {
        type: 'ghost.fork.started',
        source: 'ghost',
        data: {
          forkId: f.forkId,
          hypothesis: f.hypothesis,
          cveId: DEMO_CVE.cveId,
          parentDb: 'phalanx-deps',
        },
      });
    }),
  );
  await Promise.all(
    forks.map(async (f, i) => {
      await sleep(400 + i * 60);
      await emitEvent(scanId, {
        type: 'ghost.fork.complete',
        source: 'ghost',
        data: { forkId: f.forkId, durationMs: Date.now() - forkStartMs },
      });
    }),
  );

  // InsForge provisioning
  const backends = forks.map((f) => ({
    backendId: `insforge-${f.forkId}`,
    forkId: f.forkId,
    url: `https://${f.forkId}.insforge.app`,
  }));
  for (const b of backends) {
    await sleep(150);
    await emitEvent(scanId, {
      type: 'insforge.provision',
      source: 'insforge',
      data: b,
    });
  }

  // ─── Mid-flight cancellation (false positive) ─────────────────────────
  await sleep(900);
  const cancelledFork = forks[2]; // pin-and-patch turns out to be false positive
  await emitEvent(scanId, {
    type: 'redis.pubsub.cancel',
    source: 'redis',
    data: {
      cveId: DEMO_CVE.cveId,
      reason:
        'Analyst-3 determined vendor patch already applied upstream; false positive.',
    },
  });
  await sleep(100);
  await emitEvent(scanId, {
    type: 'hypothesis.cancelled',
    source: 'hypothesis',
    data: {
      forkId: cancelledFork.forkId,
      backendId: `insforge-${cancelledFork.forkId}`,
      reason: 'false-positive',
    },
  });
  await sleep(100);
  await emitEvent(scanId, {
    type: 'insforge.cleanup',
    source: 'insforge',
    data: { backendId: `insforge-${cancelledFork.forkId}` },
  });

  // Surviving forks run validation in parallel
  const survivors = forks.filter((f) => f.forkId !== cancelledFork.forkId);
  await Promise.all(
    survivors.map(async (f, i) => {
      await sleep(500 + i * 200);
      const testsTotal = 42;
      const testsPassed =
        f.hypothesis.name === 'upgrade-minor' ? 42 : 38 + i;
      await emitEvent(scanId, {
        type: 'insforge.validate',
        source: 'insforge',
        data: {
          backendId: `insforge-${f.forkId}`,
          score: testsPassed / testsTotal,
          testsPassed,
          testsTotal,
        },
      });
    }),
  );

  // ─── Phase 4: Web action (TinyFish) ───────────────────────────────────
  await sleep(400);
  await emitEvent(scanId, {
    type: 'tinyfish.navigate',
    source: 'tinyfish',
    data: {
      url: 'https://www.npmjs.com/package/lodash/v/4.17.19',
      action: 'verify-patched-version',
    },
  });

  await sleep(500);
  await emitEvent(scanId, {
    type: 'x402.payment',
    source: 'x402',
    data: {
      amountUsd: 0.25,
      txHash:
        '0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      explorerUrl:
        'https://sepolia.basescan.org/tx/0xa1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90',
      recipient: 'agentic.market (external PoC verification)',
    },
  });

  // ─── Phase 5: Winner selection ────────────────────────────────────────
  await sleep(400);
  const winner = survivors[0]; // upgrade-minor scored best
  await emitEvent(scanId, {
    type: 'guild.approval.granted',
    source: 'guild',
    data: {
      gateId: 'prod-deploy-gate',
      approver: 'human-in-the-loop',
      decisionReason: `${winner.hypothesis.name} passed 42/42 integration tests with zero blast-radius expansion`,
    },
  });

  // ─── Chainguard remediation baseline ──────────────────────────────────
  await sleep(300);
  await emitEvent(scanId, {
    type: 'chainguard.dfc.convert',
    source: 'chainguard',
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
  await sleep(300);
  await emitEvent(scanId, {
    type: 'chainguard.sbom',
    source: 'chainguard',
    data: {
      imageHash:
        'sha256:8f4c9e1d3b2a5f67890a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f67',
      sigstoreUrl:
        'https://search.sigstore.dev/?hash=sha256%3A8f4c9e1d3b2a5f67890a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f67',
      slsaLevel: 3,
    },
  });

  // ─── Phase 6: PR + publication + writeback ────────────────────────────
  await sleep(400);
  await emitEvent(scanId, {
    type: 'tinyfish.pr.created',
    source: 'tinyfish',
    data: {
      prUrl: `https://github.com/ElijahUmana/phalanx/pull/1`,
      repo: repoUrl,
      reviewers: ['security-team', 'dependabot[bot]'],
    },
  });

  await sleep(300);
  const slug = `${DEMO_CVE.cveId.toLowerCase()}-remediation`;
  await emitEvent(scanId, {
    type: 'senso.published',
    source: 'senso',
    data: {
      citedMdUrl: `https://cited.md/elijah/${slug}`,
      handle: 'elijah',
      slug,
      evidenceHash: `sha256:${randomUUID().replace(/-/g, '')}`,
    },
  });

  await sleep(250);
  await emitEvent(scanId, {
    type: 'nexla.writeback',
    source: 'nexla',
    data: {
      targetSystem: 'Jira',
      artifact: 'SEC-4721 remediation report',
    },
  });
  await sleep(150);
  await emitEvent(scanId, {
    type: 'nexla.writeback',
    source: 'nexla',
    data: { targetSystem: 'Slack', artifact: '#security-alerts' },
  });

  return {
    winningForkId: winner.forkId,
    evidenceUrl: `https://cited.md/elijah/${slug}`,
  };
}
