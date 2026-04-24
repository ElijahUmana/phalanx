// POST /api/scan — kicks off a scan workflow and returns a scanId.
// The client opens /api/status?scanId=X as an SSE stream to watch events.

import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { runScan } from '@/lib/scan/orchestrator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BodySchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine(
      (u) => /https?:\/\/(www\.)?github\.com\//i.test(u),
      { message: 'repoUrl must be a GitHub URL (https://github.com/owner/repo)' },
    ),
});

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON body' },
      { status: 400 },
    );
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { repoUrl } = parsed.data;
  const scanId = randomUUID();

  // Kick off orchestrator in background. The SSE endpoint streams progress.
  // We deliberately don't await — the POST response returns immediately so
  // the client can open the SSE connection before events fire.
  queueMicrotask(() => {
    // Tiny delay so the client has time to open the SSE stream before the
    // first event is published. Pub/Sub drops messages without a subscriber.
    setTimeout(() => {
      runScan({ scanId, repoUrl }).catch((err) => {
        console.error(`[scan ${scanId}] failed:`, err);
      });
    }, 500);
  });

  return NextResponse.json({
    scanId,
    streamUrl: `/api/status?scanId=${scanId}`,
  });
}
