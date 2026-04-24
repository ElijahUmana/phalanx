// TinyFish web action layer — Task #5
//
// Load-bearing in three FINAL-CONCEPT phases:
//   (1) Detection  — search + fetch CVE advisories pre-NVD
//   (2) Remediation action — navigate vendor portal, extract patched version
//   (3) Publication — create GitHub PR via browser agent (with REST fallback)
//
// Every exported function takes `scanId: string` as the FIRST argument.
// Emits event types (dashboard subscribes to these):
//   tinyfish.search / tinyfish.fetch
//   tinyfish.agent.start / tinyfish.agent.stream / tinyfish.agent.progress / tinyfish.agent.complete
//   tinyfish.portal.navigate / tinyfish.pr.create / tinyfish.enrich

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
} from './scanner.js';

export {
    inspectVendorPortal,
    type SupportedRegistry,
} from './vendor-portal.js';

export {
    createPullRequest,
    createPullRequestViaAgent,
    createPullRequestViaApi,
} from './pr-creator.js';

export { enrichCve } from './enrichment.js';

export type {
    AdvisorySource,
    CveAdvisoryReport,
    VendorPortalResult,
    EnrichmentHit,
    EnrichmentReport,
    PrStrategy,
    PrCreationResult,
    PrCreationInput,
} from './types.js';

export { getTinyFish } from './client.js';
