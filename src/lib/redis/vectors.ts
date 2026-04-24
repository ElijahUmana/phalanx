/**
 * Redis 8 Vector Sets (VADD / VSIM / VCARD / VREM) for CVE semantic similarity.
 *
 * Uses the raw Redis protocol via `sendCommand` because the `redis` npm client
 * doesn't ship typed bindings for Vector Sets yet.
 */

import { getRedis } from './client';
import type { CveVectorHit } from './types';

export const CVE_VECTOR_SET = 'cves:vectors';

export async function vectorSetCard(key: string): Promise<number> {
  const client = await getRedis();
  const result = await client.sendCommand(['VCARD', key]);
  return toNumber(result) ?? 0;
}

export async function addCveVector(
  cveId: string,
  embedding: number[],
  key = CVE_VECTOR_SET,
): Promise<void> {
  const client = await getRedis();
  const args: string[] = ['VADD', key, 'VALUES', String(embedding.length)];
  for (const v of embedding) args.push(String(v));
  args.push(cveId);
  await client.sendCommand(args);
}

export async function removeCveVector(cveId: string, key = CVE_VECTOR_SET): Promise<number> {
  const client = await getRedis();
  const result = await client.sendCommand(['VREM', key, cveId]);
  return toNumber(result) ?? 0;
}

export async function findSimilarByEmbedding(
  embedding: number[],
  k = 5,
  key = CVE_VECTOR_SET,
): Promise<CveVectorHit[]> {
  const client = await getRedis();
  const args: string[] = ['VSIM', key, 'VALUES', String(embedding.length)];
  for (const v of embedding) args.push(String(v));
  args.push('COUNT', String(k), 'WITHSCORES');
  const raw = await client.sendCommand(args);
  return parseSimResponse(raw);
}

export async function findSimilarById(
  cveId: string,
  k = 5,
  key = CVE_VECTOR_SET,
): Promise<CveVectorHit[]> {
  const client = await getRedis();
  const raw = await client.sendCommand([
    'VSIM',
    key,
    'ELE',
    cveId,
    'COUNT',
    String(k),
    'WITHSCORES',
  ]);
  return parseSimResponse(raw);
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

/**
 * VSIM WITHSCORES returns alternating [id, score, id, score, ...] as a flat array.
 * Some client versions return Buffers; handle both.
 */
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
