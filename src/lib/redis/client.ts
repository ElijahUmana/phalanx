import { createClient, type RedisClientType } from 'redis';
import { env } from '@/lib/env';

let primaryClient: RedisClientType | null = null;
let primaryClientReady: Promise<RedisClientType> | null = null;

async function connect(label: string): Promise<RedisClientType> {
  const client = createClient({
    url: env().REDIS_URL,
    socket: {
      reconnectStrategy: (retries) => Math.min(retries * 200, 5000),
    },
  }) as RedisClientType;
  client.on('error', (err) => {
    console.error(`[redis:${label}] error:`, err);
  });
  await client.connect();
  return client;
}

export async function getRedis(_scanId: string): Promise<RedisClientType> {
  if (primaryClient) return primaryClient;
  if (primaryClientReady) return primaryClientReady;
  primaryClientReady = connect('primary').then((c) => {
    primaryClient = c;
    return c;
  });
  return primaryClientReady;
}

export async function getDedicatedSubscriber(
  _scanId: string,
): Promise<RedisClientType> {
  return connect('subscriber');
}

export async function closeRedis(_scanId: string): Promise<void> {
  if (primaryClient) {
    await primaryClient.quit();
    primaryClient = null;
    primaryClientReady = null;
  }
}

export async function ping(scanId: string): Promise<string> {
  const client = await getRedis(scanId);
  return client.ping();
}
