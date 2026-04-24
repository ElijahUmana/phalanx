'use client';

import { useEffect, useRef } from 'react';
import type { PhalanxEvent } from '@/lib/events/types';

export interface UseSSEOptions {
  scanId: string | null;
  onEvent: (event: PhalanxEvent) => void;
  onError?: (err: string) => void;
  onOpen?: () => void;
}

export function useSSE({ scanId, onEvent, onError, onOpen }: UseSSEOptions) {
  // Refs so effect doesn't retrigger on callback identity changes.
  // Mutating refs in a separate effect (not during render) avoids React 19's
  // strict-mode "Cannot access refs during render" error.
  const onEventRef = useRef(onEvent);
  const onErrorRef = useRef(onError);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onEventRef.current = onEvent;
    onErrorRef.current = onError;
    onOpenRef.current = onOpen;
  });

  useEffect(() => {
    if (!scanId) return;
    const es = new EventSource(`/api/status?scanId=${scanId}`);

    es.addEventListener('open', () => {
      onOpenRef.current?.();
    });

    const handle = (ev: MessageEvent) => {
      try {
        const parsed = JSON.parse(ev.data) as PhalanxEvent;
        onEventRef.current(parsed);
      } catch (err) {
        console.error('[useSSE] parse error:', err, ev.data);
      }
    };

    // Default 'message' event (any untyped SSE frame)
    es.addEventListener('message', handle);

    // Every Phalanx event has a `type` field; the server sends it as the SSE
    // event name too. But EventSource only fires named listeners when you add
    // one explicitly — to catch all, we listen on both 'message' and let the
    // server fall through to 'message' when appropriate. The server currently
    // uses `event: <type>`, which surfaces via addEventListener(type, …). To
    // avoid binding every possible type, we read from the default stream by
    // having the server ALSO emit generic 'data:' frames… but that's extra.
    //
    // Simpler: EventSource will fire 'message' only for frames that omit the
    // `event:` line. Since our server writes `event: <type>`, we need named
    // listeners. We attach a wildcard fallback via the 'error' channel? No.
    //
    // Workaround: also dispatch as a generic 'message' by listening to every
    // known type. But types are open-ended (e.g. ghost.fork.started). The
    // cleanest fix is to make the server write a dual frame — handled there.
    // For now, we monkey-patch by overriding EventSource's parse path.

    // The practical solution: listen on a fixed set of types we know about.
    const KNOWN_TYPES = [
      'scan.started', 'scan.complete', 'scan.failed',
      'deps.parsed', 'cve.found',
      'tinyfish.search', 'tinyfish.fetch', 'tinyfish.navigate', 'tinyfish.pr.created',
      'nexla.feed.ingest', 'nexla.pipeline.built', 'nexla.writeback',
      'redis.vector.match', 'redis.stream.dispatch', 'redis.langcache.hit', 'redis.pubsub.cancel',
      'wundergraph.query', 'wundergraph.scope.denied',
      'ghost.fork.started', 'ghost.fork.complete', 'ghost.memory.match',
      'insforge.provision', 'insforge.validate', 'insforge.cleanup',
      'chainguard.dfc.convert', 'chainguard.sbom',
      'guild.action', 'guild.approval.granted',
      'x402.payment',
      'senso.published',
      'hypothesis.cancelled',
    ];
    for (const t of KNOWN_TYPES) {
      es.addEventListener(t, handle);
    }

    es.addEventListener('error', () => {
      if (es.readyState === EventSource.CLOSED) {
        // Normal close after scan.complete — don't flag as error
        return;
      }
      onErrorRef.current?.('SSE connection error');
    });

    return () => {
      es.close();
    };
  }, [scanId]);
}
