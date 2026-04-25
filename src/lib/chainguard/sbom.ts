// SBOM + signature verification wrappers for Chainguard images via cosign.
// cosign authenticates via Sigstore (keyless GitHub OIDC for Chainguard's
// public images). Emits `chainguard.sbom` on successful fetch.
//
// Offline fallback: when cosign isn't installed or the network/Docker daemon
// is unreachable, we fall back to ./fixtures/chainguard-node-sbom.json so the
// demo still has visual material. The fallback is emitted explicitly via
// `source: 'fixture'` — never silently.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { emitEvent } from '@/lib/events/emitter';
import type { SBOMInfo, SignatureVerification } from './types';

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = path.resolve(process.cwd(), 'src/lib/chainguard/fixtures');
const CHAINGUARD_CERT_IDENTITY_REGEX =
    'https://github\\.com/chainguard-images/images(-private)?/\\.github/workflows/release\\.yaml@refs/heads/main';
const CHAINGUARD_CERT_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';

/**
 * Download and parse the SBOM attached to a Chainguard image.
 *
 * @param scanId orchestrator scan id
 * @param imageRef e.g. `cgr.dev/chainguard/node:latest`
 * @param opts.fixtureFallback use cached fixture if cosign errors (default: true)
 */
export async function fetchSBOM(
    scanId: string,
    imageRef: string,
    opts: { fixtureFallback?: boolean } = {},
): Promise<SBOMInfo> {
    const useFallback = opts.fixtureFallback !== false;

    try {
        const { stdout } = await execFileAsync(
            'cosign',
            ['download', 'sbom', imageRef],
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );
        const raw = safeJsonParse(stdout);
        const imageHash = await resolveImageDigest(imageRef);
        const sigstoreUrl = extractSigstoreUrl(raw);
        const slsaLevel = extractSlsaLevel(raw);
        const info: SBOMInfo = {
            imageRef,
            imageHash,
            sigstoreUrl,
            slsaLevel,
            raw,
            source: 'cosign',
        };
        await emitEvent(scanId, {
            type: 'chainguard.sbom',
            source: 'chainguard',
            data: { imageRef, imageHash, sigstoreUrl, slsaLevel, source: 'cosign' },
        });
        return info;
    } catch (err) {
        if (!useFallback) {
            throw err;
        }
        const fallback = await loadSBOMFixture(imageRef);
        await emitEvent(scanId, {
            type: 'chainguard.sbom',
            source: 'chainguard',
            data: {
                imageRef,
                imageHash: fallback.imageHash,
                sigstoreUrl: fallback.sigstoreUrl,
                slsaLevel: fallback.slsaLevel,
                source: 'fixture',
                fallbackReason: err instanceof Error ? err.message : String(err),
            },
        });
        return fallback;
    }
}

/**
 * Verify a Chainguard image's Sigstore keyless signature.
 *
 * Chainguard signs with GitHub Actions OIDC — the cert identity points at the
 * chainguard-images/images release workflow. We pass --certificate-identity-regexp
 * to accept both the public (-private) and main repo signing identities.
 */
export async function verifySignature(
    scanId: string,
    imageRef: string,
): Promise<SignatureVerification> {
    try {
        const { stdout } = await execFileAsync(
            'cosign',
            [
                'verify',
                '--certificate-identity-regexp',
                CHAINGUARD_CERT_IDENTITY_REGEX,
                '--certificate-oidc-issuer',
                CHAINGUARD_CERT_OIDC_ISSUER,
                imageRef,
                '-o',
                'json',
            ],
            { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
        );
        const bundle = safeJsonParse(stdout);
        const entries = Array.isArray(bundle) ? bundle : [];
        const first = entries[0] as Record<string, unknown> | undefined;
        const certIdentity = extractCertField(first, 'certIdentity');
        const certIssuer = extractCertField(first, 'certIssuer');
        const result: SignatureVerification = {
            imageRef,
            verified: entries.length > 0,
            certIdentity,
            certIssuer,
            bundle,
            error: null,
        };
        await emitEvent(scanId, {
            type: 'chainguard.signature.verify',
            source: 'chainguard',
            data: {
                imageRef,
                verified: result.verified,
                certIdentity,
                certIssuer,
            },
        });
        return result;
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const result: SignatureVerification = {
            imageRef,
            verified: false,
            certIdentity: null,
            certIssuer: null,
            bundle: null,
            error: message,
        };
        await emitEvent(scanId, {
            type: 'chainguard.signature.verify',
            source: 'chainguard',
            data: {
                imageRef,
                verified: false,
                error: message,
            },
        });
        return result;
    }
}

async function resolveImageDigest(imageRef: string): Promise<string> {
    // `docker inspect` gives the pinned digest post-pull. If Docker isn't running,
    // fall back to parsing sha256 from the imageRef itself, then fallback to
    // a derived pseudo-hash so the event still carries a traceable identifier.
    if (imageRef.includes('@sha256:')) {
        return imageRef.split('@')[1];
    }
    try {
        const { stdout } = await execFileAsync(
            'docker',
            ['inspect', '--format', '{{index .RepoDigests 0}}', imageRef],
            { encoding: 'utf8' },
        );
        const trimmed = stdout.trim();
        const at = trimmed.indexOf('@sha256:');
        if (at >= 0) return trimmed.slice(at + 1);
    } catch {
        // swallow — fall through
    }
    return `unknown:${imageRef}`;
}

async function loadSBOMFixture(imageRef: string): Promise<SBOMInfo> {
    const fixture = 'chainguard-node-sbom.json';
    const fixturePath = path.join(FIXTURES_DIR, fixture);
    const raw = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
    return {
        imageRef,
        imageHash: 'sha256:9e33f02ba42ad1da39f4b6f1b24fe3755127bcdd1b9721dc871863e03cef3c42',
        sigstoreUrl: 'https://rekor.sigstore.dev/api/v1/log/entries/fixture-cached',
        slsaLevel: 3,
        raw,
        source: 'fixture',
    };
}

function safeJsonParse(input: string): unknown {
    const text = input.trim();
    if (!text) return {};
    try {
        return JSON.parse(text);
    } catch {
        // cosign sometimes emits multiple concatenated JSON objects; return as array.
        const objects: unknown[] = [];
        let depth = 0;
        let start = -1;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === '{') {
                if (depth === 0) start = i;
                depth++;
            } else if (ch === '}') {
                depth--;
                if (depth === 0 && start >= 0) {
                    try {
                        objects.push(JSON.parse(text.slice(start, i + 1)));
                    } catch {
                        // ignore malformed chunk
                    }
                    start = -1;
                }
            }
        }
        return objects.length === 1 ? objects[0] : objects;
    }
}

function extractSigstoreUrl(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const anno = rec['annotations'] as Record<string, unknown> | undefined;
    if (anno && typeof anno['dev.sigstore.cosign/bundle'] === 'string') {
        return anno['dev.sigstore.cosign/bundle'] as string;
    }
    return null;
}

function extractSlsaLevel(raw: unknown): number | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const meta = rec['metadata'] as Record<string, unknown> | undefined;
    const level = meta?.['slsa_level'];
    return typeof level === 'number' ? level : null;
}

function extractCertField(
    entry: Record<string, unknown> | undefined,
    field: 'certIdentity' | 'certIssuer',
): string | null {
    if (!entry) return null;
    const optional = entry['optional'] as Record<string, unknown> | undefined;
    const cosign = optional ?? entry;
    const value =
        field === 'certIdentity'
            ? cosign['subject'] ?? cosign['Subject']
            : cosign['issuer'] ?? cosign['Issuer'];
    return typeof value === 'string' ? value : null;
}
