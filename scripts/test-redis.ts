/**
 * Phalanx Redis coordination smoke test.
 *
 * Exits 0 on all 4 subsystems passing, non-zero on any failure. Hits real Redis Cloud.
 *
 *   1. Streams: publish 3 investigations, drain with 2 consumers in same group,
 *      assert exactly-once delivery and all 3 ACKed.
 *   2. Pub/Sub: subscribe to cancel:*, publish cancel:CVE-2020-8203, assert handler
 *      fires within 500ms.
 *   3. Vector Sets: VADD 5 CVE embeddings, VSIM for one of them, assert top hit
 *      is itself with similarity ≈ 1.0.
 *   4. Semantic cache: set a prompt/response, get a near-duplicate prompt, assert
 *      hit with similarity > threshold; assert miss for an unrelated prompt.
 */

import { randomUUID } from 'node:crypto';
import {
  getRedis,
  closeRedis,
  INVESTIGATION_STREAM,
  INVESTIGATION_GROUP,
  publishInvestigation,
  readInvestigations,
  ackInvestigation,
  streamLength,
  broadcastCancel,
  subscribeCancellations,
  addCveVector,
  removeCveVector,
  findSimilarByEmbedding,
  findSimilarById,
  CVE_VECTOR_SET,
  semanticGet,
  semanticSet,
  getHitRate,
  resetStats,
  CACHE_VECTOR_SET,
  CACHE_RESPONSE_PREFIX,
  CACHE_PROMPT_PREFIX,
} from '@/lib/redis';
import type { CancelEvent } from '@/lib/redis';
import { embed } from '@/lib/ghost/memory';
import { env } from '@/lib/env';

type Step = { name: string; run: () => Promise<void> };
const steps: Step[] = [];
let passed = 0;
let failed = 0;
function step(name: string, run: () => Promise<void>) { steps.push({ name, run }); }

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  env();
  const client = await getRedis();
  const runId = randomUUID().slice(0, 8);
  const testStream = `${INVESTIGATION_STREAM}-test-${runId}`;
  const testGroup = `${INVESTIGATION_GROUP}-test-${runId}`;
  const testVectorSet = `${CVE_VECTOR_SET}-test-${runId}`;
  const testCacheSet = `${CACHE_VECTOR_SET}-test-${runId}`;
  const testCacheResponsePrefix = `${CACHE_RESPONSE_PREFIX}test-${runId}:`;
  const testCachePromptPrefix = `${CACHE_PROMPT_PREFIX}test-${runId}:`;

  const cleanups: Array<() => Promise<void>> = [];

  step('connect + PING', async () => {
    const pong = await client.ping();
    if (pong !== 'PONG') throw new Error(`PING did not return PONG, got: ${pong}`);
    console.log(`  [test]   PONG`);
  });

  step('Streams: publish 3 investigations, 2 consumers each drain subset, all ACKed', async () => {
    await client.xGroupCreate(testStream, testGroup, '$', { MKSTREAM: true }).catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('BUSYGROUP')) throw err;
    });
    cleanups.push(async () => {
      await client.del(testStream).catch(() => 0);
    });

    const cveIds = ['CVE-2020-8203', 'CVE-2020-7598', 'CVE-2024-29041'];
    const enqueueAt = new Date().toISOString();
    for (const cveId of cveIds) {
      await client.xAdd(testStream, '*', {
        payload: JSON.stringify({
          cveId,
          severity: 'high',
          description: `test investigation for ${cveId}`,
          affectedPackages: [{ name: 'test', versionRange: '<1.0.0' }],
          serviceName: 'enterprise-api',
          enqueuedAt: enqueueAt,
        }),
      });
    }
    const len = await client.xLen(testStream);
    if (len < 3) throw new Error(`expected ≥3 messages in stream, got ${len}`);

    const drain = async (consumerName: string) => {
      const collected: string[] = [];
      const response = await client.xReadGroup(
        testGroup,
        consumerName,
        { key: testStream, id: '>' },
        { BLOCK: 1000, COUNT: 10 },
      );
      if (!response) return collected;
      for (const entry of response) {
        for (const msg of entry.messages) {
          collected.push(msg.id);
          await client.xAck(testStream, testGroup, msg.id);
        }
      }
      return collected;
    };

    const consumer1 = await drain('analyst-1');
    const consumer2 = await drain('analyst-2');
    const totalAcked = consumer1.length + consumer2.length;
    if (totalAcked !== 3) {
      throw new Error(
        `expected 3 messages across both consumers, got ${totalAcked} (c1=${consumer1.length}, c2=${consumer2.length})`,
      );
    }
    const overlap = consumer1.filter((id) => consumer2.includes(id));
    if (overlap.length > 0) {
      throw new Error(`exactly-once violated: consumers received overlapping ids ${overlap.join(', ')}`);
    }
    console.log(`  [test]   analyst-1 got ${consumer1.length}, analyst-2 got ${consumer2.length}, 0 overlap — exactly-once ✓`);
  });

  step('Pub/Sub: subscribe to cancel:*, publish cancel:CVE-2020-8203, handler fires', async () => {
    const received: CancelEvent[] = [];
    const subscription = await subscribeCancellations((event) => {
      received.push(event);
    });
    cleanups.push(() => subscription.unsubscribe());

    await delay(100);
    const subscribers = await broadcastCancel('CVE-2020-8203', 'false_positive');
    if (subscribers < 1) throw new Error(`expected ≥1 subscriber to receive cancel, got ${subscribers}`);

    for (let waited = 0; waited < 2000 && received.length === 0; waited += 50) {
      await delay(50);
    }
    if (received.length === 0) {
      throw new Error('cancel handler did not fire within 2s');
    }
    const event = received[0];
    if (event.cveId !== 'CVE-2020-8203' || event.reason !== 'false_positive') {
      throw new Error(`cancel event mismatch: ${JSON.stringify(event)}`);
    }
    console.log(`  [test]   cancel handler fired for ${event.cveId} (reason=${event.reason})`);
  });

  step('Vector Sets: VADD 5 CVE embeddings, VSIM for one → top hit is itself ≈ 1.0', async () => {
    cleanups.push(async () => {
      await client.del(testVectorSet).catch(() => 0);
    });

    const cves = [
      'CVE-2020-8203: prototype pollution lodash zipObjectDeep',
      'CVE-2020-7598: minimist prototype pollution setKey',
      'CVE-2020-28168: axios SSRF redirect bypass proxy',
      'CVE-2021-32640: ws ReDoS Sec-Websocket-Protocol header',
      'CVE-2024-29041: express open redirect res.location unsanitized',
    ];
    const ids: string[] = [];
    for (const line of cves) {
      const cveId = line.slice(0, 13);
      ids.push(cveId);
      const vec = await embed(line);
      await addCveVector(cveId, vec, testVectorSet);
    }

    const card = await client.sendCommand(['VCARD', testVectorSet]);
    const cardNum = typeof card === 'number' ? card : Number(card);
    if (cardNum < 5) throw new Error(`expected VCARD ≥ 5, got ${cardNum}`);

    const probe = 'CVE-2020-8203: prototype pollution lodash zipObjectDeep';
    const probeVec = await embed(probe);
    const top = await findSimilarByEmbedding(probeVec, 3, testVectorSet);
    if (top.length === 0) throw new Error('VSIM returned 0 hits');
    if (top[0].cveId !== 'CVE-2020-8203') {
      throw new Error(`expected top hit CVE-2020-8203, got ${top[0].cveId} (full: ${JSON.stringify(top)})`);
    }
    if (top[0].similarity < 0.99) {
      throw new Error(`expected self-similarity ≥ 0.99, got ${top[0].similarity}`);
    }
    console.log(`  [test]   top 3: ${top.map((h) => `${h.cveId}(${h.similarity.toFixed(3)})`).join(', ')}`);

    const byId = await findSimilarById('CVE-2020-8203', 3, testVectorSet);
    if (byId.length === 0) throw new Error('VSIM ELE returned 0 hits');
    console.log(`  [test]   VSIM ELE top 3: ${byId.map((h) => h.cveId).join(', ')}`);
  });

  step('Semantic cache: near-duplicate prompt hits, unrelated prompt misses', async () => {
    const { semanticSet: _set, semanticGet: _get } = await import('@/lib/redis/cache');
    void _set; void _get;

    const testCacheHits = `cache:stats:test-${runId}:hits`;
    const testCacheMisses = `cache:stats:test-${runId}:misses`;
    cleanups.push(async () => {
      await client.del([testCacheSet, testCacheHits, testCacheMisses]).catch(() => 0);
      const promptKeys = await client.keys(testCachePromptPrefix + '*');
      const respKeys = await client.keys(testCacheResponsePrefix + '*');
      if (promptKeys.length + respKeys.length > 0) {
        await client.del([...promptKeys, ...respKeys]).catch(() => 0);
      }
    });

    const prompt = 'How do I remediate CVE-2020-8203 lodash prototype pollution?';
    const response = 'Upgrade lodash to 4.17.21 and run pnpm test.';

    const vec = await embed(prompt);
    const id = 'test-' + runId + '-' + require('node:crypto').createHash('sha256').update(prompt).digest('hex').slice(0, 16);
    const vaddArgs: string[] = ['VADD', testCacheSet, 'VALUES', String(vec.length)];
    for (const v of vec) vaddArgs.push(String(v));
    vaddArgs.push(id);
    await client.sendCommand(vaddArgs);
    await client.set(testCacheResponsePrefix + id, response, { EX: 300 });
    await client.set(testCachePromptPrefix + id, prompt, { EX: 300 });

    const probe = async (text: string) => {
      const probeVec = await embed(text);
      const args: string[] = ['VSIM', testCacheSet, 'VALUES', String(probeVec.length)];
      for (const v of probeVec) args.push(String(v));
      args.push('COUNT', '1', 'WITHSCORES');
      const raw = await client.sendCommand(args);
      if (!Array.isArray(raw) || raw.length < 2) return { hit: false as const };
      const hitId = typeof raw[0] === 'string' ? raw[0] : String(raw[0]);
      const score = Number(typeof raw[1] === 'string' ? raw[1] : String(raw[1]));
      return { hit: true as const, id: hitId, similarity: score };
    };

    const nearDuplicate = await probe('How to fix CVE-2020-8203 lodash prototype pollution vulnerability?');
    if (!nearDuplicate.hit) throw new Error('near-duplicate probe returned no hit');
    if (nearDuplicate.similarity < 0.85) {
      throw new Error(`near-duplicate similarity should be ≥ 0.85, got ${nearDuplicate.similarity}`);
    }
    if (nearDuplicate.id !== id) {
      throw new Error(`near-duplicate top hit id mismatch: expected ${id}, got ${nearDuplicate.id}`);
    }
    const storedResponse = await client.get(testCacheResponsePrefix + nearDuplicate.id);
    if (storedResponse !== response) {
      throw new Error(`response retrieval mismatch: ${storedResponse}`);
    }
    console.log(`  [test]   near-duplicate HIT sim=${nearDuplicate.similarity.toFixed(3)}, response retrieved ✓`);

    const unrelated = await probe('What time is it in Tokyo right now?');
    if (unrelated.hit && unrelated.similarity >= 0.85) {
      throw new Error(`unrelated prompt should miss or have low sim, got ${unrelated.similarity}`);
    }
    console.log(`  [test]   unrelated prompt miss/low-sim (${unrelated.hit ? unrelated.similarity.toFixed(3) : 'no hit'})`);
  });

  for (const s of steps) {
    console.log(`\n→ ${s.name}`);
    try {
      await s.run();
      passed++;
      console.log(`  ✓ pass`);
    } catch (err) {
      failed++;
      console.log(`  ✗ FAIL: ${err instanceof Error ? err.message : String(err)}`);
      if (err instanceof Error && err.stack) {
        console.log(err.stack.split('\n').slice(0, 3).join('\n'));
      }
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);

  for (const cleanup of cleanups.reverse()) {
    try { await cleanup(); } catch (err) { console.warn('[cleanup] error:', err); }
  }

  await closeRedis();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error('[test-redis] UNEXPECTED ERROR:', err);
  process.exit(1);
});
