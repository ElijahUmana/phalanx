// End-to-end smoke test for src/lib/wundergraph/. Runs each of the 5 persisted
// operations against the live Cosmo Router and asserts that per-agent scope
// enforcement matches expectations. Requires the router + subgraphs + jwt-mock
// all running (see cosmo/scripts/start-all.sh).

import { getSupergraphClient } from '@/lib/wundergraph';

const SCAN_ID = `wg-smoke-${Date.now()}`;

interface Check {
    label: string;
    run: () => Promise<{ ok: boolean; scopeDenied: boolean; status: number }>;
    expect: 'allow' | 'deny';
}

async function main(): Promise<void> {
    const base = getSupergraphClient();
    const analyst = base.asAgent('ANALYST', 'demo-analyst-1');
    const remediator = base.asAgent('REMEDIATOR', 'demo-remediator-1');
    const rollout = base.asAgent('ROLLOUT_OPERATOR', 'demo-rollout-1');
    const unauth = base.asAgent('UNAUTHORIZED', 'demo-unauth');

    const checks: Check[] = [
        {
            label: 'Analyst: impact query',
            expect: 'allow',
            run: async () => {
                const out = await analyst.analystImpactQuery(
                    SCAN_ID,
                    'phalanx-demo/web',
                    'CVE-2020-8203',
                );
                return {
                    ok: out.data !== null && out.metadata.errors.length === 0,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Analyst: risk score',
            expect: 'allow',
            run: async () => {
                const out = await analyst.analystRiskScore(
                    SCAN_ID,
                    'CVE-2020-8203',
                    'phalanx-demo/web',
                );
                return {
                    ok: out.data !== null && out.metadata.errors.length === 0,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Analyst: stage deploy (must be denied)',
            expect: 'deny',
            run: async () => {
                const out = await analyst.stageDeployment(SCAN_ID, {
                    repoId: 'phalanx-demo/web',
                    version: 'v1.3.0-rc2',
                    hypothesisId: 'hyp-chainguard-swap',
                    affectedServices: ['api', 'web'],
                });
                return {
                    ok: out.metadata.scopeDenied,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Remediator: stage deploy (allow)',
            expect: 'allow',
            run: async () => {
                const out = await remediator.stageDeployment(SCAN_ID, {
                    repoId: 'phalanx-demo/web',
                    version: 'v1.3.0-rc3',
                    hypothesisId: 'hyp-upgrade-lodash',
                    affectedServices: ['api'],
                });
                return {
                    ok: out.data !== null && out.metadata.errors.length === 0,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Remediator: prod rollout (must be denied)',
            expect: 'deny',
            run: async () => {
                const out = await remediator.rolloutProductionDeploy(
                    SCAN_ID,
                    'deploy-prod-001',
                );
                return {
                    ok: out.metadata.scopeDenied,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Rollout Operator: prod rollout (allow)',
            expect: 'allow',
            run: async () => {
                const out = await rollout.rolloutProductionDeploy(SCAN_ID, 'deploy-prod-001');
                return {
                    ok: out.data !== null && out.metadata.errors.length === 0,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
        {
            label: 'Unauthorized: impact query (must be denied)',
            expect: 'deny',
            run: async () => {
                const out = await unauth.analystImpactQuery(
                    SCAN_ID,
                    'phalanx-demo/web',
                    'CVE-2020-8203',
                );
                return {
                    ok: out.metadata.scopeDenied,
                    scopeDenied: out.metadata.scopeDenied,
                    status: out.metadata.status,
                };
            },
        },
    ];

    let passed = 0;
    let failed = 0;

    console.log(`== Phalanx WunderGraph client smoke test ==\n   scanId=${SCAN_ID}\n`);

    for (const c of checks) {
        try {
            const r = await c.run();
            const pass = c.expect === 'allow' ? !r.scopeDenied && r.ok : r.scopeDenied;
            const mark = pass ? '✓' : '✗';
            console.log(
                `${mark} ${c.label} — expect=${c.expect} status=${r.status} scopeDenied=${r.scopeDenied}`,
            );
            if (pass) passed++;
            else failed++;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.log(`✗ ${c.label} — THREW: ${message}`);
            failed++;
        }
    }

    console.log(`\n== ${passed} passed, ${failed} failed ==`);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('fatal:', err);
    process.exit(1);
});
