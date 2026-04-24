// Sigstore attestation verification for Chainguard images. Chainguard publishes
// SLSA L3 provenance attestations for every image; this wrapper calls
// `cosign verify-attestation --type slsaprovenance` and parses the in-toto
// predicate for the dashboard.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { emitEvent } from '@/lib/events/emitter';
import type { AttestationVerification } from './types';

const execFileAsync = promisify(execFile);

const CHAINGUARD_CERT_IDENTITY_REGEX =
    'https://github\\.com/chainguard-images/images(-private)?/\\.github/workflows/release\\.yaml@refs/heads/main';
const CHAINGUARD_CERT_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

/**
 * Verify an in-toto attestation on a Chainguard image.
 *
 * @param scanId orchestrator scan id
 * @param imageRef image reference, e.g. `cgr.dev/chainguard/node:latest`
 * @param attestationType cosign attestation type. Chainguard images ship
 *   SLSA Provenance v1 (https://slsa.dev/provenance/v1) — the cosign shorthand
 *   for that is `slsaprovenance1`, which is the default here. Other supported
 *   shorthands: `slsaprovenance02` (older format), `spdxjson`.
 */
export async function verifyAttestation(
    scanId: string,
    imageRef: string,
    attestationType: string = 'slsaprovenance1',
): Promise<AttestationVerification> {
    try {
        const { stdout } = await execFileAsync(
            'cosign',
            [
                'verify-attestation',
                '--type',
                attestationType,
                '--certificate-identity-regexp',
                CHAINGUARD_CERT_IDENTITY_REGEX,
                '--certificate-oidc-issuer',
                CHAINGUARD_CERT_OIDC_ISSUER,
                imageRef,
            ],
            { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
        );
        // cosign verify-attestation emits one JSON envelope per line.
        const lines = stdout.trim().split('\n').filter(Boolean);
        const predicates: unknown[] = [];
        for (const line of lines) {
            try {
                const envelope = JSON.parse(line) as { payload?: string };
                if (typeof envelope.payload === 'string') {
                    const decoded = Buffer.from(envelope.payload, 'base64').toString('utf8');
                    predicates.push(JSON.parse(decoded));
                }
            } catch {
                // Tolerate non-envelope lines (summary text) silently only here —
                // the OK path still has a verified=true based on cosign exit code.
            }
        }
        const predicate = predicates.length === 1 ? predicates[0] : predicates;
        const result: AttestationVerification = {
            imageRef,
            attestationType,
            verified: true,
            predicate,
            error: null,
        };
        await emitEvent(scanId, {
            type: 'chainguard.attestation.verify',
            source: 'chainguard',
            data: { imageRef, attestationType, verified: true, predicateCount: predicates.length },
        });
        return result;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const result: AttestationVerification = {
            imageRef,
            attestationType,
            verified: false,
            predicate: null,
            error: message,
        };
        await emitEvent(scanId, {
            type: 'chainguard.attestation.verify',
            source: 'chainguard',
            data: { imageRef, attestationType, verified: false, error: message },
        });
        return result;
    }
}
