/**
 * Redis 8 Vector Sets (VADD / VSIM / VCARD / VREM) for CVE semantic similarity.
 *
 * Uses the raw Redis protocol via `sendCommand` because the `redis` npm client
 * doesn't ship typed bindings for Vector Sets yet.
 */

import { emitEvent } from '@/lib/events/emitter';
import { getRedis } from './client';
import type { CveVectorHit } from './types';

export const CVE_VECTOR_SET = 'cves:vectors';

export async function vectorSetCard(scanId: string, key: string): Promise<number> {
  const client = await getRedis(scanId);
  const result = await client.sendCommand(['VCARD', key]);
  return toNumber(result) ?? 0;
}

export async function addCveVector(
  scanId: string,
  cveId: string,
  embedding: number[],
  key = CVE_VECTOR_SET,
): Promise<void> {
  const client = await getRedis(scanId);
  const args: string[] = ['VADD', key, 'VALUES', String(embedding.length)];
  for (const v of embedding) args.push(String(v));
  args.push(cveId);
  await client.sendCommand(args);
}

export async function removeCveVector(
  scanId: string,
  cveId: string,
  key = CVE_VECTOR_SET,
): Promise<number> {
  const client = await getRedis(scanId);
  const result = await client.sendCommand(['VREM', key, cveId]);
  return toNumber(result) ?? 0;
}

export async function findSimilarByEmbedding(
  scanId: string,
  embedding: number[],
  k = 5,
  key = CVE_VECTOR_SET,
): Promise<CveVectorHit[]> {
  const client = await getRedis(scanId);
  const args: string[] = ['VSIM', key, 'VALUES', String(embedding.length)];
  for (const v of embedding) args.push(String(v));
  args.push('COUNT', String(k), 'WITHSCORES');
  const raw = await client.sendCommand(args);
  const hits = parseSimResponse(raw);
  await emitMatch(scanId, hits, 'by-embedding');
  return hits;
}

export async function findSimilarById(
  scanId: string,
  cveId: string,
  k = 5,
  key = CVE_VECTOR_SET,
): Promise<CveVectorHit[]> {
  const client = await getRedis(scanId);
  const raw = await client.sendCommand([
    'VSIM',
    key,
    'ELE',
    cveId,
    'COUNT',
    String(k),
    'WITHSCORES',
  ]);
  const hits = parseSimResponse(raw);
  await emitMatch(scanId, hits, cveId);
  return hits;
}

async function emitMatch(
  scanId: string,
  hits: CveVectorHit[],
  probe: string,
): Promise<void> {
  if (hits.length === 0) return;
  await emitEvent(scanId, {
    source: 'redis',
    type: 'redis.vector.match',
    data: {
      cveId: probe,
      similarCveId: hits[0].cveId,
      cosineScore: hits[0].similarity,
      matchCount: hits.length,
      topK: hits.slice(0, 3).map((h) => ({ cveId: h.cveId, cosineScore: h.similarity })),
    },
  });
}

function toNumber(raw: unknown): number | null {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'bigint') return Number(raw);
  if (typeof raw === 'string') {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toStringValue(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Buffer) return raw.toString('utf8');
  if (typeof raw === 'number') return String(raw);
  if (typeof raw === 'bigint') return String(raw);
  return String(raw);
}

function parseSimResponse(raw: unknown): CveVectorHit[] {
  if (!Array.isArray(raw)) return [];
  const out: CveVectorHit[] = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const cveId = toStringValue(raw[i]);
    const score = Number(toStringValue(raw[i + 1]));
    out.push({ cveId, similarity: Number.isFinite(score) ? score : 0 });
  }
  return out;
}
