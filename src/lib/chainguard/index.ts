// Chainguard integration — Task #9
//
// Triple role mirrors FINAL-CONCEPT.md:
//   1. Remediation target: zero-CVE image swap via DFC (`dfc.ts`)
//   2. Agent runtime: SLSA L3 attested, Sigstore-verified (`attestation.ts`, `sbom.ts`)
//   3. Hardened skill catalog: malcontent IoC scanning of candidate packages (`scanner.ts`)
//
// Every exported function takes `scanId: string` as the FIRST argument so the
// orchestrator can stitch Chainguard events into a scan's lifecycle and the
// dashboard can render per-scan panels. Events are emitted via emitEvent():
//   - chainguard.dfc.convert
//   - chainguard.sbom
//   - chainguard.signature.verify
//   - chainguard.attestation.verify
//   - chainguard.scan

export {
    convertDockerfile,
    convertDockerfileInPlace,
} from './dfc';

export { fetchSBOM, verifySignature } from './sbom';

export { verifyAttestation } from './attestation';

export { scanPackages } from './scanner';

export type {
    DFCResult,
    SBOMInfo,
    SignatureVerification,
    AttestationVerification,
    MalcontentHit,
    ScanResult,
} from './types';
