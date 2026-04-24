/**
 * Semantic LLM response cache. Mirrors LangCache: hash-then-embed prompt,
 * VSIM Redis 8 Vector Set for near-duplicate retrieval, SET the response
 * by id with TTL. Tracks hit/miss counters and emits `redis.langcache.hit`
 * on every hit.
 */

import { createHash } from 'node:crypto';
import { emitEvent } from '@/lib/events/emitter';
import { getRedis } from './client';
import { embed } from '@/lib/ghost/memory';
import type { CacheResult, CacheStats } from './types';

export const CACHE_VECTOR_SET = 'cache:prompts';
export const CACHE_RESPONSE_PREFIX = 'cache:response:';
export const CACHE_PROMPT_PREFIX = 'cache:prompt:';
export const CACHE_HITS_COUNTER = 'cache:stats:hits';
export const CACHE_MISSES_COUNTER = 'cache:stats:misses';

export const DEFAULT_SIMILARITY_THRESHOLD = 0.95;
export const DEFAULT_TTL_SEC = 60 * 60 * 24 * 7;

function promptId(prompt: string): string {
  return createHash('sha256').update(prompt).digest('hex').slice(0, 32);
}

export async function semanticGet(
  scanId: string,
  prompt: string,
  similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
): Promise<CacheResult> {
  const client = await getRedis(scanId);
  const vec = await embed(scanId, prompt);

  const args: string[] = ['VSIM', CACHE_VECTOR_SET, 'VALUES', String(vec.length)];
  for (const v of vec) args.push(String(v));
  args.push('COUNT', '1', 'WITHSCORES');

  let raw: unknown;
  try {
    raw = await client.sendCommand(args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('no such key') || msg.includes('WRONGTYPE')) {
      await client.incr(CACHE_MISSES_COUNTER);
      return { hit: false };
    }
    throw err;
  }

  const hash = promptId(prompt);

  if (!Array.isArray(raw) || raw.length < 2) {
    await client.incr(CACHE_MISSES_COUNTER);
    return { hit: false };
  }
  const topIdRaw = raw[0];
  const topScoreRaw = raw[1];
  const topId = typeof topIdRaw === 'string' ? topIdRaw : String(topIdRaw);
  const similarity = Number(typeof topScoreRaw === 'string' ? topScoreRaw : String(topScoreRaw));

  if (!Number.isFinite(similarity) || similarity < similarityThreshold) {
    await client.incr(CACHE_MISSES_COUNTER);
    return { hit: false };
  }

  const response = await client.get(CACHE_RESPONSE_PREFIX + topId);
  const matchedPrompt = await client.get(CACHE_PROMPT_PREFIX + topId);
  if (!response) {
    await client.incr(CACHE_MISSES_COUNTER);
    return { hit: false };
  }

  await client.incr(CACHE_HITS_COUNTER);
  const stats = await readStats(client);
  await emitEvent(scanId, {
    source: 'redis',
    type: 'redis.langcache.hit',
    data: {
      hitRate: stats.rate,
      hits: stats.hits,
      misses: stats.misses,
      promptHash: hash,
      matchedId: topId,
      similarity,
    },
  });

  return {
    hit: true,
    response,
    similarity,
    matchedPrompt: matchedPrompt ?? '',
  };
}

export async function semanticSet(
  scanId: string,
  prompt: string,
  response: string,
  ttlSec = DEFAULT_TTL_SEC,
): Promise<string> {
  const client = await getRedis(scanId);
  const id = promptId(prompt);
  const vec = await embed(scanId, prompt);

  const vaddArgs: string[] = ['VADD', CACHE_VECTOR_SET, 'VALUES', String(vec.length)];
  for (const v of vec) vaddArgs.push(String(v));
  vaddArgs.push(id);
  await client.sendCommand(vaddArgs);

  await client.set(CACHE_RESPONSE_PREFIX + id, response, { EX: ttlSec });
  await client.set(CACHE_PROMPT_PREFIX + id, prompt, { EX: ttlSec });

  return id;
}

async function readStats(
  client: Awaited<ReturnType<typeof getRedis>>,
): Promise<CacheStats> {
  const [hitsRaw, missesRaw] = await Promise.all([
    client.get(CACHE_HITS_COUNTER),
    client.get(CACHE_MISSES_COUNTER),
  ]);
  const hits = Number(hitsRaw ?? 0);
  const misses = Number(missesRaw ?? 0);
  const total = hits + misses;
  return {
    hits,
    misses,
    rate: total === 0 ? 0 : hits / total,
  };
}

export async function getHitRate(scanId: string): Promise<CacheStats> {
  const client = await getRedis(scanId);
  return readStats(client);
}

export async function resetStats(scanId: string): Promise<void> {
  const client = await getRedis(scanId);
  await client.del([CACHE_HITS_COUNTER, CACHE_MISSES_COUNTER]);
}
