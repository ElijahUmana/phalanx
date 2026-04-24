// Canonical seed data for marketplace-service. Remediation options, patch
// providers, and x402 listings for the FINAL-CONCEPT CVE scenario. Chainguard
// zero-CVE swap options are deliberately high-confidence — they ARE the
// remediation baseline narrative.

export type RemediationStrategy =
    | 'UPGRADE'
    | 'PIN'
    | 'CHAINGUARD_SWAP'
    | 'VENDOR_PATCH'
    | 'ROLLBACK';

export interface SeedRemediationOption {
    id: string;
    cveId: string;
    strategy: RemediationStrategy;
    targetVersion: string | null;
    targetImage: string | null;
    confidence: number;
    provider: string;
    costUsd: number;
    description: string;
    x402ListingId: string | null;
}

export const REMEDIATIONS: SeedRemediationOption[] = [
    {
        id: 'rem-001',
        cveId: 'CVE-2020-8203',
        strategy: 'UPGRADE',
        targetVersion: '4.17.21',
        targetImage: null,
        confidence: 0.95,
        provider: 'npm-registry',
        costUsd: 0,
        description:
            'Upgrade lodash to 4.17.21. Fixes prototype pollution via zipObjectDeep. No breaking changes.',
        x402ListingId: null,
    },
    {
        id: 'rem-002',
        cveId: 'CVE-2020-8203',
        strategy: 'CHAINGUARD_SWAP',
        targetVersion: null,
        targetImage: 'cgr.dev/chainguard/node:latest',
        confidence: 0.99,
        provider: 'Chainguard',
        costUsd: 0,
        description:
            'Swap base image to cgr.dev/chainguard/node:latest (zero known CVEs). Chainguard ships a distroless Node build with bundled patched lodash.',
        x402ListingId: null,
    },
    {
        id: 'rem-003',
        cveId: 'CVE-2021-3749',
        strategy: 'UPGRADE',
        targetVersion: '0.21.2',
        targetImage: null,
        confidence: 0.92,
        provider: 'npm-registry',
        costUsd: 0,
        description: 'Upgrade axios to 0.21.2. Patches ReDoS in trim regex.',
        x402ListingId: null,
    },
    {
        id: 'rem-004',
        cveId: 'CVE-2022-24999',
        strategy: 'UPGRADE',
        targetVersion: '4.17.3',
        targetImage: null,
        confidence: 0.88,
        provider: 'npm-registry',
        costUsd: 0,
        description:
            'Upgrade express to 4.17.3. Includes patched qs 6.10.3. Minor ts-signature change in qs.parse.',
        x402ListingId: null,
    },
    {
        id: 'rem-005',
        cveId: 'CVE-2024-28863',
        strategy: 'VENDOR_PATCH',
        targetVersion: null,
        targetImage: null,
        confidence: 0.85,
        provider: 'agentic.market',
        costUsd: 0.5,
        description:
            'Vendor-supplied backport patch for express 4.16 line. Paid via x402 micropayment on Base Sepolia.',
        x402ListingId: 'x402-001',
    },
    {
        id: 'rem-006',
        cveId: 'CVE-2024-28863',
        strategy: 'UPGRADE',
        targetVersion: '4.19.2',
        targetImage: null,
        confidence: 0.9,
        provider: 'npm-registry',
        costUsd: 0,
        description: 'Upgrade express to 4.19.2. Major version bump for app code.',
        x402ListingId: null,
    },
    {
        id: 'rem-007',
        cveId: 'CVE-2023-26136',
        strategy: 'UPGRADE',
        targetVersion: '4.1.3',
        targetImage: null,
        confidence: 0.9,
        provider: 'npm-registry',
        costUsd: 0,
        description: 'Upgrade tough-cookie to 4.1.3. Fixes CookieJar prototype pollution.',
        x402ListingId: null,
    },
];

export interface SeedPatchProvider {
    name: string;
    url: string;
    verified: boolean;
    sbomSigned: boolean;
}

export const PATCH_PROVIDERS: SeedPatchProvider[] = [
    { name: 'npm-registry', url: 'https://registry.npmjs.org', verified: true, sbomSigned: false },
    { name: 'Chainguard', url: 'https://cgr.dev', verified: true, sbomSigned: true },
    { name: 'Snyk', url: 'https://snyk.io', verified: true, sbomSigned: false },
    { name: 'agentic.market', url: 'https://agentic.market', verified: true, sbomSigned: false },
    { name: 'GHSA', url: 'https://github.com/advisories', verified: true, sbomSigned: false },
];

export interface SeedX402Listing {
    id: string;
    providerUrl: string;
    priceUsd: number;
    description: string;
    acceptedNetworks: string[];
    cveId: string;
}

export const X402_LISTINGS: SeedX402Listing[] = [
    {
        id: 'x402-001',
        providerUrl: 'https://agentic.market/listings/express-4.16-backport',
        priceUsd: 0.5,
        description: 'Backport patch for express 4.16 line covering CVE-2024-28863.',
        acceptedNetworks: ['base-sepolia', 'base-mainnet'],
        cveId: 'CVE-2024-28863',
    },
];

// Package name → provider names that offer patches.
export const PACKAGE_TO_PROVIDERS: Record<string, string[]> = {
    lodash: ['npm-registry', 'Chainguard'],
    axios: ['npm-registry', 'Snyk'],
    express: ['npm-registry', 'agentic.market'],
    'tough-cookie': ['npm-registry'],
    log4js: ['npm-registry'],
};

export function getRemediationsForCve(cveId: string): SeedRemediationOption[] {
    return REMEDIATIONS.filter((r) => r.cveId === cveId).sort(
        (a, b) => b.confidence - a.confidence,
    );
}

export function getRecommendedRemediation(cveId: string): SeedRemediationOption | null {
    const ordered = getRemediationsForCve(cveId);
    return ordered[0] ?? null;
}

export function getX402Listing(id: string): SeedX402Listing | null {
    return X402_LISTINGS.find((x) => x.id === id) ?? null;
}

export function getX402ListingsForCve(cveId: string): SeedX402Listing[] {
    return X402_LISTINGS.filter((x) => x.cveId === cveId);
}

export function getProvidersForPackage(packageName: string): SeedPatchProvider[] {
    const names = PACKAGE_TO_PROVIDERS[packageName] ?? ['npm-registry'];
    return PATCH_PROVIDERS.filter((p) => names.includes(p.name));
}
