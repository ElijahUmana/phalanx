// Canonical seed data for deployment-service. Mirrors the CVE scenario in
// FINAL-CONCEPT.md — production + staging deploys of phalanx-demo/web.
// The `rollout` mutation always returns approvalRequired=true to demonstrate
// Guild's human-in-the-loop approval gate (no scope bypass).

export interface SeedDeployment {
    id: string;
    repoId: string;
    environment: string;
    version: string;
    deployedAt: string;
    deployedBy: string;
    affectedServices: string[];
    status: string;
    sbomId: string | null;
    hypothesisId: string | null;
}

export const DEPLOYMENTS: SeedDeployment[] = [
    {
        id: 'deploy-prod-001',
        repoId: 'phalanx-demo/web',
        environment: 'production',
        version: 'v1.2.3',
        deployedAt: '2026-04-20T14:30:00Z',
        deployedBy: 'guild-rollout-operator',
        affectedServices: ['api', 'web', 'worker'],
        status: 'running',
        sbomId: 'sbom-phalanx-web-v1.2.3',
        hypothesisId: null,
    },
    {
        id: 'deploy-staging-001',
        repoId: 'phalanx-demo/web',
        environment: 'staging',
        version: 'v1.3.0-rc1',
        deployedAt: '2026-04-23T09:15:00Z',
        deployedBy: 'guild-remediator-1',
        affectedServices: ['api', 'web'],
        status: 'running',
        sbomId: null,
        hypothesisId: 'hyp-upgrade-lodash',
    },
    {
        id: 'deploy-prod-002',
        repoId: 'phalanx-demo/web',
        environment: 'production',
        version: 'v1.2.2',
        deployedAt: '2026-04-15T10:00:00Z',
        deployedBy: 'guild-rollout-operator',
        affectedServices: ['api', 'web', 'worker'],
        status: 'superseded',
        sbomId: null,
        hypothesisId: null,
    },
    {
        id: 'deploy-staging-002',
        repoId: 'phalanx-demo/api',
        environment: 'staging',
        version: 'v0.9.1',
        deployedAt: '2026-04-22T16:45:00Z',
        deployedBy: 'guild-remediator-2',
        affectedServices: ['api'],
        status: 'running',
        sbomId: null,
        hypothesisId: 'hyp-chainguard-swap',
    },
];

export function getDeploymentById(id: string): SeedDeployment | null {
    return DEPLOYMENTS.find((d) => d.id === id) ?? null;
}

export function getDeploymentsByRepo(repoId: string): SeedDeployment[] {
    return DEPLOYMENTS.filter((d) => d.repoId === repoId);
}

export function getActiveVersion(service: string, environment: string): string | null {
    const match = DEPLOYMENTS.find(
        (d) =>
            d.environment === environment &&
            d.status === 'running' &&
            d.affectedServices.includes(service),
    );
    return match?.version ?? null;
}

export function nextDeploymentId(environment: string): string {
    const count = DEPLOYMENTS.filter((d) => d.environment === environment).length + 1;
    return `deploy-${environment}-${String(count).padStart(3, '0')}`;
}
