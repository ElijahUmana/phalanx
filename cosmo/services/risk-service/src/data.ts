// Canonical seed data for risk-service. CVEs matching the FINAL-CONCEPT scenario.
// These are real CVE IDs with real CVSS scores for known-vulnerable npm packages.

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';

export interface SeedCVE {
    id: string;
    cvssScore: number;
    severity: Severity;
    publishedAt: string;
    description: string;
    affectedPackages: string[];
    exploitInWild: boolean;
    nvdUrl: string;
}

export const CVES: SeedCVE[] = [
    {
        id: 'CVE-2020-8203',
        cvssScore: 7.4,
        severity: 'HIGH',
        publishedAt: '2020-07-15T17:15:00Z',
        description:
            'Prototype pollution in lodash <4.17.19 allows attackers to inject properties via _.zipObjectDeep.',
        affectedPackages: ['lodash@<4.17.19'],
        exploitInWild: true,
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2020-8203',
    },
    {
        id: 'CVE-2021-3749',
        cvssScore: 7.5,
        severity: 'HIGH',
        publishedAt: '2021-08-31T20:15:00Z',
        description:
            'axios is vulnerable to Inefficient Regular Expression Complexity (ReDoS) via the "trim" function.',
        affectedPackages: ['axios@<0.21.2'],
        exploitInWild: false,
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2021-3749',
    },
    {
        id: 'CVE-2022-24999',
        cvssScore: 7.5,
        severity: 'HIGH',
        publishedAt: '2022-11-26T22:15:00Z',
        description:
            'express.js qs sub-package allows prototype object pollution, which can lead to DoS via crafted input.',
        affectedPackages: ['express@<4.17.3', 'qs@<6.10.3'],
        exploitInWild: true,
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2022-24999',
    },
    {
        id: 'CVE-2024-28863',
        cvssScore: 7.5,
        severity: 'HIGH',
        publishedAt: '2024-03-19T01:15:00Z',
        description:
            'body-parser and express prior to 4.19.2 are vulnerable to resource exhaustion via crafted requests.',
        affectedPackages: ['express@<4.19.2'],
        exploitInWild: false,
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2024-28863',
    },
    {
        id: 'CVE-2023-26136',
        cvssScore: 6.5,
        severity: 'MEDIUM',
        publishedAt: '2023-07-01T19:15:00Z',
        description:
            'tough-cookie <4.1.3 is vulnerable to prototype pollution in the CookieJar class.',
        affectedPackages: ['tough-cookie@<4.1.3'],
        exploitInWild: false,
        nvdUrl: 'https://nvd.nist.gov/vuln/detail/CVE-2023-26136',
    },
];

// Dependency ID → CVE IDs. Kept in sync with sbom-service CVE_TO_DEPS.
export const DEP_TO_CVES: Record<string, string[]> = {
    'dep-lodash-4.17.15': ['CVE-2020-8203'],
    'dep-axios-0.21.1': ['CVE-2021-3749'],
    'dep-express-4.16.0': ['CVE-2022-24999', 'CVE-2024-28863'],
    'dep-qs-6.5.1': ['CVE-2022-24999'],
    'dep-tough-cookie-4.0.0': ['CVE-2023-26136'],
};

export interface SeedRiskScore {
    cveId: string;
    repoId: string;
    score: number;
    reasoning: string;
    affectedComponentCount: number;
    transitiveImpact: number;
}

export const RISK_SCORES: SeedRiskScore[] = [
    {
        cveId: 'CVE-2020-8203',
        repoId: 'phalanx-demo/web',
        score: 8.2,
        reasoning:
            'lodash reachable on the authentication path (user/session deserialization). Prototype pollution in hot code bypasses auth checks.',
        affectedComponentCount: 12,
        transitiveImpact: 47,
    },
    {
        cveId: 'CVE-2021-3749',
        repoId: 'phalanx-demo/web',
        score: 6.5,
        reasoning:
            'axios used for outbound webhook calls only. ReDoS surface limited to admin-triggered paths. Medium risk.',
        affectedComponentCount: 3,
        transitiveImpact: 9,
    },
    {
        cveId: 'CVE-2022-24999',
        repoId: 'phalanx-demo/web',
        score: 8.8,
        reasoning:
            'express + qs on every request path. Any request with crafted querystring crashes the process. Direct internet exposure.',
        affectedComponentCount: 8,
        transitiveImpact: 28,
    },
];

export interface SeedBlastRadius {
    cveId: string;
    repoId: string;
    servicesAffected: number;
    transitiveDepth: number;
    estimatedUsers: number;
    criticalPath: string[];
}

export const BLAST_RADII: SeedBlastRadius[] = [
    {
        cveId: 'CVE-2020-8203',
        repoId: 'phalanx-demo/web',
        servicesAffected: 4,
        transitiveDepth: 2,
        estimatedUsers: 52000,
        criticalPath: ['auth-service', 'api-gateway', 'session-store', 'web-frontend'],
    },
    {
        cveId: 'CVE-2021-3749',
        repoId: 'phalanx-demo/web',
        servicesAffected: 2,
        transitiveDepth: 1,
        estimatedUsers: 18000,
        criticalPath: ['outbound-webhook', 'admin-api'],
    },
    {
        cveId: 'CVE-2022-24999',
        repoId: 'phalanx-demo/web',
        servicesAffected: 6,
        transitiveDepth: 1,
        estimatedUsers: 52000,
        criticalPath: ['api-gateway', 'web-frontend', 'admin-api'],
    },
];

export function getCveById(id: string): SeedCVE | null {
    return CVES.find((c) => c.id === id) ?? null;
}

export function getCvesBySeverity(minScore: number): SeedCVE[] {
    return CVES.filter((c) => c.cvssScore >= minScore).sort(
        (a, b) => b.cvssScore - a.cvssScore,
    );
}

export function getCvesForDependency(dependencyId: string): SeedCVE[] {
    const cveIds = DEP_TO_CVES[dependencyId] ?? [];
    return cveIds.map(getCveById).filter((c): c is SeedCVE => c !== null);
}

export function getRiskScore(cveId: string, repoId: string): SeedRiskScore | null {
    return RISK_SCORES.find((r) => r.cveId === cveId && r.repoId === repoId) ?? null;
}

export function getBlastRadius(cveId: string, repoId: string): SeedBlastRadius | null {
    return BLAST_RADII.find((b) => b.cveId === cveId && b.repoId === repoId) ?? null;
}
