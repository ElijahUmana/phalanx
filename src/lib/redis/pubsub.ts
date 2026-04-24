import { emitEvent } from '@/lib/events/emitter';
import { getRedis, getDedicatedSubscriber } from './client';
import type { CancelEvent, CancelReason } from './types';

export const CANCEL_CHANNEL_PATTERN = 'cancel:*';

export function cancelChannel(_scanId: string, cveId: string): string {
  return `cancel:${cveId}`;
}

export async function broadcastCancel(
  scanId: string,
  cveId: string,
  reason: CancelReason,
): Promise<number> {
  const client = await getRedis(scanId);
  const event: CancelEvent = { cveId, reason, broadcastAt: new Date().toISOString() };
  const subscribers = await client.publish(cancelChannel(scanId, cveId), JSON.stringify(event));

  await emitEvent(scanId, {
    source: 'redis',
    type: 'redis.pubsub.cancel',
    data: {
      cveId,
      reason,
      subscribers,
      broadcastAt: event.broadcastAt,
    },
  });

  return subscribers;
}

export type CancelHandler = (event: CancelEvent) => void | Promise<void>;

export interface CancelSubscription {
  unsubscribe: () => Promise<void>;
}

export async function subscribeCancellations(
  scanId: string,
  handler: CancelHandler,
): Promise<CancelSubscription> {
  const sub = await getDedicatedSubscriber(scanId);
  await sub.pSubscribe(CANCEL_CHANNEL_PATTERN, async (message, _channel) => {
    let parsed: CancelEvent;
    try {
      parsed = JSON.parse(message) as CancelEvent;
    } catch (err) {
      console.error('[redis:pubsub] malformed cancel payload:', message, err);
      return;
    }
    await handler(parsed);
  });
  return {
    unsubscribe: async () => {
      await sub.pUnsubscribe(CANCEL_CHANNEL_PATTERN);
      await sub.quit();
    },
  };
}
