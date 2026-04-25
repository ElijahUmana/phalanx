// Real Nexla API client. Talks to dataops.nexla.io/nexla-api directly via the
// REST API documented at https://docs.nexla.com/reference. The official
// @nexla/sdk has an openapi-fetch import bug as of 0.1.0 so we use fetch
// directly with a thin typed wrapper.

import { env } from '@/lib/env';

const NEXLA_ACCEPT = 'application/vnd.nexla.api.v1+json';

function nexlaUrl(): string {
  return env().NEXLA_API_URL || 'https://dataops.nexla.io/nexla-api';
}

function nexlaToken(): string | undefined {
  return env().NEXLA_ACCESS_TOKEN;
}

export interface NexlaProject {
  id: number;
  name: string;
  description?: string;
  owner?: { id: number; full_name?: string };
}

export interface NexlaFlowSummary {
  id: number;
  name?: string;
  status?: string;
}

async function nexlaFetch(
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  const token = nexlaToken();
  if (!token) {
    throw new Error('NEXLA_ACCESS_TOKEN is not set');
  }
  const url = `${nexlaUrl()}${path}`;
  return fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: NEXLA_ACCEPT,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

export function isNexlaConfigured(): boolean {
  return Boolean(nexlaToken());
}

export async function getNexlaWhoami(): Promise<{ id?: number; email?: string; full_name?: string } | null> {
  if (!isNexlaConfigured()) return null;
  const res = await nexlaFetch('GET', '/users/me');
  if (!res.ok) return null;
  return res.json();
}

export async function listNexlaProjects(): Promise<NexlaProject[]> {
  if (!isNexlaConfigured()) return [];
  const res = await nexlaFetch('GET', '/projects');
  if (!res.ok) return [];
  const data = (await res.json()) as { projects?: NexlaProject[] } | NexlaProject[];
  return Array.isArray(data) ? data : (data.projects ?? []);
}

export async function createNexlaProject(name: string, description: string): Promise<NexlaProject | null> {
  if (!isNexlaConfigured()) return null;
  const res = await nexlaFetch('POST', '/projects', { name, description });
  if (!res.ok) {
    console.warn(`[nexla] createNexlaProject ${name}: HTTP ${res.status}`);
    return null;
  }
  return res.json();
}

export async function ensurePhalanxProject(): Promise<NexlaProject | null> {
  if (!isNexlaConfigured()) return null;
  const projects = await listNexlaProjects();
  const existing = projects.find((p) => p.name === 'Phalanx CVE Response');
  if (existing) return existing;
  return createNexlaProject(
    'Phalanx CVE Response',
    'Autonomous CVE remediation pipelines — CVE feed ingestion + bidirectional remediation writeback.',
  );
}

export async function listNexlaFlows(): Promise<NexlaFlowSummary[]> {
  if (!isNexlaConfigured()) return [];
  const res = await nexlaFetch('GET', '/flows');
  if (!res.ok) return [];
  const data = (await res.json()) as { flows?: NexlaFlowSummary[] };
  return data.flows ?? [];
}
