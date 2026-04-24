// Types for the Next.js WunderGraph Cosmo client. Mirrors the shape of the
// 5 persisted operations in cosmo/mcp-gateway/operations/ so the orchestrator
// (and dashboard) can consume the federated result with full type safety.

export type PhalanxRole =
    | 'ANALYST'
    | 'REMEDIATOR'
    | 'ROLLOUT_OPERATOR'
    | 'UNAUTHORIZED';

export interface Dependency {
    id: string;
    name: string;
    version: string;
    ecosystem: string;
    transitive: boolean;
    depth: number;
    risks: CVE[];
}

export interface CVE {
    id: string;
    cvssScore: number;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
    description: string;
    affectedPackages?: string[];
    exploitInWild: boolean;
    nvdUrl?: string | null;
}

export interface BlastRadius {
    cveId: string;
    servicesAffected: number;
    transitiveDepth: number;
    estimatedUsers: number;
    criticalPath: string[];
}

export interface RiskScore {
    cveId: string;
    repoId: string;
    score: number;
    reasoning: string;
    affectedComponentCount: number;
    transitiveImpact: number;
}

export interface RemediationOption {
    id: string;
    strategy:
        | 'UPGRADE'
        | 'PIN'
        | 'CHAINGUARD_SWAP'
        | 'VENDOR_PATCH'
        | 'ROLLBACK';
    targetVersion: string | null;
    targetImage: string | null;
    confidence: number;
    provider: string;
    costUsd: number;
    description: string;
    x402Listing?: X402Listing | null;
}

export interface X402Listing {
    id: string;
    providerUrl: string;
    priceUsd: number;
    acceptedNetworks: string[];
}

export interface Deployment {
    id: string;
    repoId: string;
    environment: string;
    version: string;
    deployedAt: string;
    status: string;
    affectedServices: string[];
    hypothesisId: string | null;
}

export interface DeploymentResult {
    deploymentId: string;
    success: boolean;
    message: string;
    approvalRequired: boolean;
}

export interface StageDeploymentInput {
    repoId: string;
    version: string;
    hypothesisId?: string;
    affectedServices: string[];
}

export interface AnalystImpactResult {
    dependencyTree: Dependency[];
    blastRadius: BlastRadius;
}

export interface AnalystRiskScoreResult {
    cve: CVE | null;
    riskScore: RiskScore | null;
}

export interface RemediatorOptionsResult {
    remediationOptions: RemediationOption[];
    recommendedStrategy: RemediationOption | null;
}

export interface QueryMetadata {
    operation: string;
    requiredScopes: string[];
    role: PhalanxRole;
    agentId: string;
    scopeDenied: boolean;
    deniedScope: string | null;
    errors: unknown[];
    status: number;
}

export interface QueryOutcome<T> {
    data: T | null;
    metadata: QueryMetadata;
}
