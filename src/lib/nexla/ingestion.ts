// CVE feed ingestion. NVD and OSV are public, no-auth APIs; GHSA needs a
// GitHub token (we only call it if GITHUB_TOKEN is set, otherwise we fall
// back to a deterministic synthetic batch so the dashboard still lights up).
//
// This is the "Nexla Express" logical layer: each feed source is a
// normalized Nexset that funnels into the orchestrator. Real production
// would construct actual Nexla pipelines; the hackathon demo proves the
// pattern by ingesting live NVD/OSV data end-to-end.

import { randomUUID } from 'node:crypto';
import { emitEvent } from '@/lib/events/emitter';
import { env } from '@/lib/env';
import type { CveFeedRecord, CveFeedSource, IngestResult, PipelineInfo } from './types';

const NVD_URL =
  'https://services.nvd.nist.gov/rest/json/cves/2.0?resultsPerPage=20';
const OSV_URL = 'https://api.osv.dev/v1/query';

async function ingestNvd(): Promise<CveFeedRecord[]> {
  const res = await fetch(NVD_URL, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`NVD fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    vulnerabilities?: Array<{
      cve: {
        id: string;
        published?: string;
        descriptions?: Array<{ lang: string; value: string }>;
        metrics?: {
          cvssMetricV31?: Array<{ cvssData: { baseSeverity?: string } }>;
        };
      };
    }>;
  };
  const entries = json.vulnerabilities ?? [];
  return entries.map((v): CveFeedRecord => {
    const desc = v.cve.descriptions?.find((d) => d.lang === 'en')?.value;
    const severity = v.cve.metrics?.cvssMetricV31?.[0]?.cvssData?.baseSeverity;
    return {
      cveId: v.cve.id,
      source: 'NVD',
      published: v.cve.published,
      severity,
      description: desc,
    };
  });
}

async function ingestOsv(packageName = 'lodash'): Promise<CveFeedRecord[]> {
  const res = await fetch(OSV_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: { name: packageName, ecosystem: 'npm' } }),
  });
  if (!res.ok) throw new Error(`OSV fetch failed: ${res.status}`);
  const json = (await res.json()) as {
    vulns?: Array<{ id: string; aliases?: string[]; summary?: string; published?: string; database_specific?: { severity?: string } }>;
  };
  const vulns = json.vulns ?? [];
  return vulns.map((v): CveFeedRecord => {
    const cveAlias = v.aliases?.find((a) => a.startsWith('CVE-'));
    return {
      cveId: cveAlias ?? v.id,
      source: 'OSV',
      published: v.published,
      severity: v.database_specific?.severity,
      description: v.summary,
      affectedPackages: [packageName],
    };
  });
}

async function ingestGhsa(): Promise<CveFeedRecord[]> {
  const token = env().GITHUB_TOKEN;
  if (!token) {
    // No token → deterministic synthetic batch so downstream still flows.
    const cves = ['CVE-2024-29041', 'CVE-2024-28849', 'CVE-2024-27088'];
    return cves.map((cveId) => ({
      cveId,
      source: 'GHSA',
      severity: 'HIGH',
      description: 'GHSA entry (synthetic — set GITHUB_TOKEN to query live)',
    }));
  }
  const query = `
    query {
      securityVulnerabilities(first: 15, orderBy: {field: UPDATED_AT, direction: DESC}, ecosystem: NPM) {
        nodes {
          advisory { ghsaId summary severity publishedAt identifiers { type value } }
          package { name }
        }
      }
    }
  `;
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`GHSA fetch failed: ${res.status}`);
  type Node = {
    advisory: {
      ghsaId: string;
      summary?: string;
      severity?: string;
      publishedAt?: string;
      identifiers?: Array<{ type: string; value: string }>;
    };
    package: { name: string };
  };
  const json = (await res.json()) as {
    data?: { securityVulnerabilities?: { nodes?: Node[] } };
  };
  const nodes = json.data?.securityVulnerabilities?.nodes ?? [];
  return nodes.map((n): CveFeedRecord => {
    const cveIdEntry = n.advisory.identifiers?.find((i) => i.type === 'CVE');
    return {
      cveId: cveIdEntry?.value ?? n.advisory.ghsaId,
      source: 'GHSA',
      severity: n.advisory.severity,
      published: n.advisory.publishedAt,
      description: n.advisory.summary,
      affectedPackages: [n.package.name],
    };
  });
}

export async function ingestSource(
  scanId: string,
  source: CveFeedSource,
  packageHint?: string,
): Promise<IngestResult> {
  const startedAt = Date.now();
  let records: CveFeedRecord[] = [];
  try {
    if (source === 'NVD') records = await ingestNvd();
    else if (source === 'GHSA') records = await ingestGhsa();
    else if (source === 'OSV') records = await ingestOsv(packageHint);
  } catch (err) {
    console.warn(`[nexla] ingestSource ${source} failed:`, err);
    records = [];
  }
  const durationMs = Date.now() - startedAt;
  await emitEvent(scanId, {
    source: 'nexla',
    type: 'nexla.feed.ingest',
    data: { source, count: records.length, durationMs },
  });
  return { source, count: records.length, records, durationMs };
}

export async function ingestAll(
  scanId: string,
  packageHint?: string,
): Promise<CveFeedRecord[]> {
  const results = await Promise.all(
    (['NVD', 'GHSA', 'OSV'] as CveFeedSource[]).map((s) =>
      ingestSource(scanId, s, packageHint),
    ),
  );
  return results.flatMap((r) => r.records);
}

export async function buildPipeline(
  scanId: string,
  sourceUrl: string,
  targetSystem: string,
): Promise<PipelineInfo> {
  const info: PipelineInfo = {
    pipelineId: `nexla-${randomUUID().slice(0, 8)}`,
    sourceUrl,
    targetSystem,
    createdAt: new Date().toISOString(),
  };
  await emitEvent(scanId, {
    source: 'nexla',
    type: 'nexla.pipeline.built',
    data: {
      sourceUrl,
      targetSystem,
      pipelineId: info.pipelineId,
    },
  });
  return info;
}
