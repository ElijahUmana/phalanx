export interface Dependency {
  id: number;
  packageName: string;
  version: string;
  registry: string;
  license: string | null;
  transitiveDeps: string[];
  depPath: string | null;
  introducedAt: string;
}

export interface Service {
  id: number;
  name: string;
  repoUrl: string;
  description: string | null;
  dependencyIds: number[];
  createdAt: string;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'informational';
export type CveStatus = 'open' | 'investigating' | 'remediated' | 'false_positive';

export interface AffectedPackage {
  name: string;
  versionRange: string;
}

export interface PatchVersion {
  name: string;
  fixedIn: string;
}

export interface CveRecord {
  cveId: string;
  severity: Severity;
  cvssScore: number | null;
  affectedPackages: AffectedPackage[];
  patchVersions: PatchVersion[];
  discoverySource: string;
  description: string;
  publishedAt: string;
  status: CveStatus;
}

export interface CveSimilarity {
  cve: CveRecord;
  similarity: number;
}

export type PatchOutcome = 'success' | 'false_positive' | 'regression' | 'partial' | 'cancelled';

export interface PatchResultInput {
  cveId: string;
  hypothesis: string;
  forkId: string;
  outcome: PatchOutcome;
  details: Record<string, unknown>;
}

export interface RemediationMemory {
  id?: number;
  cveId: string;
  hypothesis: string;
  outcome: 'success' | 'false_positive' | 'regression' | 'partial';
  playbook: Record<string, unknown>;
  createdAt?: string;
}

export interface GhostFork {
  id: string;
  name: string;
  connection: string;
}

export interface GhostDatabase {
  id: string;
  name: string;
  status?: string;
}
