// Thin Redis Pub/Sub wrapper that every lib/* module uses to emit scan events.
// Publishes to channel `scan:events:{scanId}`. The /api/status SSE route subscribes.
//
// Fallback: if Redis is unreachable (local dev without REDIS_URL set), emits
// to an in-process EventEmitter so tests and single-process demos still work.
// Production always uses Redis because API routes are stateless.

import { EventEmitter } from 'node:events';
import { createClient, type RedisClientType } from 'redis';
import { env } from '@/lib/env';
import {
  channelForScan,
  type EmittableEvent,
  type PhalanxEvent,
} from './types';

const localBus = new EventEmitter();
localBus.setMaxListeners(10_000);

let publisher: RedisClientType | null = null;
let publisherPromise: Promise<RedisClientType> | null = null;
let redisUnavailable = false;

async function getPublisher(): Promise<RedisClientType> {
  if (publisher) return publisher;
  if (publisherPromise) return publisherPromise;
  publisherPromise = (async () => {
    const client = createClient({ url: env().REDIS_URL }) as RedisClientType;
    client.on('error', (err) => {
      console.error('[events] publisher error:', err);
    });
    await client.connect();
    publisher = client;
    return client;
  })();
  return publisherPromise;
}

export async function emitEvent(
  scanId: string,
  event: EmittableEvent,
): Promise<void> {
  const full: PhalanxEvent = {
    scanId,
    timestamp: Date.now(),
    ...event,
  };
  const channel = channelForScan(scanId);

  if (redisUnavailable) {
    localBus.emit(channel, full);
    return;
  }

  try {
    const client = await getPublisher();
    await client.publish(channel, JSON.stringify(full));
  } catch (err) {
    console.warn(
      '[events] redis publish failed, falling back to in-process bus:',
      err,
    );
    redisUnavailable = true;
    localBus.emit(channel, full);
  }
}

export interface ScanSubscription {
  ready: Promise<void>;
  unsubscribe: () => Promise<void>;
}

export function subscribeScan(
  scanId: string,
  cb: (event: PhalanxEvent) => void,
): ScanSubscription {
  const channel = channelForScan(scanId);
  const localListener = (e: PhalanxEvent) => cb(e);

  let subscriber: RedisClientType | null = null;
  let viaLocal = false;
  let stopped = false;

  const ready = (async () => {
    try {
      const client = createClient({ url: env().REDIS_URL }) as RedisClientType;
      client.on('error', (err) => {
        console.error('[events] subscriber error:', err);
      });
      await client.connect();
      if (stopped) {
        await client.quit().catch(() => {});
        return;
      }
      subscriber = client;
      await subscriber.subscribe(channel, (msg) => {
        try {
          const parsed = JSON.parse(msg) as PhalanxEvent;
          cb(parsed);
        } catch (err) {
          console.error('[events] malformed event payload:', err);
        }
      });
    } catch (err) {
      console.warn(
        '[events] redis subscribe failed, using in-process bus:',
        err,
      );
      viaLocal = true;
      localBus.on(channel, localListener);
    }
  })();

  const unsubscribe = async (): Promise<void> => {
    stopped = true;
    if (viaLocal) {
      localBus.off(channel, localListener);
    }
    if (subscriber) {
      try {
        await subscriber.unsubscribe(channel);
        await subscriber.quit();
      } catch (err) {
        console.error('[events] unsubscribe failed:', err);
      }
      subscriber = null;
    }
  };

  return { ready, unsubscribe };
}
