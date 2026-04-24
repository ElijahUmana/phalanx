// TinyFish web action layer — shared types.
// Every exported function in this subsystem takes `scanId: string` as the first
// argument so the orchestrator can stitch TinyFish runs into a scan's timeline
// and the dashboard can render per-scan browser-preview + progress panels.

import type { SearchResult, FetchResult } from '@tiny-fish/sdk';

export type { SearchResult, FetchResult };

/** A CVE advisory reference discovered via TinyFish Search or Fetch. */
export interface AdvisorySource {
    url: string;
    title: string | null;
    snippet: string;
    publishedDate: string | null;
    siteName: string;
    /** Empty until we pull full content via fetch. */
    bodyMarkdown: string | null;
}

export interface CveAdvisoryReport {
    cveId: string;
    packageName: string | null;
    sources: AdvisorySource[];
    searchQueries: string[];
    fetchedAt: string;
}

export interface VendorPortalResult {
    registry: 'npm' | 'pypi' | 'maven' | 'rubygems' | 'crates.io' | 'other';
    packageName: string;
    requestedVersion: string | null;
    patchedVersion: string | null;
    releaseNotes: string | null;
    changelogSummary: string | null;
    packageUrl: string;
    /** URL of the live browser preview from TinyFish (visible for the demo). */
    streamingUrl: string | null;
    /** TinyFish run id for audit. */
    runId: string;
    /** Raw agent-returned result payload. */
    raw: unknown;
}

export interface EnrichmentHit {
    kind:
        | 'vendor_advisory'
        | 'github_poc'
        | 'researcher_post'
        | 'ghsa'
        | 'nvd'
        | 'other';
    url: string;
    title: string;
    snippet: string;
    confidence: number;
}

export interface EnrichmentReport {
    cveId: string;
    hits: EnrichmentHit[];
    primarySource: EnrichmentHit | null;
    pocUrls: string[];
    vendorAdvisoryUrl: string | null;
    generatedAt: string;
}

export type PrStrategy = 'tinyfish-agent' | 'github-api';

export interface PrCreationResult {
    strategy: PrStrategy;
    success: boolean;
    prUrl: string | null;
    prNumber: number | null;
    repoSlug: string;
    branchName: string;
    title: string;
    body: string;
    labels: string[];
    reviewers: string[];
    /** Only populated when strategy === 'tinyfish-agent'. */
    streamingUrl: string | null;
    runId: string | null;
    /** Captured error message when success=false. */
    error: string | null;
}

export interface PrCreationInput {
    repoSlug: string;             // "owner/repo"
    baseBranch: string;            // "main"
    headBranch: string;            // "phalanx/fix-cve-2020-8203"
    title: string;
    body: string;
    labels?: string[];
    reviewers?: string[];
    /** When true, prefer TinyFish browser-agent navigation over the GitHub API. */
    preferBrowserAgent?: boolean;
    /**
     * A description of the remediation commits already pushed to `headBranch`
     * (used by the agent to set PR description context).
     */
    commitsSummary?: string;
}
