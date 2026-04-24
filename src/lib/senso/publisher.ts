/**
 * Publish evidence packages to cited.md via the Senso CLI + direct API.
 *
 * cited.md shared destination publisher_id: afa1052b-8226-438c-855d-2aae1a8754b1 (slug cited-md).
 * The Senso engine requires a `geo_question_id` (prompt) per publish, and the
 * destination must be `active` in org content-generation settings. We ensure
 * both on-demand so this module works against a fresh org.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { emitEvent } from '@/lib/events/emitter';
import { env } from '@/lib/env';
import type {
  EvidenceInput,
  PublishResult,
} from './types';

const execFile = promisify(execFileCb);

export const CITED_MD_PUBLISHER_ID = 'afa1052b-8226-438c-895e-335dcf21743a';
export const SENSO_API_BASE = 'https://apiv2.senso.ai/api/v1';

async function senso(args: string[]): Promise<string> {
  const { stdout } = await execFile('senso', [...args, '--output', 'json', '--quiet'], {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      SENSO_API_KEY: env().SENSO_API_KEY,
    },
  });
  return stdout;
}

function extractJson<T>(raw: string): T {
  const trimmed = raw.trim();
  const firstBrace = trimmed.search(/[{\[]/);
  if (firstBrace === -1) {
    throw new Error(`senso CLI returned non-JSON output: ${trimmed.slice(0, 500)}`);
  }
  return JSON.parse(trimmed.slice(firstBrace)) as T;
}

async function sensoApi<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(`${SENSO_API_BASE}${path}`, {
    method,
    headers: {
      'X-API-Key': env().SENSO_API_KEY,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Senso API ${method} ${path} → ${response.status}: ${text}`);
  }
  return (await response.json()) as T;
}

interface SensoContentGenerationSettings {
  enable_content_generation: boolean;
  publishers: Array<{ publisher_id: string; slug: string; active: boolean }>;
}

export async function ensureCitedMdEnabled(): Promise<void> {
  const settings = await sensoApi<SensoContentGenerationSettings>(
    'GET',
    '/org/content-generation',
  );
  const alreadyActive = settings.publishers?.some(
    (p) => p.publisher_id === CITED_MD_PUBLISHER_ID && p.active,
  );
  if (settings.enable_content_generation && alreadyActive) return;

  const existingIds = (settings.publishers ?? [])
    .filter((p) => p.active)
    .map((p) => p.publisher_id);
  const newIds = existingIds.includes(CITED_MD_PUBLISHER_ID)
    ? existingIds
    : [...existingIds, CITED_MD_PUBLISHER_ID];

  await sensoApi('PATCH', '/org/content-generation', {
    enable_content_generation: true,
    publisher_ids: newIds,
  });
}

export function buildSlug(cveId: string): string {
  return `${cveId.toLowerCase()}-remediation`;
}

export function buildSeoTitle(input: EvidenceInput): string {
  return `${input.cveId} remediated: upgrade ${input.affectedPackage} to ${input.fixedVersion}`;
}

export function buildEvidenceMarkdown(input: EvidenceInput): string {
  const lines: string[] = [];
  lines.push(`# ${input.cveId} — Phalanx Remediation Evidence`);
  lines.push('');
  lines.push(`**Affected package:** \`${input.affectedPackage}\``);
  lines.push(`**Remediation:** ${input.hypothesis}`);
  lines.push(`**Fixed in:** \`${input.fixedVersion}\``);
  lines.push('');
  lines.push('## Cryptographic provenance');
  lines.push('');
  if (input.chainguardSbomHash) {
    lines.push(`- **Chainguard SBOM hash:** \`${input.chainguardSbomHash}\``);
  }
  if (input.sigstoreSignature) {
    lines.push(`- **Sigstore signature:** \`${input.sigstoreSignature}\``);
  }
  if (typeof input.slsaLevel === 'number') {
    lines.push(`- **SLSA provenance level:** ${input.slsaLevel}`);
  }
  if (input.guildAuditTrailId) {
    lines.push(`- **Guild audit trail id:** \`${input.guildAuditTrailId}\``);
  }
  if (input.x402ReceiptHash) {
    lines.push(`- **x402 receipt hash (Base Sepolia):** \`${input.x402ReceiptHash}\``);
  }
  lines.push('');
  lines.push('## Parallel speculation');
  lines.push('');
  if (input.forkIds?.length) {
    lines.push(`Ghost zero-copy forks explored: ${input.forkIds.map((f) => `\`${f}\``).join(', ')}`);
  }
  if (input.insforgeBackends?.length) {
    lines.push('');
    lines.push(`InsForge per-hypothesis backends: ${input.insforgeBackends.map((b) => `\`${b}\``).join(', ')}`);
  }
  if (input.validationSummary) {
    lines.push('');
    lines.push('### Validation summary');
    lines.push('');
    lines.push(input.validationSummary);
  }
  if (input.tinyfishPrUrl) {
    lines.push('');
    lines.push('## Pull request');
    lines.push('');
    lines.push(`The remediation patch was filed by the TinyFish web agent: ${input.tinyfishPrUrl}`);
  }
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('Published by Phalanx — parallel-fork CVE response fabric.');
  return lines.join('\n');
}

interface SensoPromptItem {
  prompt_id: string;
  text: string;
}
interface SensoPromptList {
  prompts: SensoPromptItem[];
}
interface SensoPromptCreated {
  prompt_id: string;
  text: string;
  type: string;
}

async function createUniquePrompt(questionText: string): Promise<string> {
  // Each publication creates its own geo_question. A geo_question may only be
  // linked to one content item, so reusing a prompt across scans triggers
  // "content linkage conflict". One scan → one prompt → one evidence record.
  const createRaw = await senso([
    'prompts',
    'create',
    '--data',
    JSON.stringify({ question_text: questionText, type: 'decision' }),
  ]);
  const created = extractJson<SensoPromptCreated>(createRaw);
  if (!created.prompt_id) {
    throw new Error(`senso prompts create returned no prompt_id: ${createRaw}`);
  }
  return created.prompt_id;
}

interface SensoEnginePublishOutcome {
  content_id: string;
  version_id: string;
  publish_status: string;
  editorial_status: string;
  publish_destinations: Array<{
    publisher: string;
    display_url: string;
    status: string;
  }>;
}

export async function publishEvidence(
  scanId: string,
  input: EvidenceInput,
): Promise<PublishResult> {
  await ensureCitedMdEnabled();

  const slug = buildSlug(input.cveId);
  const seoTitle = buildSeoTitle(input);
  const markdown = buildEvidenceMarkdown(input);
  const nonce = scanId.slice(-8);
  const question = `How should ${input.cveId} in ${input.affectedPackage} be remediated? (scan ${nonce})`;

  const promptId = await createUniquePrompt(question);

  const publishRaw = await senso([
    'engine',
    'publish',
    '--data',
    JSON.stringify({
      geo_question_id: promptId,
      raw_markdown: markdown,
      seo_title: seoTitle,
      summary: `${input.cveId} fixed by upgrading ${input.affectedPackage} to ${input.fixedVersion}.`,
      publisher_ids: [CITED_MD_PUBLISHER_ID],
    }),
  ]);

  const response = extractJson<SensoEnginePublishOutcome>(publishRaw);
  if (!response.content_id) {
    throw new Error(`senso engine publish returned no content_id: ${publishRaw}`);
  }

  const citedDest = response.publish_destinations?.find(
    (d) => d.publisher === 'cited-md' || d.publisher === 'cited.md',
  );
  const liveUrl = citedDest?.display_url ?? `https://cited.md/article/${response.content_id}`;
  const status: PublishResult['status'] =
    response.editorial_status === 'published' || citedDest?.status === 'success'
      ? 'published'
      : response.editorial_status === 'draft'
        ? 'draft'
        : 'pending';

  const result: PublishResult = {
    contentId: response.content_id,
    promptId,
    url: liveUrl,
    slug,
    destination: 'cited.md',
    status,
  };

  await emitEvent(scanId, {
    source: 'senso',
    type: 'senso.published',
    data: {
      cveId: input.cveId,
      contentId: result.contentId,
      url: result.url,
      slug: result.slug,
      status: result.status,
      publishStatus: response.publish_status,
    },
  });

  return result;
}
