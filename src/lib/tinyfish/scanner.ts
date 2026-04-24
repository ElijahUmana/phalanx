// CVE advisory scanner — uses TinyFish Search to find advisory pages that
// NVD/GHSA APIs miss (vendor security advisories, Twitter posts, early PoCs),
// then TinyFish Fetch to pull full advisory content into a structured report.
// Both calls emit events so the dashboard can render them live.

import { getTinyFish } from './client.js';
import { emitEvent } from '../events/emitter.js';
import type { AdvisorySource, CveAdvisoryReport, FetchResult, SearchResult } from './types.js';

// Inlined to avoid ESM static-link issues with @tiny-fish/sdk's exports field
// under tsx .mts mode. The SDK's FetchFormat is a string enum of these values.
const FETCH_FORMAT_MARKDOWN = 'markdown' as const;

const DEFAULT_MAX_RESULTS = 5;

/**
 * Search the open web for advisory pages relating to a CVE.
 *
 * @param scanId       orchestrator scan id
 * @param cveId        e.g. `CVE-2020-8203`
 * @param packageName  optional; narrows the query. "lodash" for the example above.
 * @param opts.maxResults limit the number of URLs kept (default 5)
 */
export async function searchAdvisories(
    scanId: string,
    cveId: string,
    packageName: string | null,
    opts: { maxResults?: number } = {},
): Promise<AdvisorySource[]> {
    const client = getTinyFish();
    const max = opts.maxResults ?? DEFAULT_MAX_RESULTS;

    const baseQueries = [
        packageName
            ? `${packageName} ${cveId} vulnerability advisory site:github.com OR site:nvd.nist.gov`
            : `${cveId} vulnerability advisory`,
        packageName
            ? `${packageName} ${cveId} patch release notes`
            : `${cveId} patch release`,
    ];

    const all: AdvisorySource[] = [];
    for (const query of baseQueries) {
        const response = await client.search.query({ query });
        await emitEvent(scanId, {
            type: 'tinyfish.search',
            source: 'tinyfish',
            data: {
                query,
                totalResults: response.total_results,
                returnedCount: response.results.length,
                cveId,
            },
        });
        for (const r of response.results as SearchResult[]) {
            if (all.some((x) => x.url === r.url)) continue;
            all.push({
                url: r.url,
                title: r.title,
                snippet: r.snippet,
                publishedDate: null,
                siteName: r.site_name,
                bodyMarkdown: null,
            });
            if (all.length >= max) break;
        }
        if (all.length >= max) break;
    }

    return all;
}

/**
 * Pull full content from previously discovered advisory URLs.
 * Merges the markdown body + published date into the AdvisorySource objects
 * in-place and returns the enriched report.
 */
export async function enrichAdvisoriesWithContent(
    scanId: string,
    cveId: string,
    sources: AdvisorySource[],
    opts: { packageName?: string | null } = {},
): Promise<CveAdvisoryReport> {
    const client = getTinyFish();
    const urls = sources.map((s) => s.url).slice(0, 10); // TinyFish fetch limit = 10

    const report: CveAdvisoryReport = {
        cveId,
        packageName: opts.packageName ?? null,
        sources,
        searchQueries: [],
        fetchedAt: new Date().toISOString(),
    };

    if (urls.length === 0) {
        await emitEvent(scanId, {
            type: 'tinyfish.fetch',
            source: 'tinyfish',
            data: { cveId, urlCount: 0, status: 'skipped' },
        });
        return report;
    }

    const response = await client.fetch.getContents({
        urls,
        format: FETCH_FORMAT_MARKDOWN,
        links: true,
        image_links: false,
    });

    await emitEvent(scanId, {
        type: 'tinyfish.fetch',
        source: 'tinyfish',
        data: {
            cveId,
            urlCount: urls.length,
            succeeded: response.results.length,
            failed: response.errors?.length ?? 0,
        },
    });

    const byUrl = new Map<string, FetchResult>();
    for (const r of response.results) byUrl.set(r.url, r);

    for (const source of sources) {
        const hit = byUrl.get(source.url);
        if (!hit) continue;
        source.publishedDate = hit.published_date;
        if (hit.format === 'markdown' && typeof hit.text === 'string') {
            source.bodyMarkdown = hit.text;
        }
    }

    return report;
}

/**
 * One-shot: search + fetch in a single call. Returns the merged advisory report.
 */
export async function findAndFetchAdvisories(
    scanId: string,
    cveId: string,
    packageName: string | null,
    opts: { maxResults?: number } = {},
): Promise<CveAdvisoryReport> {
    const sources = await searchAdvisories(scanId, cveId, packageName, opts);
    return enrichAdvisoriesWithContent(scanId, cveId, sources, { packageName });
}
