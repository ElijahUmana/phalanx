/**
 * Phalanx Senso / cited.md integration smoke test.
 *
 * Publishes a real evidence package to the org's cited.md destination.
 * Exits non-zero on any failure. No mocks, no stubs.
 */

import { publishEvidence, buildSlug } from '@/lib/senso';
import { env } from '@/lib/env';

const SCAN_ID = `test-senso-${Date.now()}`;

async function main() {
  env();
  const input = {
    cveId: 'CVE-2020-8203',
    affectedPackage: 'lodash',
    fixedVersion: '4.17.21',
    hypothesis: 'upgrade lodash to 4.17.21',
    chainguardSbomHash: 'sha256:a1b2c3d4e5f60718293a4b5c6d7e8f9012345abcdef12345',
    sigstoreSignature: 'MEUCIQDphal4ntest...',
    slsaLevel: 3,
    guildAuditTrailId: 'guild-audit-phalanx-test-' + Date.now(),
    x402ReceiptHash: '0xphalanxtestreceipt',
    forkIds: ['fork-a1b2c3', 'fork-d4e5f6', 'fork-789abc', 'fork-def012'],
    insforgeBackends: ['https://insforge-a1b2.phalanx.dev', 'https://insforge-c3d4.phalanx.dev'],
    tinyfishPrUrl: 'https://github.com/ElijahUmana/phalanx/pull/0',
    validationSummary:
      'All 4 forks reproduced the vulnerability on the pre-patch fixture. Fork a1b2c3 + d4e5f6 passed all integration tests after the 4.17.21 upgrade; 789abc was cancelled as a false positive mid-flight via Redis Pub/Sub; def012 produced a regression in lodash-es downstream usage.',
  };

  console.log(`[test-senso] publishing evidence for ${input.cveId} (slug=${buildSlug(input.cveId)}) ...`);
  const result = await publishEvidence(SCAN_ID, input);

  console.log(`[test-senso]   content_id      = ${result.contentId}`);
  console.log(`[test-senso]   prompt_id       = ${result.promptId}`);
  console.log(`[test-senso]   publish_record  = ${result.publishRecordId ?? '(none yet)'}`);
  console.log(`[test-senso]   destination     = ${result.destination}`);
  console.log(`[test-senso]   slug            = ${result.slug}`);
  console.log(`[test-senso]   status          = ${result.status}`);
  console.log(`[test-senso]   live url        = ${result.url}`);

  if (!result.contentId || result.contentId.length < 8) {
    throw new Error(`expected a real content_id; got "${result.contentId}"`);
  }
  if (!result.promptId) throw new Error('expected a prompt id');
  if (!result.url.startsWith('http')) throw new Error(`expected http(s) url; got "${result.url}"`);

  console.log(`\n[test-senso] ✓ publish ok — evidence lives at ${result.url}`);
}

main().catch((err) => {
  console.error('[test-senso] FAILED:', err);
  process.exit(1);
});
