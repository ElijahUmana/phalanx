// TinyFish web action layer — shared Zod schemas + inferred types.
// Every exported function in this subsystem takes `scanId: string` as the first
// argument so the orchestrator can stitch TinyFish runs into a scan's timeline
// and the dashboard can render per-scan browser-preview + progress panels.
//
// Schemas are the source of truth — call `.parse()` or `.safeParse()` at system
// boundaries (persisting to Ghost, responding to dashboard SSE, etc.) to get
// runtime guarantees. Use the `z.infer<>` types for compile-time shape checks.

import { z } from 'zod';
import type { SearchResult, FetchResult } from '@tiny-fish/sdk';

export type { SearchResult, FetchResult };

// ---------- Scanner ----------

export const advisorySourceSchema = z.object({
    url: z.string().url(),
    title: z.string().nullable(),
    snippet: z.string(),
    publishedDate: z.string().nullable(),
    siteName: z.string(),
    bodyMarkdown: z.string().nullable(),
});
export type AdvisorySource = z.infer<typeof advisorySourceSchema>;

export const cveAdvisoryReportSchema = z.object({
    cveId: z.string(),
    packageName: z.string().nullable(),
    sources: z.array(advisorySourceSchema),
    searchQueries: z.array(z.string()),
    fetchedAt: z.string(),
});
export type CveAdvisoryReport = z.infer<typeof cveAdvisoryReportSchema>;

// ---------- Vendor portal ----------

export const registrySchema = z.enum([
    'npm',
    'pypi',
    'maven',
    'rubygems',
    'crates.io',
    'other',
]);
export type Registry = z.infer<typeof registrySchema>;

export const vendorPortalResultSchema = z.object({
    registry: registrySchema,
    packageName: z.string(),
    requestedVersion: z.string().nullable(),
    patchedVersion: z.string().nullable(),
    releaseNotes: z.string().nullable(),
    changelogSummary: z.string().nullable(),
    packageUrl: z.string().url(),
    /** URL of the live browser preview from TinyFish (visible for the demo). */
    streamingUrl: z.string().url().nullable(),
    /** TinyFish run id for audit. */
    runId: z.string(),
    /** Raw agent-returned result payload — kept `unknown` so the schema does
     *  not lie about shape. Consumers that care should parse `raw` further. */
    raw: z.unknown(),
});
export type VendorPortalResult = z.infer<typeof vendorPortalResultSchema>;

// ---------- Enrichment ----------

export const enrichmentKindSchema = z.enum([
    'vendor_advisory',
    'github_poc',
    'researcher_post',
    'ghsa',
    'nvd',
    'other',
]);
export type EnrichmentKind = z.infer<typeof enrichmentKindSchema>;

export const enrichmentHitSchema = z.object({
    kind: enrichmentKindSchema,
    url: z.string().url(),
    title: z.string(),
    snippet: z.string(),
    confidence: z.number().min(0).max(1),
});
export type EnrichmentHit = z.infer<typeof enrichmentHitSchema>;

export const enrichmentReportSchema = z.object({
    cveId: z.string(),
    hits: z.array(enrichmentHitSchema),
    primarySource: enrichmentHitSchema.nullable(),
    pocUrls: z.array(z.string().url()),
    vendorAdvisoryUrl: z.string().url().nullable(),
    generatedAt: z.string(),
});
export type EnrichmentReport = z.infer<typeof enrichmentReportSchema>;

// ---------- PR creation ----------

export const prStrategySchema = z.enum(['tinyfish-agent', 'github-api']);
export type PrStrategy = z.infer<typeof prStrategySchema>;

export const prCreationInputSchema = z.object({
    /** "owner/repo" — the target repository. */
    repoSlug: z.string().regex(/^[^/\s]+\/[^/\s]+$/, 'expected "owner/repo"'),
    /** e.g. "main" */
    baseBranch: z.string().min(1),
    /** e.g. "phalanx/fix-cve-2020-8203" */
    headBranch: z.string().min(1),
    title: z.string().min(1),
    body: z.string(),
    labels: z.array(z.string()).optional(),
    reviewers: z.array(z.string()).optional(),
    /** When true, prefer TinyFish browser-agent navigation over the GitHub API. */
    preferBrowserAgent: z.boolean().optional(),
    /** Description of commits already pushed to `headBranch` — context for the agent. */
    commitsSummary: z.string().optional(),
});
export type PrCreationInput = z.infer<typeof prCreationInputSchema>;

export const prCreationResultSchema = z.object({
    strategy: prStrategySchema,
    success: z.boolean(),
    prUrl: z.string().url().nullable(),
    prNumber: z.number().nullable(),
    repoSlug: z.string(),
    branchName: z.string(),
    title: z.string(),
    body: z.string(),
    labels: z.array(z.string()),
    reviewers: z.array(z.string()),
    /** Only populated when strategy === 'tinyfish-agent'. */
    streamingUrl: z.string().url().nullable(),
    runId: z.string().nullable(),
    /** Captured error message when success=false. */
    error: z.string().nullable(),
});
export type PrCreationResult = z.infer<typeof prCreationResultSchema>;
