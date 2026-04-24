// Vendor portal navigator. Launches a TinyFish browser agent to visit the
// actual package registry page (npm, PyPI, etc.) and extract patched-version
// + changelog context that a plain NVD API call cannot yield — this is what
// the FINAL-CONCEPT "Phase 4: Patch Procurement" phase demands on the demo.
//
// Key choices:
//   - We stream() instead of run() so the dashboard can surface the TinyFish
//     streaming_url (live browser preview) as soon as it arrives.
//   - We use BrowserProfile.STEALTH to survive bot walls on vendor sites that
//     occasionally block the lightweight profile.

import { getTinyFish } from './client.js';
import { emitEvent } from '../events/emitter.js';
import type { VendorPortalResult } from './types.js';

// Inlined from @tiny-fish/sdk to avoid ESM static-link issues under tsx .mts.
// These values are the SDK's string-literal enum values at their source.
const BROWSER_PROFILE_STEALTH = 'stealth' as const;
const RUN_STATUS_COMPLETED = 'COMPLETED' as const;

export type SupportedRegistry =
    | 'npm'
    | 'pypi'
    | 'maven'
    | 'rubygems'
    | 'crates.io';

const REGISTRY_URLS: Record<SupportedRegistry, (pkg: string) => string> = {
    npm: (p) => `https://www.npmjs.com/package/${p}`,
    pypi: (p) => `https://pypi.org/project/${p}/`,
    maven: (p) => `https://mvnrepository.com/artifact/${p.replace(/:/g, '/')}`,
    rubygems: (p) => `https://rubygems.org/gems/${p}`,
    'crates.io': (p) => `https://crates.io/crates/${p}`,
};

/**
 * Navigate a package's registry page and extract patched version + release notes.
 *
 * @param scanId             orchestrator scan id
 * @param registry           one of: npm, pypi, maven, rubygems, crates.io
 * @param packageName        exact package name on that registry
 * @param currentVersion     current (vulnerable) version used by the repo
 * @param cveContext         optional CVE id so the agent can look for the fix reference
 */
export async function inspectVendorPortal(
    scanId: string,
    registry: SupportedRegistry,
    packageName: string,
    currentVersion: string | null,
    cveContext?: string,
): Promise<VendorPortalResult> {
    const urlBuilder = REGISTRY_URLS[registry];
    if (!urlBuilder) {
        throw new Error(
            `Unsupported registry: ${registry}. Supported: ${Object.keys(REGISTRY_URLS).join(', ')}`,
        );
    }
    const packageUrl = urlBuilder(packageName);

    const currentClause = currentVersion
        ? ` We are currently on version ${currentVersion} and need a fix.`
        : '';
    const cveClause = cveContext ? ` This is for patching ${cveContext}.` : '';

    const goal = [
        `Visit the ${registry} package page for "${packageName}".`,
        currentClause,
        cveClause,
        'Return a JSON object with these exact keys:',
        '  - latestVersion: the current latest stable version string',
        '  - patchedVersion: version that fixes the CVE (null if unsure)',
        '  - changelogSummary: 1-2 sentence summary of what changed since the vulnerable version',
        '  - releaseNotesUrl: URL to the GitHub release or changelog page',
        '  - releaseNotes: first ~500 chars of the latest release notes body',
        'Do not include markdown fences. Return strictly JSON.',
    ]
        .join(' ')
        .replace(/\s+/g, ' ');

    const client = getTinyFish();

    await emitEvent(scanId, {
        type: 'tinyfish.navigate',
        source: 'tinyfish',
        data: {
            registry,
            packageName,
            currentVersion,
            cveContext: cveContext ?? null,
            packageUrl,
            phase: 'vendor-portal',
        },
    });

    let runId = '';
    let streamingUrl: string | null = null;
    let finalResult: unknown = null;
    let finalError: string | null = null;

    const stream = await client.agent.stream(
        {
            goal,
            url: packageUrl,
            browser_profile: BROWSER_PROFILE_STEALTH,
        },
        {
            onStarted: async (event) => {
                runId = event.run_id;
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.start',
                    source: 'tinyfish',
                    data: { runId, url: packageUrl, phase: 'vendor-portal' },
                });
            },
            onStreamingUrl: async (event) => {
                streamingUrl = event.streaming_url;
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.stream',
                    source: 'tinyfish',
                    data: { runId, streamingUrl, phase: 'vendor-portal' },
                });
            },
            onProgress: async (event) => {
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.progress',
                    source: 'tinyfish',
                    data: { runId, purpose: event.purpose, phase: 'vendor-portal' },
                });
            },
            onComplete: async (event) => {
                finalResult = event.result;
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.complete',
                    source: 'tinyfish',
                    data: {
                        runId,
                        status: event.status,
                        hasResult: event.result !== null && event.result !== undefined,
                        phase: 'vendor-portal',
                    },
                });
            },
        },
    );

    // Drain the stream so errors surface. `for await` naturally completes.
    for await (const evt of stream) {
        if (evt.type === 'COMPLETE' && evt.status !== RUN_STATUS_COMPLETED) {
            finalError = evt.error?.message ?? `TinyFish run ended with status ${evt.status}`;
        }
    }

    if (finalError !== null) {
        throw new Error(
            `TinyFish vendor portal navigation failed for ${packageName}@${currentVersion ?? '?'}: ${finalError}`,
        );
    }

    const parsed = parseAgentJson(finalResult);

    return {
        registry,
        packageName,
        requestedVersion: currentVersion,
        patchedVersion:
            typeof parsed['patchedVersion'] === 'string'
                ? parsed['patchedVersion']
                : typeof parsed['latestVersion'] === 'string'
                  ? parsed['latestVersion']
                  : null,
        releaseNotes:
            typeof parsed['releaseNotes'] === 'string' ? parsed['releaseNotes'] : null,
        changelogSummary:
            typeof parsed['changelogSummary'] === 'string'
                ? parsed['changelogSummary']
                : null,
        packageUrl,
        streamingUrl,
        runId,
        raw: finalResult,
    };
}

function parseAgentJson(result: unknown): Record<string, unknown> {
    // TinyFish returns either a string (agent JSON-stringified the answer) or
    // an already-parsed object. Normalize both to Record for downstream access.
    if (result === null || result === undefined) return {};
    if (typeof result === 'object') return result as Record<string, unknown>;
    if (typeof result === 'string') {
        const trimmed = result.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
        try {
            const parsed = JSON.parse(trimmed);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
            return { _raw: result };
        }
    }
    return {};
}
