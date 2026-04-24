// Cross-module event schema. Every lib/* module emits events in this shape via
// emitEvent(scanId, …) from ./emitter. The dashboard subscribes and renders them.

export type EventSource =
  | 'scan'
  | 'tinyfish'
  | 'nexla'
  | 'redis'
  | 'wundergraph'
  | 'ghost'
  | 'insforge'
  | 'chainguard'
  | 'guild'
  | 'x402'
  | 'senso'
  | 'hypothesis';

export interface PhalanxEvent {
  scanId: string;
  type: string;
  source: EventSource;
  timestamp: number;
  data: Record<string, unknown>;
}

export type EmittableEvent = Omit<PhalanxEvent, 'scanId' | 'timestamp'>;

export function channelForScan(scanId: string): string {
  return `scan:events:${scanId}`;
}
