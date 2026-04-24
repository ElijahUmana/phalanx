import { getRedis, getDedicatedSubscriber } from './client';
import type { CancelEvent, CancelReason } from './types';

export const CANCEL_CHANNEL_PATTERN = 'cancel:*';

export function cancelChannel(cveId: string): string {
  return `cancel:${cveId}`;
}

export async function broadcastCancel(
  cveId: string,
  reason: CancelReason,
): Promise<number> {
  const client = await getRedis();
  const event: CancelEvent = { cveId, reason, broadcastAt: new Date().toISOString() };
  return client.publish(cancelChannel(cveId), JSON.stringify(event));
}

export type CancelHandler = (event: CancelEvent) => void | Promise<void>;

export interface CancelSubscription {
  unsubscribe: () => Promise<void>;
}

export async function subscribeCancellations(
  handler: CancelHandler,
): Promise<CancelSubscription> {
  const sub = await getDedicatedSubscriber();
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
