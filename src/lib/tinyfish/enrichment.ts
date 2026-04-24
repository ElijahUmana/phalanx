// CVE enrichment — given a CVE ID, use TinyFish Search + Fetch to collect
// pre-NVD intelligence that API-only scanners miss: exploit PoCs on GitHub,
// security researcher posts, vendor advisories that haven't propagated to
// OSV/GHSA yet. Returns a structured report keyed by source kind with a
// heuristic confidence score per hit.

import { getTinyFish } from './client';
import { emitEvent } from '../events/emitter';
import type { EnrichmentHit, EnrichmentReport, SearchResult } from './types';

const QUERY_TEMPLATES: Array<{
    template: (cveId: string) => string;
    kind: EnrichmentHit['kind'];
    baseConfidence: number;
}> = [
    {
        template: (cve) => `${cve} proof of concept exploit site:github.com`,
        kind: 'github_poc',
        baseConfidence: 0.8,
    },
    {
        template: (cve) => `${cve} vendor advisory security bulletin`,
        kind: 'vendor_advisory',
        baseConfidence: 0.85,
    },
    {
        template: (cve) => `${cve} site:nvd.nist.gov OR site:github.com/advisories`,
        kind: 'nvd',
        baseConfidence: 0.95,
    },
    {
        template: (cve) => `${cve} exploit writeup security researcher`,
        kind: 'researcher_post',
        baseConfidence: 0.6,
    },
];

function classifyByUrl(url: string): EnrichmentHit['kind'] {
    if (/github\.com\/advisories\//.test(url)) return 'ghsa';
    if (/nvd\.nist\.gov/.test(url)) return 'nvd';
    if (/github\.com\//.test(url) && /poc|exploit/i.test(url)) return 'github_poc';
    if (/x\.com|twitter\.com|medium\.com|dev\.to/.test(url)) return 'researcher_post';
    return 'other';
}

function scoreHit(result: SearchResult, baseConfidence: number): number {
    let score = baseConfidence;
    // Prioritize well-known security sources.
    if (/nvd\.nist\.gov|github\.com\/advisories|cve\.mitre\.org/.test(result.url)) {
        score = Math.max(score, 0.95);
    }
    // Demote low-signal aggregator pages.
    if (/stackoverflow|reddit/.test(result.url)) score -= 0.15;
    if (result.position === 1) score += 0.05;
    return Math.min(1, Math.max(0, score));
}

export async function enrichCve(scanId: string, cveId: string): Promise<EnrichmentReport> {
    const client = getTinyFish();

    const hits: EnrichmentHit[] = [];
    for (const { template, kind, baseConfidence } of QUERY_TEMPLATES) {
        const query = template(cveId);
        const response = await client.search.query({ query });
        await emitEvent(scanId, {
            type: 'tinyfish.search',
            source: 'tinyfish',
            data: {
                query,
                phase: 'enrich',
                cveId,
                totalResults: response.total_results,
                returnedCount: response.results.length,
            },
        });
        for (const r of response.results as SearchResult[]) {
            if (hits.some((h) => h.url === r.url)) continue;
            const resolvedKind = kind === 'other' ? classifyByUrl(r.url) : classifyByUrl(r.url) === kind ? kind : classifyByUrl(r.url) === 'other' ? kind : classifyByUrl(r.url);
            hits.push({
                kind: resolvedKind,
                url: r.url,
                title: r.title,
                snippet: r.snippet,
                confidence: scoreHit(r, baseConfidence),
            });
        }
    }

    hits.sort((a, b) => b.confidence - a.confidence);

    const primary = hits[0] ?? null;
    const pocUrls = hits.filter((h) => h.kind === 'github_poc').map((h) => h.url);
    const vendorAdvisory =
        hits.find((h) => h.kind === 'vendor_advisory' || h.kind === 'ghsa' || h.kind === 'nvd') ?? null;

    const report: EnrichmentReport = {
        cveId,
        hits,
        primarySource: primary,
        pocUrls,
        vendorAdvisoryUrl: vendorAdvisory?.url ?? null,
        generatedAt: new Date().toISOString(),
    };

    await emitEvent(scanId, {
        type: 'tinyfish.enrich',
        source: 'tinyfish',
        data: {
            cveId,
            totalHits: hits.length,
            pocCount: pocUrls.length,
            hasVendorAdvisory: vendorAdvisory !== null,
            primaryKind: primary?.kind ?? null,
        },
    });

    return report;
}
