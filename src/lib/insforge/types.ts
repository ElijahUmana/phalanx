export interface StagingBackend {
  backendId: string;
  scanId: string;
  forkId: string;
  hypothesisName: string;
  url: string;
  provisionedAt: string;
  status: 'provisioning' | 'ready' | 'validating' | 'validated' | 'failed' | 'cleaned';
  score?: number;
  testsPassed?: number;
  testsTotal?: number;
}

export interface ValidationResult {
  backendId: string;
  score: number;
  testsPassed: number;
  testsTotal: number;
  durationMs: number;
}

export interface InsForgeProjectConfig {
  projectId: string;
  appKey: string;
  region: string;
  ossHost: string;
  apiKey: string;
}
