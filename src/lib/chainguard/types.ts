// Chainguard integration types — shared across dfc / sbom / scanner / attestation.
// Each function takes `scanId: string` as the first argument so the orchestrator
// can trace a conversion through the scan pipeline and the dashboard can render
// panels keyed by scanId.

export interface DFCResult {
    /** Path to the input Dockerfile that was converted. */
    inputPath: string;
    /** The original contents, verbatim. */
    before: string;
    /** The converted contents after DFC rewrite (Chainguard base images). */
    after: string;
    /** Unified diff (before → after) suitable for rendering in a terminal panel. */
    diff: string;
    /** The FROM line's image reference pre-conversion (e.g. `python:3.11`). */
    beforeImage: string;
    /** The FROM line's image reference post-conversion (e.g. `cgr.dev/chainguard/python:latest`). */
    afterImage: string;
    /** Milliseconds elapsed during `dfc` invocation. */
    durationMs: number;
}

export interface SBOMInfo {
    /** The image reference the SBOM describes. */
    imageRef: string;
    /** Digest of the image that produced this SBOM (sha256:…). */
    imageHash: string;
    /** Reference URL of the Sigstore bundle / Rekor log entry, when available. */
    sigstoreUrl: string | null;
    /** SLSA provenance level claimed by the attestation (typically 3 for Chainguard). */
    slsaLevel: number | null;
    /** Raw SBOM payload — usually SPDX or CycloneDX JSON. Kept opaque on purpose. */
    raw: unknown;
    /** Whether the SBOM was fetched live vs. loaded from the offline fixture. */
    source: 'cosign' | 'fixture';
}

export interface SignatureVerification {
    imageRef: string;
    verified: boolean;
    /** Identity of the signer (cert subject), e.g. a GitHub Actions workflow URL. */
    certIdentity: string | null;
    certIssuer: string | null;
    /** Raw JSON payload of the verification bundle for audit purposes. */
    bundle: unknown;
    /** Human-readable error if verification did not succeed. */
    error: string | null;
}

export interface AttestationVerification {
    imageRef: string;
    attestationType: string;
    verified: boolean;
    /** In-toto predicate body (SLSA provenance, VSA, etc.). */
    predicate: unknown;
    error: string | null;
}

export interface MalcontentHit {
    path: string;
    ruleName: string;
    severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFORMATIONAL';
    category: string;
    description: string | null;
}

export interface ScanResult {
    target: string;
    mode: 'malcontent' | 'chainctl-diff' | 'fixture';
    hits: MalcontentHit[];
    riskScore: number;
    summary: string;
    durationMs: number;
}
