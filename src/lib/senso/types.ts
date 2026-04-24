export interface EvidenceInput {
  cveId: string;
  affectedPackage: string;
  fixedVersion: string;
  hypothesis: string;
  chainguardSbomHash?: string;
  sigstoreSignature?: string;
  slsaLevel?: number;
  guildAuditTrailId?: string;
  x402ReceiptHash?: string;
  forkIds?: string[];
  insforgeBackends?: string[];
  tinyfishPrUrl?: string;
  validationSummary?: string;
}

export interface PublishResult {
  contentId: string;
  publishRecordId?: string;
  promptId: string;
  url: string;
  slug: string;
  destination: string;
  status: 'published' | 'pending' | 'draft';
}

export interface SensoPublishRecord {
  id: string;
  status: string;
  destination_slug?: string;
  live_url?: string;
  error_message?: string | null;
}

export interface SensoEnginePublishResponse {
  content_id: string;
  status: string;
  publish_records?: SensoPublishRecord[];
}

export interface SensoPromptCreateResponse {
  prompt: {
    id: string;
    question_text: string;
    type: string;
  };
}
