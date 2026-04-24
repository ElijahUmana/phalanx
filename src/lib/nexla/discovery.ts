// Agentic Probe — auto-discover customer data sources. For the hackathon we
// return a realistic enterprise-flavored set; real Nexla would introspect
// the customer's Artifactory/GitLab/S3/etc. via their connectors.

import { emitEvent } from '@/lib/events/emitter';
import type { DiscoveredSource } from './types';

const DEFAULT_SOURCES: DiscoveredSource[] = [
  {
    name: 'Artifactory npm registry',
    kind: 'ArtifactRegistry',
    url: 'artifactory://internal/npm-remote',
    estimatedRecords: 14_200,
  },
  {
    name: 'GitLab package registry',
    kind: 'ArtifactRegistry',
    url: 'gitlab://internal/packages',
    estimatedRecords: 3_800,
  },
  {
    name: 'Confluence SBOM exports',
    kind: 'SBOM',
    url: 'confluence://spaces/SEC/pages/sbom-exports',
    estimatedRecords: 620,
  },
  {
    name: 'GitHub Actions CI logs',
    kind: 'CICD',
    url: 'github://actions/runs',
    estimatedRecords: 41_900,
  },
  {
    name: 'Container registry',
    kind: 'Container',
    url: 'ghcr.io://org/internal',
    estimatedRecords: 1_120,
  },
];

export async function discoverCustomerSources(
  scanId: string,
): Promise<DiscoveredSource[]> {
  for (const src of DEFAULT_SOURCES) {
    await emitEvent(scanId, {
      source: 'nexla',
      type: 'nexla.pipeline.built',
      data: {
        sourceUrl: src.url,
        targetSystem: 'nexsets',
        kind: src.kind,
        estimatedRecords: src.estimatedRecords,
      },
    });
  }
  return DEFAULT_SOURCES;
}
