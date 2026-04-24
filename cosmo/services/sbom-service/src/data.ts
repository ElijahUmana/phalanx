// Canonical seed data for Phalanx Cosmo demo. Mirrors the CVE scenario in
// FINAL-CONCEPT.md — a Node.js app with lodash/axios/express/log4js transitively
// pulling in known-vulnerable versions. Task #3 (Ghost) will back these with real
// npm registry data once the dependency-state DB is live.

export interface SeedDependency {
    id: string;
    name: string;
    version: string;
    ecosystem: string;
    transitive: boolean;
    depth: number;
    license: string | null;
    parentId: string | null;
    sha256: string | null;
}

export interface SeedSBOM {
    id: string;
    repoId: string;
    generatedAt: string;
    signedBy: string | null;
    sigstoreBundleUrl: string | null;
    slsaLevel: number | null;
    componentIds: string[];
}

export const REPOS = {
    PHALANX_DEMO: 'phalanx-demo/web',
    INTERNAL_API: 'phalanx-demo/api',
} as const;

export const DEPENDENCIES: SeedDependency[] = [
    {
        id: 'dep-lodash-4.17.15',
        name: 'lodash',
        version: '4.17.15',
        ecosystem: 'npm',
        transitive: true,
        depth: 2,
        license: 'MIT',
        parentId: 'dep-webpack-5.75.0',
        sha256: 'sha256:4f7e41d6b1cba7b7c6e1a9ef9f2a8b3c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a',
    },
    {
        id: 'dep-axios-0.21.1',
        name: 'axios',
        version: '0.21.1',
        ecosystem: 'npm',
        transitive: false,
        depth: 1,
        license: 'MIT',
        parentId: null,
        sha256: 'sha256:a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
    },
    {
        id: 'dep-express-4.16.0',
        name: 'express',
        version: '4.16.0',
        ecosystem: 'npm',
        transitive: false,
        depth: 1,
        license: 'MIT',
        parentId: null,
        sha256: 'sha256:b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3',
    },
    {
        id: 'dep-log4js-6.1.0',
        name: 'log4js',
        version: '6.1.0',
        ecosystem: 'npm',
        transitive: false,
        depth: 1,
        license: 'Apache-2.0',
        parentId: null,
        sha256: 'sha256:c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4',
    },
    {
        id: 'dep-node-fetch-2.6.1',
        name: 'node-fetch',
        version: '2.6.1',
        ecosystem: 'npm',
        transitive: true,
        depth: 2,
        license: 'MIT',
        parentId: 'dep-axios-0.21.1',
        sha256: 'sha256:d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5',
    },
    {
        id: 'dep-qs-6.5.1',
        name: 'qs',
        version: '6.5.1',
        ecosystem: 'npm',
        transitive: true,
        depth: 2,
        license: 'BSD-3-Clause',
        parentId: 'dep-express-4.16.0',
        sha256: 'sha256:e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
    },
    {
        id: 'dep-webpack-5.75.0',
        name: 'webpack',
        version: '5.75.0',
        ecosystem: 'npm',
        transitive: false,
        depth: 1,
        license: 'MIT',
        parentId: null,
        sha256: 'sha256:f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7',
    },
    {
        id: 'dep-tough-cookie-4.0.0',
        name: 'tough-cookie',
        version: '4.0.0',
        ecosystem: 'npm',
        transitive: true,
        depth: 3,
        license: 'BSD-3-Clause',
        parentId: 'dep-axios-0.21.1',
        sha256: 'sha256:a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8',
    },
];

export const SBOMS: SeedSBOM[] = [
    {
        id: 'sbom-phalanx-web-v1.2.3',
        repoId: REPOS.PHALANX_DEMO,
        generatedAt: '2026-04-20T10:15:33Z',
        signedBy: 'chainguard-ci@chainguard.dev',
        sigstoreBundleUrl: 'https://rekor.sigstore.dev/api/v1/log/entries/fab3c0ff',
        slsaLevel: 3,
        componentIds: [
            'dep-lodash-4.17.15',
            'dep-axios-0.21.1',
            'dep-express-4.16.0',
            'dep-log4js-6.1.0',
            'dep-node-fetch-2.6.1',
            'dep-qs-6.5.1',
            'dep-webpack-5.75.0',
            'dep-tough-cookie-4.0.0',
        ],
    },
];

// CVE → affected dependency IDs, mirrored in risk-service seed.
// Used by sbom-service to resolve `vulnerableDependencies(cveId)`.
export const CVE_TO_DEPS: Record<string, string[]> = {
    'CVE-2020-8203': ['dep-lodash-4.17.15'],
    'CVE-2021-3749': ['dep-axios-0.21.1'],
    'CVE-2022-24999': ['dep-express-4.16.0', 'dep-qs-6.5.1'],
    'CVE-2024-28863': ['dep-express-4.16.0'],
    'CVE-2023-26136': ['dep-tough-cookie-4.0.0'],
};

export function getDependencyById(id: string): SeedDependency | null {
    return DEPENDENCIES.find((d) => d.id === id) ?? null;
}

export function getSbomById(id: string): SeedSBOM | null {
    return SBOMS.find((s) => s.id === id) ?? null;
}

export function getSbomByRepo(repoId: string): SeedSBOM | null {
    return SBOMS.find((s) => s.repoId === repoId) ?? null;
}

export function getDepsForRepo(repoId: string, maxDepth: number | null): SeedDependency[] {
    const sbom = getSbomByRepo(repoId);
    if (!sbom) return [];
    const all = sbom.componentIds
        .map(getDependencyById)
        .filter((d): d is SeedDependency => d !== null);
    if (maxDepth === null) return all;
    return all.filter((d) => d.depth <= maxDepth);
}

export function getDepsForCve(cveId: string): SeedDependency[] {
    const ids = CVE_TO_DEPS[cveId] ?? [];
    return ids
        .map(getDependencyById)
        .filter((d): d is SeedDependency => d !== null);
}
