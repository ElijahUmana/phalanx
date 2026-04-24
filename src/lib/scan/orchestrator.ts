// Scan orchestrator. Executes the full Phase 0 → Phase 6 workflow from
// FINAL-CONCEPT.md, emitting events at every step.
//
// During the blocked-on-other-teammates window, each phase calls a MOCK stub
// from ./mock.ts that emits synthetic events on realistic timings. As each
// teammate ships their real lib/* module (Task #3 Ghost, #4 Redis, #5 TinyFish,
// etc.), Task #13 swaps the mock call for the real import — one line per step.
//
// The event contract never changes; only the data source does.

import { emitEvent } from '@/lib/events/emitter';
import { runMockScan } from './mock';

export interface ScanOptions {
  scanId: string;
  repoUrl: string;
}

export async function runScan(opts: ScanOptions): Promise<void> {
  const { scanId, repoUrl } = opts;
  const startedAt = Date.now();

  await emitEvent(scanId, {
    type: 'scan.started',
    source: 'scan',
    data: { repoUrl },
  });

  try {
    // TODO (Task #13): Replace with real orchestration as each lib/* module ships.
    // Real shape:
    //   const deps       = await scanDeps(scanId, repoUrl);
    //   const enriched   = await tinyfish.enrich(scanId, deps.cves);
    //   const vecMatches = await redis.vectorSearch(scanId, enriched);
    //   const tasks      = await redis.dispatchAnalysts(scanId, enriched);
    //   const analyses   = await guild.runAnalysts(scanId, tasks);
    //   const hypotheses = await guild.plan(scanId, analyses);
    //   const forks      = await ghost.forkN(scanId, hypotheses);
    //   const backends   = await insforge.provisionN(scanId, forks);
    //   const results    = await Promise.all(backends.map(b => insforge.validate(scanId, b)));
    //   const winner     = await guild.selectWinner(scanId, results);
    //   const approved   = await guild.approvalGate(scanId, winner);
    //   const dfc        = await chainguard.convert(scanId, repoUrl);
    //   const sbom       = await chainguard.sbom(scanId, dfc.afterImage);
    //   const procured   = await tinyfish.procurePatch(scanId, approved);
    //   const payment    = await x402.payForVerification(scanId);
    //   const pr         = await tinyfish.createPR(scanId, approved);
    //   const published  = await senso.publish(scanId, { winner, sbom, payment, pr });
    //   await nexla.writeback(scanId, published);
    const result = await runMockScan(opts);

    await emitEvent(scanId, {
      type: 'scan.complete',
      source: 'scan',
      data: {
        winningForkId: result.winningForkId,
        evidenceUrl: result.evidenceUrl,
        durationMs: Date.now() - startedAt,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await emitEvent(scanId, {
      type: 'scan.failed',
      source: 'scan',
      data: { error: message },
    });
    throw err;
  }
}
