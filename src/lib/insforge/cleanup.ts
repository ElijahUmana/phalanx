// Tears down a staging backend (DELETEs the staging_backends row and drops
// the in-memory entry). Called when a hypothesis is cancelled mid-flight
// or after the scan completes.

import { emitEvent } from '@/lib/events/emitter';
import { getInsForgeClient } from './client';
import { getBackend } from './provisioner';

const STAGING_TABLE = 'staging_backends';

export async function cleanupBackend(
  scanId: string,
  backendId: string,
  reason: 'cancelled' | 'scan-complete' | 'failure' = 'scan-complete',
): Promise<void> {
  const backend = getBackend(backendId);
  if (!backend) {
    console.warn(
      `[insforge] cleanupBackend: no backend registered with id=${backendId}`,
    );
  }

  try {
    const client = getInsForgeClient();
    await client.database.from(STAGING_TABLE).delete().eq('backend_id', backendId);
  } catch (err) {
    console.warn(`[insforge] cleanupBackend DB delete failed:`, err);
  }

  await emitEvent(scanId, {
    source: 'insforge',
    type: 'insforge.cleanup',
    data: { backendId, reason },
  });
}
