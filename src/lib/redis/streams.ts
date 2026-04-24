import { getRedis } from './client';
import type { InvestigationPayload, InvestigationMessage } from './types';

export const INVESTIGATION_STREAM = 'cve-investigations';
export const INVESTIGATION_GROUP = 'analysts';

export async function ensureGroup(
  stream = INVESTIGATION_STREAM,
  group = INVESTIGATION_GROUP,
): Promise<void> {
  const client = await getRedis();
  try {
    await client.xGroupCreate(stream, group, '$', { MKSTREAM: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('BUSYGROUP')) throw err;
  }
}

export async function publishInvestigation(
  payload: InvestigationPayload,
  stream = INVESTIGATION_STREAM,
): Promise<string> {
  await ensureGroup(stream);
  const client = await getRedis();
  const id = await client.xAdd(stream, '*', {
    payload: JSON.stringify(payload),
  });
  return id;
}

export interface ConsumeOptions {
  stream?: string;
  group?: string;
  consumerName: string;
  blockMs?: number;
  count?: number;
}

export async function readInvestigations(
  opts: ConsumeOptions,
): Promise<InvestigationMessage[]> {
  const client = await getRedis();
  const stream = opts.stream ?? INVESTIGATION_STREAM;
  const group = opts.group ?? INVESTIGATION_GROUP;
  await ensureGroup(stream, group);

  const response = await client.xReadGroup(
    group,
    opts.consumerName,
    { key: stream, id: '>' },
    { BLOCK: opts.blockMs ?? 5000, COUNT: opts.count ?? 10 },
  );

  if (!response || response.length === 0) return [];

  const out: InvestigationMessage[] = [];
  for (const entry of response) {
    for (const msg of entry.messages) {
      const raw = msg.message.payload;
      if (typeof raw !== 'string') {
        throw new Error(`stream ${stream} message ${msg.id} missing payload field`);
      }
      const payload = JSON.parse(raw) as InvestigationPayload;
      out.push({ streamId: msg.id, payload });
    }
  }
  return out;
}

export async function ackInvestigation(
  streamId: string,
  stream = INVESTIGATION_STREAM,
  group = INVESTIGATION_GROUP,
): Promise<number> {
  const client = await getRedis();
  return client.xAck(stream, group, streamId);
}

export async function streamLength(stream = INVESTIGATION_STREAM): Promise<number> {
  const client = await getRedis();
  return client.xLen(stream);
}

export async function consumeInvestigations(
  opts: ConsumeOptions,
  handler: (msg: InvestigationMessage) => Promise<void>,
  stopAfter?: number,
): Promise<number> {
  let processed = 0;
  while (!stopAfter || processed < stopAfter) {
    const batch = await readInvestigations(opts);
    if (batch.length === 0 && stopAfter) break;
    for (const msg of batch) {
      await handler(msg);
      await ackInvestigation(
        msg.streamId,
        opts.stream ?? INVESTIGATION_STREAM,
        opts.group ?? INVESTIGATION_GROUP,
      );
      processed++;
      if (stopAfter && processed >= stopAfter) return processed;
    }
  }
  return processed;
}
