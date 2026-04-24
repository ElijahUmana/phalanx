import { env } from '@/lib/env';
import { emitEvent } from '@/lib/events/emitter';
import { getConnectionForPhalanx, withPg } from './client';
import type { CveRecord, CveSimilarity, RemediationMemory, Severity, CveStatus } from './types';

export async function embed(_scanId: string, text: string): Promise<number[]> {
  const e = env();
  const dim = e.EMBEDDING_DIM;

  if (e.OPENAI_API_KEY) {
    return openAiEmbed(text, e.OPENAI_API_KEY, e.EMBEDDING_MODEL, dim);
  }

  return deterministicEmbed(text, dim);
}

async function openAiEmbed(
  text: string,
  apiKey: string,
  model: string,
  expectedDim: number,
): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ input: text, model }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI embedding API error ${response.status}: ${body}`);
  }
  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };
  const vec = data.data[0]?.embedding;
  if (!vec || vec.length !== expectedDim) {
    throw new Error(
      `Embedding dim mismatch: expected ${expectedDim}, got ${vec?.length ?? 'undefined'}`,
    );
  }
  return vec;
}

function deterministicEmbed(text: string, dim: number): number[] {
  const vec = new Array<number>(dim).fill(0);
  const lowered = text.toLowerCase();
  const tokens = lowered.split(/[^a-z0-9]+/).filter((t) => t.length > 1);
  for (const token of tokens) {
    const h1 = hashString(token) % dim;
    const h2 = hashString('b:' + token) % dim;
    const h3 = hashString('c:' + token) % dim;
    vec[h1] += 1.0;
    vec[h2] += 0.8;
    vec[h3] += 0.6;
    if (token.length >= 4) {
      for (let i = 0; i <= token.length - 3; i++) {
        const trigram = token.slice(i, i + 3);
        const tHash = hashString('tri:' + trigram) % dim;
        vec[tHash] += 0.3;
      }
    }
  }
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < dim; i++) vec[i] /= norm;
  return vec;
}

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

function formatVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

export async function recordCve(scanId: string, cve: CveRecord): Promise<void> {
  const vec = await embed(scanId, `${cve.cveId} ${cve.description}`);
  const connStr = await getConnectionForPhalanx(scanId);
  await withPg(scanId, connStr, async (client) => {
    await client.query(
      `INSERT INTO cves (cve_id, severity, cvss_score, affected_packages, patch_versions,
                         discovery_source, description, embedding, published_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector, $9, $10)
       ON CONFLICT (cve_id) DO UPDATE SET
         severity = EXCLUDED.severity,
         cvss_score = EXCLUDED.cvss_score,
         affected_packages = EXCLUDED.affected_packages,
         patch_versions = EXCLUDED.patch_versions,
         discovery_source = EXCLUDED.discovery_source,
         description = EXCLUDED.description,
         embedding = EXCLUDED.embedding,
         published_at = EXCLUDED.published_at,
         status = EXCLUDED.status,
         updated_at = NOW()`,
      [
        cve.cveId,
        cve.severity,
        cve.cvssScore,
        JSON.stringify(cve.affectedPackages),
        JSON.stringify(cve.patchVersions),
        cve.discoverySource,
        cve.description,
        formatVectorLiteral(vec),
        cve.publishedAt,
        cve.status,
      ],
    );
  });
}

export async function findSimilarCves(
  scanId: string,
  description: string,
  k = 5,
): Promise<CveSimilarity[]> {
  const vec = await embed(scanId, description);
  const connStr = await getConnectionForPhalanx(scanId);
  const results = await withPg(scanId, connStr, async (client) => {
    const result = await client.query<{
      cve_id: string;
      severity: Severity;
      cvss_score: string | null;
      affected_packages: unknown;
      patch_versions: unknown;
      discovery_source: string;
      description: string;
      published_at: Date;
      status: CveStatus;
      distance: string;
    }>(
      `SELECT cve_id, severity, cvss_score, affected_packages, patch_versions,
              discovery_source, description, published_at, status,
              (embedding <=> $1::vector) AS distance
       FROM cves
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [formatVectorLiteral(vec), k],
    );
    return result.rows.map((r) => ({
      cve: {
        cveId: r.cve_id,
        severity: r.severity,
        cvssScore: r.cvss_score == null ? null : Number(r.cvss_score),
        affectedPackages: r.affected_packages as CveRecord['affectedPackages'],
        patchVersions: r.patch_versions as CveRecord['patchVersions'],
        discoverySource: r.discovery_source,
        description: r.description,
        publishedAt: r.published_at.toISOString(),
        status: r.status,
      },
      similarity: 1 - Number(r.distance),
    }));
  });

  if (results.length > 0) {
    await emitEvent(scanId, {
      source: 'ghost',
      type: 'ghost.memory.match',
      data: {
        pattern: description.slice(0, 200),
        score: results[0].similarity,
        topCveId: results[0].cve.cveId,
        matchCount: results.length,
      },
    });
  }

  return results;
}

export async function recordRemediation(
  scanId: string,
  mem: RemediationMemory,
): Promise<number> {
  const vec = await embed(scanId, `${mem.cveId} ${mem.hypothesis} ${mem.outcome}`);
  const connStr = await getConnectionForPhalanx(scanId);
  return withPg(scanId, connStr, async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO remediation_memories (cve_id, hypothesis, outcome, playbook, embedding)
       VALUES ($1, $2, $3, $4, $5::vector)
       RETURNING id`,
      [
        mem.cveId,
        mem.hypothesis,
        mem.outcome,
        JSON.stringify(mem.playbook),
        formatVectorLiteral(vec),
      ],
    );
    return result.rows[0].id;
  });
}

export async function findSimilarRemediations(
  scanId: string,
  cveDescription: string,
  k = 3,
): Promise<RemediationMemory[]> {
  const vec = await embed(scanId, cveDescription);
  const connStr = await getConnectionForPhalanx(scanId);
  return withPg(scanId, connStr, async (client) => {
    const result = await client.query<{
      id: number;
      cve_id: string;
      hypothesis: string;
      outcome: RemediationMemory['outcome'];
      playbook: Record<string, unknown>;
      created_at: Date;
    }>(
      `SELECT id, cve_id, hypothesis, outcome, playbook, created_at
       FROM remediation_memories
       WHERE embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT $2`,
      [formatVectorLiteral(vec), k],
    );
    return result.rows.map((r) => ({
      id: r.id,
      cveId: r.cve_id,
      hypothesis: r.hypothesis,
      outcome: r.outcome,
      playbook: r.playbook,
      createdAt: r.created_at.toISOString(),
    }));
  });
}

export async function lexicalSearchCves(
  scanId: string,
  query: string,
  k = 5,
): Promise<CveRecord[]> {
  const connStr = await getConnectionForPhalanx(scanId);
  return withPg(scanId, connStr, async (client) => {
    const result = await client.query<{
      cve_id: string;
      severity: Severity;
      cvss_score: string | null;
      affected_packages: unknown;
      patch_versions: unknown;
      discovery_source: string;
      description: string;
      published_at: Date;
      status: CveStatus;
    }>(
      `SELECT cve_id, severity, cvss_score, affected_packages, patch_versions,
              discovery_source, description, published_at, status
       FROM cves
       ORDER BY similarity(description, $1) DESC
       LIMIT $2`,
      [query, k],
    );
    return result.rows.map((r) => ({
      cveId: r.cve_id,
      severity: r.severity,
      cvssScore: r.cvss_score == null ? null : Number(r.cvss_score),
      affectedPackages: r.affected_packages as CveRecord['affectedPackages'],
      patchVersions: r.patch_versions as CveRecord['patchVersions'],
      discoverySource: r.discovery_source,
      description: r.description,
      publishedAt: r.published_at.toISOString(),
      status: r.status,
    }));
  });
}
