// TinyFish web action layer — Task #5
//
// Load-bearing in three FINAL-CONCEPT phases:
//   (1) Detection  — search + fetch CVE advisories pre-NVD
//   (2) Remediation action — navigate vendor portal, extract patched version
//   (3) Publication — create GitHub PR via browser agent (with REST fallback)
//
// Every exported function takes `scanId: string` as the FIRST argument.
// Emits event types (dashboard subscribes to these):
//   tinyfish.search           — one per search.query call
//   tinyfish.fetch            — one per fetch.getContents call
//   tinyfish.navigate         — one per vendor-portal agent.stream() start
//   tinyfish.pr.attempt       — intermediate / failure stages of PR creation
//   tinyfish.pr.created       — successful PR creation (agent OR api strategy)
//   tinyfish.enrich           — CVE enrichment summary
//   tinyfish.agent.{start,stream,progress,complete} — low-level browser-agent lifecycle

// NOTE: We attach `.js` extensions to the relative re-exports below so this
// module loads under both CJS (tsx default) and ESM strict mode. TypeScript's
// "moduleResolution": "bundler" / "node16" both accept `.js` on `.ts` sources —
// tsc rewrites them on emit. ESM strict mode (required when Node runs a .mts
// script that imports `@tiny-fish/sdk`, which is an ESM-only package)
// refuses to resolve extension-less specifiers; this is the fix for that path
// while remaining backward-compatible with the existing CJS consumers.

export {
    searchAdvisories,
    enrichAdvisoriesWithContent,
    findAndFetchAdvisories,
} from './scanner';

export {
    inspectVendorPortal,
    type SupportedRegistry,
} from './vendor-portal';

export {
    createPullRequest,
    createPullRequestViaAgent,
    createPullRequestViaApi,
} from './pr-creator';

export { enrichCve } from './enrichment';

export type {
    AdvisorySource,
    CveAdvisoryReport,
    VendorPortalResult,
    EnrichmentHit,
    EnrichmentReport,
    PrStrategy,
    PrCreationResult,
    PrCreationInput,
} from './types';

export { getTinyFish } from './client';
