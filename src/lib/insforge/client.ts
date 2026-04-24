import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type InsForgeClient } from '@insforge/sdk';
import type { InsForgeProjectConfig } from './types';

let cachedConfig: InsForgeProjectConfig | null = null;
let cachedClient: InsForgeClient | null = null;

export function getInsForgeConfig(): InsForgeProjectConfig {
  if (cachedConfig) return cachedConfig;
  const raw = readFileSync(join(process.cwd(), '.insforge', 'project.json'), 'utf8');
  const parsed = JSON.parse(raw) as {
    project_id: string;
    appkey: string;
    region: string;
    oss_host: string;
    api_key: string;
  };
  cachedConfig = {
    projectId: parsed.project_id,
    appKey: parsed.appkey,
    region: parsed.region,
    ossHost: parsed.oss_host,
    apiKey: parsed.api_key,
  };
  return cachedConfig;
}

export function getInsForgeClient(): InsForgeClient {
  if (cachedClient) return cachedClient;
  const cfg = getInsForgeConfig();
  cachedClient = createClient({
    baseUrl: cfg.ossHost,
    anonKey: cfg.apiKey,
    isServerMode: true,
  });
  return cachedClient;
}
