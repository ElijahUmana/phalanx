// Bidirectional writeback — after remediation, distribute the evidence
// package to customer systems. Real Nexla does per-customer 550+ bidirectional
// connectors; for the hackathon we hit a Slack webhook if NEXLA_SLACK_WEBHOOK_URL
// is set and log-emit for the other system targets so the dashboard's
// NexlaPanel shows the full bidirectional loop.

import { emitEvent } from '@/lib/events/emitter';
import { env } from '@/lib/env';
import type { WritebackOptions } from './types';

async function postSlackIfConfigured(
  scanId: string,
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; status?: number }> {
  const url = env().NEXLA_SLACK_WEBHOOK_URL;
  if (!url) return { ok: false };
  const summary =
    typeof payload.summary === 'string'
      ? payload.summary
      : `Phalanx remediation shipped — scan ${scanId}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: summary }),
  });
  return { ok: res.ok, status: res.status };
}

export async function writeback(opts: WritebackOptions): Promise<void> {
  const { scanId, targetSystem, artifact, payload } = opts;
  let delivered = false;
  let deliveryDetails: Record<string, unknown> = {};

  if (targetSystem === 'Slack') {
    const res = await postSlackIfConfigured(scanId, payload);
    delivered = res.ok;
    if (res.status !== undefined) deliveryDetails.httpStatus = res.status;
    if (!res.ok) deliveryDetails.note = 'NEXLA_SLACK_WEBHOOK_URL not set — logged only';
  } else {
    deliveryDetails.note = `${targetSystem} connector simulated — production uses Nexla bidirectional`;
  }

  await emitEvent(scanId, {
    source: 'nexla',
    type: 'nexla.writeback',
    data: { targetSystem, artifact, delivered, ...deliveryDetails },
  });
}

export async function writebackAll(
  scanId: string,
  summary: string,
  evidencePayload: Record<string, unknown>,
): Promise<void> {
  const targets: WritebackOptions['targetSystem'][] = [
    'Jira',
    'Slack',
    'ServiceNow',
    'PagerDuty',
  ];
  for (const targetSystem of targets) {
    await writeback({
      scanId,
      targetSystem,
      artifact: summary,
      payload: { summary, ...evidencePayload },
    });
  }
}
