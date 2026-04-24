// WunderGraph Cosmo supergraph + MCP Gateway client — Task #2
//
// Federated supergraph over SBOM + Deployment + Risk + Marketplace subgraphs,
// with per-tool OAuth scopes enforced at the router via @requiresScopes.
// Analyst agents get read:sbom + read:deployment + read:risk + read:marketplace.
// Remediator agents additionally get write:staging. Rollout Operator additionally
// gets write:production (human-gated by Guild at runtime).
//
// Every exported function takes `scanId: string` as the FIRST argument.
// Emits `wundergraph.query` and `wundergraph.scope.denied` events.

export {
    PhalanxSupergraphClient,
    PhalanxAgentClient,
    getSupergraphClient,
} from './client';

export type {
    PhalanxRole,
    Dependency,
    CVE,
    BlastRadius,
    RiskScore,
    RemediationOption,
    X402Listing,
    Deployment,
    DeploymentResult,
    StageDeploymentInput,
    AnalystImpactResult,
    AnalystRiskScoreResult,
    RemediatorOptionsResult,
    QueryMetadata,
    QueryOutcome,
} from './types';
