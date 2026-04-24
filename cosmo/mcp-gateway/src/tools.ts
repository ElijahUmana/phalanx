// Tool registry for the Phalanx MCP Gateway.
//
// Each tool maps to exactly one persisted GraphQL operation in ./operations/
// and declares the OAuth scopes required to execute it. The scopes are
// enforced by the Cosmo Router at query-plan time via @requiresScopes. The
// gateway uses `defaultRole` to pick the mocked JWT for the call, but callers
// can pass _roleOverride to demonstrate scope failures (e.g. an Analyst trying
// to call rollout_production_deploy, which requires write:production).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { z } from 'zod';
import type { PhalanxRole } from './jwt-client';

const OPS_DIR = path.resolve(__dirname, '..', 'operations');

function loadOp(fileName: string): string {
    const fullPath = path.join(OPS_DIR, fileName);
    return fs.readFileSync(fullPath, 'utf8');
}

export interface PhalanxTool {
    name: string;
    description: string;
    operationFile: string;
    operationText: string;
    operationName: string;
    requiredScopes: string[];
    defaultRole: PhalanxRole;
    inputSchema: z.ZodType;
    // Variables JSON schema the LLM sees via MCP. We keep this explicit so
    // agents can't try to reshape the query (persisted operation = fixed).
    variableKeys: readonly string[];
}

const StageDeploymentInput = z.object({
    repoId: z.string(),
    version: z.string(),
    hypothesisId: z.string().optional(),
    affectedServices: z.array(z.string()),
});

export const TOOLS: PhalanxTool[] = [
    {
        name: 'phalanx_analyst_impact_query',
        description:
            'Fetch the full dependency tree for a repo with CVE risks merged from risk-service, plus blast radius. Requires read:sbom + read:risk.',
        operationFile: 'analyst_impact.graphql',
        operationText: loadOp('analyst_impact.graphql'),
        operationName: 'AnalystImpactQuery',
        requiredScopes: ['read:sbom', 'read:risk'],
        defaultRole: 'ANALYST',
        inputSchema: z.object({
            repoId: z.string().describe('Repository identifier, e.g. phalanx-demo/web'),
            cveId: z.string().describe('CVE identifier, e.g. CVE-2020-8203'),
            _roleOverride: z
                .enum(['ANALYST', 'REMEDIATOR', 'ROLLOUT_OPERATOR', 'UNAUTHORIZED'])
                .optional()
                .describe('Override the default role to demonstrate scope enforcement'),
            _agentId: z.string().optional(),
        }),
        variableKeys: ['repoId', 'cveId'] as const,
    },
    {
        name: 'phalanx_analyst_risk_score',
        description:
            'Fetch CVE details + risk score for a specific repo (CVSS + reasoning + component count). Requires read:risk.',
        operationFile: 'analyst_risk_score.graphql',
        operationText: loadOp('analyst_risk_score.graphql'),
        operationName: 'AnalystRiskScore',
        requiredScopes: ['read:risk'],
        defaultRole: 'ANALYST',
        inputSchema: z.object({
            cveId: z.string(),
            repoId: z.string(),
            _roleOverride: z
                .enum(['ANALYST', 'REMEDIATOR', 'ROLLOUT_OPERATOR', 'UNAUTHORIZED'])
                .optional(),
            _agentId: z.string().optional(),
        }),
        variableKeys: ['cveId', 'repoId'] as const,
    },
    {
        name: 'phalanx_remediator_options',
        description:
            'Fetch remediation options for a CVE (upgrade, Chainguard swap, vendor patch) plus recommended strategy. Requires read:marketplace.',
        operationFile: 'remediator_options.graphql',
        operationText: loadOp('remediator_options.graphql'),
        operationName: 'RemediatorOptions',
        requiredScopes: ['read:marketplace'],
        defaultRole: 'REMEDIATOR',
        inputSchema: z.object({
            cveId: z.string(),
            _roleOverride: z
                .enum(['ANALYST', 'REMEDIATOR', 'ROLLOUT_OPERATOR', 'UNAUTHORIZED'])
                .optional(),
            _agentId: z.string().optional(),
        }),
        variableKeys: ['cveId'] as const,
    },
    {
        name: 'phalanx_remediator_stage_deploy',
        description:
            'Stage a remediation deployment to the staging environment. Requires write:staging. Cannot reach production.',
        operationFile: 'remediator_stage_deploy.graphql',
        operationText: loadOp('remediator_stage_deploy.graphql'),
        operationName: 'RemediatorStageDeploy',
        requiredScopes: ['write:staging'],
        defaultRole: 'REMEDIATOR',
        inputSchema: z.object({
            input: StageDeploymentInput,
            _roleOverride: z
                .enum(['ANALYST', 'REMEDIATOR', 'ROLLOUT_OPERATOR', 'UNAUTHORIZED'])
                .optional(),
            _agentId: z.string().optional(),
        }),
        variableKeys: ['input'] as const,
    },
    {
        name: 'phalanx_rollout_production_deploy',
        description:
            'Rollout a deployment to production. Requires write:production. Gated by Guild human approval at runtime.',
        operationFile: 'rollout_production_deploy.graphql',
        operationText: loadOp('rollout_production_deploy.graphql'),
        operationName: 'RolloutProductionDeploy',
        requiredScopes: ['write:production'],
        defaultRole: 'ROLLOUT_OPERATOR',
        inputSchema: z.object({
            deploymentId: z.string(),
            _roleOverride: z
                .enum(['ANALYST', 'REMEDIATOR', 'ROLLOUT_OPERATOR', 'UNAUTHORIZED'])
                .optional(),
            _agentId: z.string().optional(),
        }),
        variableKeys: ['deploymentId'] as const,
    },
];

export function getToolByName(name: string): PhalanxTool | null {
    return TOOLS.find((t) => t.name === name) ?? null;
}
