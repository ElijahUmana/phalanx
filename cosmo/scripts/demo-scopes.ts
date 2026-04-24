// Demo script — proves @requiresScopes enforcement end-to-end.
//
// Run order: jwt-mock → 4 subgraph services → Cosmo Router → this script.
// Expected outcome:
//   ANALYST         → AnalystImpactQuery succeeds          ✓
//   ANALYST         → RolloutProductionDeploy 403 denied   ✓  (@requiresScopes(write:production))
//   REMEDIATOR      → RemediatorStageDeploy succeeds       ✓
//   REMEDIATOR      → RolloutProductionDeploy 403 denied   ✓
//   ROLLOUT_OP      → RolloutProductionDeploy succeeds     ✓  (approvalRequired: true)
//   UNAUTHORIZED    → any query 401 denied                 ✓
//
// Exit 0 iff every expectation holds. Non-zero on any drift so CI can alert.

import { PhalanxGateway } from '../mcp-gateway/src/gateway';
import type { PhalanxRole } from '../mcp-gateway/src/jwt-client';

const ROUTER_URL = process.env.COSMO_ROUTER_URL ?? 'http://localhost:3002';
const JWT_ISSUER_URL = process.env.JWT_MOCK_URL ?? 'http://localhost:4005';

interface Expectation {
    label: string;
    tool: string;
    role: PhalanxRole;
    args: Record<string, unknown>;
    expect: 'allow' | 'deny';
}

const EXPECTATIONS: Expectation[] = [
    {
        label: 'Analyst — impact query',
        tool: 'phalanx_analyst_impact_query',
        role: 'ANALYST',
        args: { repoId: 'phalanx-demo/web', cveId: 'CVE-2020-8203' },
        expect: 'allow',
    },
    {
        label: 'Analyst — risk score',
        tool: 'phalanx_analyst_risk_score',
        role: 'ANALYST',
        args: { cveId: 'CVE-2020-8203', repoId: 'phalanx-demo/web' },
        expect: 'allow',
    },
    {
        label: 'Analyst — TRY remediator options (needs read:marketplace; Analyst has it)',
        tool: 'phalanx_remediator_options',
        role: 'ANALYST',
        args: { cveId: 'CVE-2020-8203' },
        expect: 'allow',
    },
    {
        label: 'Analyst — TRY stage deploy (needs write:staging; Analyst lacks it)',
        tool: 'phalanx_remediator_stage_deploy',
        role: 'ANALYST',
        args: {
            input: {
                repoId: 'phalanx-demo/web',
                version: 'v1.3.0-rc2',
                hypothesisId: 'hyp-chainguard-swap',
                affectedServices: ['api', 'web'],
            },
        },
        expect: 'deny',
    },
    {
        label: 'Analyst — TRY production rollout (needs write:production; Analyst lacks it)',
        tool: 'phalanx_rollout_production_deploy',
        role: 'ANALYST',
        args: { deploymentId: 'deploy-prod-001' },
        expect: 'deny',
    },
    {
        label: 'Remediator — stage deploy (has write:staging)',
        tool: 'phalanx_remediator_stage_deploy',
        role: 'REMEDIATOR',
        args: {
            input: {
                repoId: 'phalanx-demo/web',
                version: 'v1.3.0-rc2',
                hypothesisId: 'hyp-chainguard-swap',
                affectedServices: ['api', 'web'],
            },
        },
        expect: 'allow',
    },
    {
        label: 'Remediator — TRY prod rollout (lacks write:production)',
        tool: 'phalanx_rollout_production_deploy',
        role: 'REMEDIATOR',
        args: { deploymentId: 'deploy-prod-001' },
        expect: 'deny',
    },
    {
        label: 'Rollout Operator — production rollout succeeds (approval gate still applies)',
        tool: 'phalanx_rollout_production_deploy',
        role: 'ROLLOUT_OPERATOR',
        args: { deploymentId: 'deploy-prod-001' },
        expect: 'allow',
    },
    {
        label: 'Unauthorized — impact query rejected before subgraph',
        tool: 'phalanx_analyst_impact_query',
        role: 'UNAUTHORIZED',
        args: { repoId: 'phalanx-demo/web', cveId: 'CVE-2020-8203' },
        expect: 'deny',
    },
];

async function runOne(
    gateway: PhalanxGateway,
    e: Expectation,
): Promise<{ pass: boolean; detail: string }> {
    const res = await gateway.invoke({
        toolName: e.tool,
        args: { ...e.args, _roleOverride: e.role, _agentId: `demo-${e.role.toLowerCase()}` },
    });
    const actuallyAllowed = res.ok;
    const expectedAllow = e.expect === 'allow';
    const pass = actuallyAllowed === expectedAllow;
    const detail = pass
        ? `status=${res.status} scopeDenied=${res.scopeDenied}`
        : `MISMATCH — expected ${e.expect}, got ${actuallyAllowed ? 'allow' : 'deny'} ` +
          `(status=${res.status}, errors=${JSON.stringify(res.errors).slice(0, 200)})`;
    return { pass, detail };
}

async function main(): Promise<void> {
    const gateway = new PhalanxGateway({
        routerUrl: ROUTER_URL,
        issuerUrl: JWT_ISSUER_URL,
    });

    console.log(`\n== Phalanx @requiresScopes demo ==`);
    console.log(`   router: ${ROUTER_URL}`);
    console.log(`   issuer: ${JWT_ISSUER_URL}\n`);

    let passed = 0;
    let failed = 0;
    for (const e of EXPECTATIONS) {
        try {
            const { pass, detail } = await runOne(gateway, e);
            const mark = pass ? '✓' : '✗';
            console.log(`${mark} [${e.role}] ${e.label}`);
            console.log(`    ${detail}`);
            if (pass) passed++;
            else failed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.log(`✗ [${e.role}] ${e.label}`);
            console.log(`    THREW: ${message}`);
            failed++;
        }
    }

    console.log(`\n== result: ${passed} passed, ${failed} failed ==\n`);
    if (failed > 0) process.exit(1);
}

main().catch((err) => {
    console.error('fatal:', err);
    process.exit(1);
});
