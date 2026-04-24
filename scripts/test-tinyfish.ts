// End-to-end smoke test for src/lib/tinyfish/. Runs each flow with REAL
// TinyFish API calls against real URLs. The scanner + enrichment flows run by
// default (cheap — search API only). Browser-agent flows (vendor portal
// inspection and PR creation) are opt-in via `--portal` / `--pr` because they
// each burn 50-100 TinyFish credits per invocation.
//
// Demo target: CVE-2020-8203 (lodash prototype pollution) — picked because it
// has abundant advisory coverage and a real patched version (4.17.21) on npm.
//
// Usage:
//   pnpm test:tinyfish               # scanner + enrichment (cheap)
//   pnpm test:tinyfish --portal      # + live npm page navigation
//   pnpm test:tinyfish --pr          # + open a real GitHub PR on phalanx-demo-target
//   pnpm test:tinyfish --all         # everything
//
// Implementation note: we dynamic-import the TinyFish library inside main()
// because @tiny-fish/sdk is ESM-only and its package.json needed a local patch
// (see package.json `pnpm.patchedDependencies`) to add a `require`/`default`
// export condition. Static top-level imports trip ESM strict linking under
// tsx; dynamic import() defers resolution to runtime where the patched
// conditions apply cleanly.

const SCAN_ID = `tinyfish-smoke-${Date.now()}`;
const CVE_ID = 'CVE-2020-8203';
const PACKAGE_NAME = 'lodash';
const VULNERABLE_VERSION = '4.17.15';

function has(flag: string): boolean {
    return process.argv.includes(flag);
}
const runPortal = has('--portal') || has('--all');
const runPr = has('--pr') || has('--all');

function section(title: string): void {
    console.log(`\n\n=== ${title} ===`);
}

async function main(): Promise<void> {
    const {
        findAndFetchAdvisories,
        enrichCve,
        inspectVendorPortal,
        createPullRequest,
    } = await import('../src/lib/tinyfish/index.js');

    section(`1. Scanner — findAndFetchAdvisories(${CVE_ID}, ${PACKAGE_NAME})`);
    const advisory = await findAndFetchAdvisories(SCAN_ID, CVE_ID, PACKAGE_NAME, {
        maxResults: 3,
    });
    console.log(`   sources: ${advisory.sources.length}`);
    for (const s of advisory.sources) {
        const hasBody = s.bodyMarkdown !== null && s.bodyMarkdown.length > 0;
        console.log(
            `   - ${s.siteName.padEnd(18)} ${hasBody ? '[body]' : '[------]'} ${s.url}`,
        );
    }
    if (advisory.sources.length === 0) {
        throw new Error('Expected at least one advisory source, got zero.');
    }

    section(`2. Enrichment — enrichCve(${CVE_ID})`);
    const enrich = await enrichCve(SCAN_ID, CVE_ID);
    console.log(`   total hits:        ${enrich.hits.length}`);
    console.log(`   vendor advisory:   ${enrich.vendorAdvisoryUrl ?? '<none found>'}`);
    console.log(`   poc count:         ${enrich.pocUrls.length}`);
    console.log(
        `   primary (${enrich.primarySource?.kind ?? 'n/a'} @ ${(enrich.primarySource?.confidence ?? 0).toFixed(2)}): ${enrich.primarySource?.url ?? '<none>'}`,
    );
    if (enrich.hits.length === 0) {
        throw new Error('Expected at least one enrichment hit, got zero.');
    }

    if (runPortal) {
        section(`3. Vendor portal — inspectVendorPortal(npm, ${PACKAGE_NAME}, ${VULNERABLE_VERSION})`);
        console.log('   [this launches a real TinyFish browser agent — live preview URL follows]');
        const portal = await inspectVendorPortal(
            SCAN_ID,
            'npm',
            PACKAGE_NAME,
            VULNERABLE_VERSION,
            CVE_ID,
        );
        console.log(`   packageUrl:       ${portal.packageUrl}`);
        console.log(`   streamingUrl:     ${portal.streamingUrl ?? '<n/a>'}`);
        console.log(`   patchedVersion:   ${portal.patchedVersion ?? '<n/a>'}`);
        console.log(
            `   changelogSummary: ${portal.changelogSummary?.slice(0, 180) ?? '<n/a>'}${(portal.changelogSummary?.length ?? 0) > 180 ? '…' : ''}`,
        );
    } else {
        console.log('\n[skipping vendor portal — pass --portal to enable (~50 TinyFish credits)]');
    }

    if (runPr) {
        section('4. PR creator — createPullRequest on phalanx-demo-target');
        console.log('   [this opens a REAL GitHub PR — branch must already exist on origin]');
        const repoSlug =
            process.env.TINYFISH_PR_REPO ?? 'ElijahUmana/phalanx-demo-target';
        const pr = await createPullRequest(SCAN_ID, {
            repoSlug,
            baseBranch: 'main',
            headBranch: `phalanx-test/${CVE_ID.toLowerCase()}-smoke-${Date.now()}`,
            title: `[demo] TinyFish smoke PR for ${CVE_ID}`,
            body:
                `This is a smoke-test PR opened by \`scripts/test-tinyfish.ts\` to ` +
                `verify the TinyFish PR creator end-to-end. Safe to close.`,
            labels: ['smoke-test', 'automated'],
            reviewers: [],
            commitsSummary:
                'Single no-op commit created by the TinyFish smoke test. No production code is touched.',
        });
        console.log(`   strategy:   ${pr.strategy}`);
        console.log(`   success:    ${pr.success}`);
        console.log(`   prUrl:      ${pr.prUrl ?? '<none>'}`);
        console.log(`   streaming:  ${pr.streamingUrl ?? '<n/a>'}`);
        if (pr.error) console.log(`   error:      ${pr.error}`);
    } else {
        console.log('\n[skipping PR creation — pass --pr to open a real GitHub PR]');
    }

    console.log('\n\n=== TinyFish smoke test OK ===');
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\nTinyFish smoke test FAILED:');
        console.error(err instanceof Error ? err.stack ?? err.message : err);
        process.exit(1);
    });
