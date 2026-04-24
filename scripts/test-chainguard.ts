// End-to-end smoke test for src/lib/chainguard/.
// Runs: DFC conversion, SBOM fetch (or fixture fallback), signature verify, scan.
// Exits non-zero on any failure per the CLAUDE.md "zero silent error swallowing" rule.

import * as path from 'node:path';
import {
    convertDockerfile,
    fetchSBOM,
    verifySignature,
    verifyAttestation,
    scanPackages,
} from '@/lib/chainguard';

const SCAN_ID = `smoke-${Date.now()}`;
const IMAGE_REF = 'cgr.dev/chainguard/node:latest';
const DEMO_DOCKERFILE = path.resolve(
    __dirname,
    '..',
    'src',
    'lib',
    'chainguard',
    'demo',
    'vulnerable.Dockerfile',
);

function heading(title: string): void {
    console.log(`\n\n=== ${title} ===`);
}

async function main(): Promise<void> {
    heading('1. DFC — convert vulnerable.Dockerfile');
    const dfc = await convertDockerfile(SCAN_ID, DEMO_DOCKERFILE, { org: 'chainguard' });
    console.log(`   before image: ${dfc.beforeImage}`);
    console.log(`   after image:  ${dfc.afterImage}`);
    console.log(`   duration:     ${dfc.durationMs}ms`);
    console.log('   --- diff ---');
    console.log(
        dfc.diff
            .split('\n')
            .map((l) => `   ${l}`)
            .join('\n'),
    );
    if (!dfc.afterImage.startsWith('cgr.dev/chainguard/')) {
        throw new Error(
            `DFC did not produce a Chainguard base image; got "${dfc.afterImage}"`,
        );
    }

    heading(`2. SBOM — fetch for ${IMAGE_REF}`);
    const sbom = await fetchSBOM(SCAN_ID, IMAGE_REF);
    console.log(`   source:      ${sbom.source}`);
    console.log(`   image hash:  ${sbom.imageHash}`);
    console.log(`   sigstoreUrl: ${sbom.sigstoreUrl ?? '<none>'}`);
    console.log(`   slsaLevel:   ${sbom.slsaLevel ?? '<unknown>'}`);

    heading(`3. Signature — verify ${IMAGE_REF}`);
    const sig = await verifySignature(SCAN_ID, IMAGE_REF);
    console.log(`   verified:      ${sig.verified}`);
    console.log(`   certIdentity:  ${sig.certIdentity ?? '<n/a>'}`);
    console.log(`   certIssuer:    ${sig.certIssuer ?? '<n/a>'}`);
    if (sig.error) console.log(`   error:         ${sig.error}`);

    heading(`4. Attestation — SLSA provenance v1 for ${IMAGE_REF}`);
    const att = await verifyAttestation(SCAN_ID, IMAGE_REF, 'slsaprovenance1');
    console.log(`   verified:      ${att.verified}`);
    if (att.error) console.log(`   error:         ${att.error}`);

    heading('5. Scan — malcontent on src/lib/chainguard');
    const scan = await scanPackages(SCAN_ID, path.resolve(__dirname, '..', 'src', 'lib', 'chainguard'));
    console.log(`   mode:       ${scan.mode}`);
    console.log(`   hits:       ${scan.hits.length}`);
    console.log(`   riskScore:  ${scan.riskScore}`);
    console.log(`   summary:    ${scan.summary}`);

    console.log('\n\n=== Chainguard smoke test OK ===');
}

main()
    .then(() => {
        // Redis publisher held by emitEvent stays open. Explicitly exit so the
        // script terminates quickly instead of waiting for timeouts.
        process.exit(0);
    })
    .catch((err) => {
        console.error('\nChainguard smoke test FAILED:');
        console.error(err instanceof Error ? err.stack ?? err.message : err);
        process.exit(1);
    });
