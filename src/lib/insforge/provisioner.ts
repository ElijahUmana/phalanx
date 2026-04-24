// Provisions a per-hypothesis staging "backend" inside the shared InsForge
// project. Conceptually each hypothesis gets its own isolated namespace
// (table row + unique URL slug). Real InsForge doesn't expose admin APIs
// to spin up whole new projects at runtime, so we reach the same logical
// outcome — isolated per-hypothesis state bound to a public URL — using
// rows in a `staging_backends` table.
//
// If the table doesn't exist in the project yet, we fall back to an
// in-process registry so the orchestrator can still complete the flow.
// The fallback is logged loudly so setup gaps don't hide.

import { randomUUID } from 'node:crypto';
import { emitEvent } from '@/lib/events/emitter';
import { getInsForgeClient, getInsForgeConfig } from './client';
import type { StagingBackend } from './types';

const STAGING_TABLE = 'staging_backends';

const inMemoryRegistry = new Map<string, StagingBackend>();

function buildBackendUrl(cfg: { ossHost: string }, backendId: string): string {
  return `${cfg.ossHost}/staging/${backendId}`;
}

export async function provisionBackend(
  scanId: string,
  forkId: string,
  hypothesisName: string,
): Promise<StagingBackend> {
  const cfg = getInsForgeConfig();
  const backendId = `insforge-${forkId}-${randomUUID().slice(0, 6)}`;
  const now = new Date().toISOString();
  const record: StagingBackend = {
    backendId,
    scanId,
    forkId,
    hypothesisName,
    url: buildBackendUrl(cfg, backendId),
    provisionedAt: now,
    status: 'ready',
  };

  let persistedViaInsForge = false;
  try {
    const client = getInsForgeClient();
    const { error } = await client.database
      .from(STAGING_TABLE)
      .insert({
        backend_id: record.backendId,
        scan_id: record.scanId,
        fork_id: record.forkId,
        hypothesis_name: record.hypothesisName,
        url: record.url,
        status: record.status,
        provisioned_at: record.provisionedAt,
      });
    if (error) {
      console.warn(
        `[insforge] provisionBackend: insert into ${STAGING_TABLE} failed (${error.code ?? 'unknown'}: ${error.message}), falling back to in-memory registry. Create the table to persist.`,
      );
    } else {
      persistedViaInsForge = true;
    }
  } catch (err) {
    console.warn(
      '[insforge] provisionBackend: SDK call threw, using in-memory registry:',
      err,
    );
  }

  inMemoryRegistry.set(backendId, record);

  await emitEvent(scanId, {
    source: 'insforge',
    type: 'insforge.provision',
    data: {
      backendId,
      forkId,
      url: record.url,
      hypothesisName,
      projectId: cfg.projectId,
      persistedViaInsForge,
    },
  });

  return record;
}

export function getBackend(backendId: string): StagingBackend | undefined {
  return inMemoryRegistry.get(backendId);
}

export function getBackendsForScan(scanId: string): StagingBackend[] {
  return [...inMemoryRegistry.values()].filter((b) => b.scanId === scanId);
}

export function registerBackend(backend: StagingBackend): void {
  inMemoryRegistry.set(backend.backendId, backend);
}
