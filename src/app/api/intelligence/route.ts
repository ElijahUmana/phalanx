import { x402Protected, type X402Pricing } from '@/lib/x402';
import { findSimilarCves, lexicalSearchCves } from '@/lib/ghost/memory';

const PRICING: X402Pricing = {
  amountUsdc: '1000',
  description: 'Phalanx CVE remediation intelligence ($0.001 USDC)',
  resource: 'https://phalanx.dev/api/intelligence',
};

export const GET = x402Protected(PRICING, async (scanId, req) => {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') ?? 'prototype pollution lodash';

  const [semantic, lexical] = await Promise.all([
    findSimilarCves(scanId, q, 5).catch(() => []),
    lexicalSearchCves(scanId, q, 5).catch(() => []),
  ]);

  return {
    body: {
      query: q,
      scanId,
      semanticMatches: semantic.map((s) => ({
        cveId: s.cve.cveId,
        severity: s.cve.severity,
        similarity: s.similarity,
        description: s.cve.description.slice(0, 280),
        patchVersions: s.cve.patchVersions,
      })),
      lexicalMatches: lexical.map((c) => ({
        cveId: c.cveId,
        severity: c.severity,
        description: c.description.slice(0, 280),
        patchVersions: c.patchVersions,
      })),
    },
  };
});
