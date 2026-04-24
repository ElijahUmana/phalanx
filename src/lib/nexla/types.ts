export type CveFeedSource = 'NVD' | 'GHSA' | 'OSV';

export interface CveFeedRecord {
  cveId: string;
  source: CveFeedSource;
  severity?: string;
  published?: string;
  description?: string;
  affectedPackages?: string[];
}

export interface IngestResult {
  source: CveFeedSource;
  count: number;
  records: CveFeedRecord[];
  durationMs: number;
}

export interface PipelineInfo {
  pipelineId: string;
  sourceUrl: string;
  targetSystem: string;
  createdAt: string;
}

export interface WritebackOptions {
  scanId: string;
  targetSystem: 'Slack' | 'Jira' | 'S3' | 'GitHub' | 'ServiceNow' | 'PagerDuty';
  artifact: string;
  payload: Record<string, unknown>;
}

export interface DiscoveredSource {
  name: string;
  kind: 'SBOM' | 'ArtifactRegistry' | 'CICD' | 'Container' | 'Config';
  url: string;
  estimatedRecords: number;
}
