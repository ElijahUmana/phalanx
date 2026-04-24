// GET /api/status?scanId=X — Server-Sent Events stream of PhalanxEvents.
// Subscribes to Redis Pub/Sub channel scan:events:{scanId} and forwards
// every event as a standard SSE `data: <json>` frame.

import { type NextRequest } from 'next/server';
import { subscribeScan } from '@/lib/events/emitter';
import type { PhalanxEvent } from '@/lib/events/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

const HEARTBEAT_MS = 15_000;
const STREAM_TIMEOUT_MS = 5 * 60_000;

function encodeSSE(event: PhalanxEvent): Uint8Array {
  const frame = `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`;
  return new TextEncoder().encode(frame);
}

function encodeComment(msg: string): Uint8Array {
  return new TextEncoder().encode(`: ${msg}\n\n`);
}

export async function GET(req: NextRequest) {
  const scanId = req.nextUrl.searchParams.get('scanId');
  if (!scanId) {
    return new Response('Missing scanId', { status: 400 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: Uint8Array) => {
        if (closed) return;
        try {
          controller.enqueue(chunk);
        } catch {
          closed = true;
        }
      };

      // Initial comment so clients get immediate TTFB and treat the stream as open.
      safeEnqueue(encodeComment(`phalanx scan ${scanId} connected`));

      const subscription = subscribeScan(scanId, (event) => {
        safeEnqueue(encodeSSE(event));
        if (event.type === 'scan.complete' || event.type === 'scan.failed') {
          // Let the client render the terminal event, then close.
          setTimeout(() => {
            closed = true;
            try {
              controller.close();
            } catch {}
          }, 100);
        }
      });

      await subscription.ready;

      const heartbeat = setInterval(() => {
        safeEnqueue(encodeComment('heartbeat'));
      }, HEARTBEAT_MS);

      const timeout = setTimeout(() => {
        closed = true;
        try {
          controller.close();
        } catch {}
      }, STREAM_TIMEOUT_MS);

      const cleanup = async () => {
        clearInterval(heartbeat);
        clearTimeout(timeout);
        await subscription.unsubscribe();
      };

      req.signal.addEventListener('abort', () => {
        closed = true;
        cleanup().catch(() => {});
        try {
          controller.close();
        } catch {}
      });

      // When the controller closes (via scan.complete), also release Redis.
      const origClose = controller.close.bind(controller);
      controller.close = () => {
        cleanup().catch(() => {});
        origClose();
      };
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}
