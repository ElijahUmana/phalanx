export interface InvestigationPayload {
  cveId: string;
  severity: 'critical' | 'high' | 'medium' | 'low' | 'informational';
  description: string;
  affectedPackages: Array<{ name: string; versionRange: string }>;
  serviceName: string;
  enqueuedAt: string;
}

export interface InvestigationMessage {
  streamId: string;
  payload: InvestigationPayload;
}

export type CancelReason = 'false_positive' | 'user_abort' | 'timeout' | 'superseded';

export interface CancelEvent {
  cveId: string;
  reason: CancelReason;
  broadcastAt: string;
}

export interface CveVectorHit {
  cveId: string;
  similarity: number;
}

export interface CacheHit {
  hit: true;
  response: string;
  similarity: number;
  matchedPrompt: string;
}

export interface CacheMiss {
  hit: false;
}

export type CacheResult = CacheHit | CacheMiss;

export interface CacheStats {
  hits: number;
  misses: number;
  rate: number;
}
