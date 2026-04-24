// InsForge per-hypothesis staging backends — Task #6
// Each remediation hypothesis gets an isolated row in staging_backends with
// a unique public URL, validated with a real SDK round-trip, cleaned up
// after the scan completes.

export * from './types';
export * from './client';
export { provisionBackend, getBackend, getBackendsForScan } from './provisioner';
export { validateBackend } from './validator';
export { cleanupBackend } from './cleanup';
