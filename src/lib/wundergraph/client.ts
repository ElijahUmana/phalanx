// Phalanx WunderGraph Cosmo client.
// Executes persisted GraphQL operations against the local Cosmo Router (:3002).
// Every function takes `scanId: string` as the FIRST argument so the orchestrator
// can stitch WunderGraph events into a scan lifecycle.
//
// Tokens: in local dev / hackathon, we mint against the jwt-mock issuer at
// localhost:4005 using role presets. In production, callers pass their own JWT
// via `withToken()`.
//
// Emits:
//   wundergraph.query         every successful call
//   wundergraph.scope.denied  when the router returns a scope denial

import { emitEvent } from '@/lib/events/emitter';
import type {
    AnalystImpactResult,
    AnalystRiskScoreResult,
    DeploymentResult,
    Deployment,
    QueryOutcome,
    PhalanxRole,
    RemediatorOptionsResult,
    StageDeploymentInput,
} from './types';

const ROUTER_URL = process.env.COSMO_ROUTER_URL ?? 'http://localhost:3002';
const JWT_MOCK_URL = process.env.JWT_MOCK_URL ?? 'http://localhost:4005';

const OPERATIONS = {
    analystImpactQuery: {
        name: 'AnalystImpactQuery',
        text: `query AnalystImpactQuery($repoId: ID!, $cveId: ID!) {
            dependencyTree(repoId: $repoId) {
                id name version ecosystem transitive depth
                risks { id cvssScore severity description exploitInWild }
            }
            blastRadius(cveId: $cveId, repoId: $repoId) {
                cveId servicesAffected transitiveDepth estimatedUsers criticalPath
            }
        }`,
        requiredScopes: ['read:sbom', 'read:risk'],
    },
    analystRiskScore: {
        name: 'AnalystRiskScore',
        text: `query AnalystRiskScore($cveId: ID!, $repoId: ID!) {
            cve(id: $cveId) {
                id cvssScore severity description affectedPackages exploitInWild nvdUrl
            }
            riskScore(cveId: $cveId, repoId: $repoId) {
                cveId repoId score reasoning affectedComponentCount transitiveImpact
            }
        }`,
        requiredScopes: ['read:risk'],
    },
    remediatorOptions: {
        name: 'RemediatorOptions',
        text: `query RemediatorOptions($cveId: ID!) {
            remediationOptions(cveId: $cveId) {
                id strategy targetVersion targetImage confidence provider costUsd description
                x402Listing { id providerUrl priceUsd acceptedNetworks }
            }
            recommendedStrategy(cveId: $cveId) {
                id strategy targetVersion targetImage confidence provider costUsd description
            }
        }`,
        requiredScopes: ['read:marketplace'],
    },
    stageDeployment: {
        name: 'RemediatorStageDeploy',
        text: `mutation RemediatorStageDeploy($input: StageDeploymentInput!) {
            stageDeployment(input: $input) {
                id repoId environment version deployedAt status affectedServices hypothesisId
            }
        }`,
        requiredScopes: ['write:staging'],
    },
    rolloutProductionDeploy: {
        name: 'RolloutProductionDeploy',
        text: `mutation RolloutProductionDeploy($deploymentId: ID!) {
            rollout(deploymentId: $deploymentId) {
                deploymentId success message approvalRequired
            }
        }`,
        requiredScopes: ['write:production'],
    },
} as const;

export class PhalanxSupergraphClient {
    constructor(
        private readonly routerUrl: string = ROUTER_URL,
        private readonly issuerUrl: string = JWT_MOCK_URL,
    ) {}

    async mintToken(role: PhalanxRole, agentId: string): Promise<string> {
        const res = await fetch(`${this.issuerUrl.replace(/\/$/, '')}/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role, agentId }),
        });
        if (!res.ok) {
            const body = await res.text().catch(() => '<unreadable>');
            throw new Error(
                `JWT mock issuer returned ${res.status} ${res.statusText}: ${body}`,
            );
        }
        const data = (await res.json()) as { accessToken: string };
        if (!data.accessToken) {
            throw new Error(`JWT mock issuer response missing accessToken`);
        }
        return data.accessToken;
    }

    async execute<T>(
        scanId: string,
        operation: { name: string; text: string; requiredScopes: readonly string[] },
        variables: Record<string, unknown>,
        token: string,
        role: PhalanxRole,
        agentId: string,
    ): Promise<QueryOutcome<T>> {
        const res = await fetch(`${this.routerUrl.replace(/\/$/, '')}/graphql`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                query: operation.text,
                operationName: operation.name,
                variables,
            }),
        });

        const text = await res.text();
        let body: { data?: T; errors?: unknown[] } = {};
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = {};
        }
        const errors = Array.isArray(body.errors) ? body.errors : [];
        const scopeDenial = detectScopeDenial(errors);

        await emitEvent(scanId, {
            type: 'wundergraph.query',
            source: 'wundergraph',
            data: {
                operation: operation.name,
                scopes: Array.from(operation.requiredScopes),
                role,
                agentId,
                status: res.status,
                durationMs: 0,
                errorCount: errors.length,
            },
        });

        if (scopeDenial.denied) {
            await emitEvent(scanId, {
                type: 'wundergraph.scope.denied',
                source: 'wundergraph',
                data: {
                    operation: operation.name,
                    requiredScope: scopeDenial.deniedScope ?? operation.requiredScopes[0] ?? null,
                    agentId,
                    role,
                    errors,
                },
            });
        }

        return {
            data: (body.data as T | undefined) ?? null,
            metadata: {
                operation: operation.name,
                requiredScopes: Array.from(operation.requiredScopes),
                role,
                agentId,
                scopeDenied: scopeDenial.denied,
                deniedScope: scopeDenial.deniedScope,
                errors,
                status: res.status,
            },
        };
    }

    asAgent(role: PhalanxRole, agentId: string): PhalanxAgentClient {
        return new PhalanxAgentClient(this, role, agentId);
    }
}

/** Convenience wrapper bound to a single agent role — mints a token per call. */
export class PhalanxAgentClient {
    constructor(
        private readonly base: PhalanxSupergraphClient,
        public readonly role: PhalanxRole,
        public readonly agentId: string,
    ) {}

    async analystImpactQuery(
        scanId: string,
        repoId: string,
        cveId: string,
    ): Promise<QueryOutcome<AnalystImpactResult>> {
        const token = await this.base.mintToken(this.role, this.agentId);
        return this.base.execute<AnalystImpactResult>(
            scanId,
            OPERATIONS.analystImpactQuery,
            { repoId, cveId },
            token,
            this.role,
            this.agentId,
        );
    }

    async analystRiskScore(
        scanId: string,
        cveId: string,
        repoId: string,
    ): Promise<QueryOutcome<AnalystRiskScoreResult>> {
        const token = await this.base.mintToken(this.role, this.agentId);
        return this.base.execute<AnalystRiskScoreResult>(
            scanId,
            OPERATIONS.analystRiskScore,
            { cveId, repoId },
            token,
            this.role,
            this.agentId,
        );
    }

    async remediatorOptions(
        scanId: string,
        cveId: string,
    ): Promise<QueryOutcome<RemediatorOptionsResult>> {
        const token = await this.base.mintToken(this.role, this.agentId);
        return this.base.execute<RemediatorOptionsResult>(
            scanId,
            OPERATIONS.remediatorOptions,
            { cveId },
            token,
            this.role,
            this.agentId,
        );
    }

    async stageDeployment(
        scanId: string,
        input: StageDeploymentInput,
    ): Promise<QueryOutcome<{ stageDeployment: Deployment }>> {
        const token = await this.base.mintToken(this.role, this.agentId);
        return this.base.execute<{ stageDeployment: Deployment }>(
            scanId,
            OPERATIONS.stageDeployment,
            { input },
            token,
            this.role,
            this.agentId,
        );
    }

    async rolloutProductionDeploy(
        scanId: string,
        deploymentId: string,
    ): Promise<QueryOutcome<{ rollout: DeploymentResult }>> {
        const token = await this.base.mintToken(this.role, this.agentId);
        return this.base.execute<{ rollout: DeploymentResult }>(
            scanId,
            OPERATIONS.rolloutProductionDeploy,
            { deploymentId },
            token,
            this.role,
            this.agentId,
        );
    }
}

function detectScopeDenial(errors: unknown[]): {
    denied: boolean;
    deniedScope: string | null;
} {
    for (const err of errors) {
        if (!isRecord(err)) continue;
        const code = (err.extensions as Record<string, unknown> | undefined)?.['code'];
        const message = typeof err['message'] === 'string' ? err['message'] : '';
        if (
            code === 'UNAUTHORIZED_FIELD_OR_TYPE' ||
            code === 'UNAUTHENTICATED' ||
            code === 'FORBIDDEN' ||
            /requires scope/i.test(message) ||
            /unauthorized/i.test(message) ||
            /not authenticated/i.test(message)
        ) {
            const scopeMatch = message.match(/(read|write|admin):[a-zA-Z_]+/);
            return { denied: true, deniedScope: scopeMatch?.[0] ?? null };
        }
    }
    return { denied: false, deniedScope: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

let singleton: PhalanxSupergraphClient | null = null;

/** Lazily-initialized shared client. Orchestrator code should use this. */
export function getSupergraphClient(): PhalanxSupergraphClient {
    if (!singleton) singleton = new PhalanxSupergraphClient();
    return singleton;
}
