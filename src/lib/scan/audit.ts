// Phase 0 — on-demand audit. Fetches package.json from the user's GitHub
// repo via the public API and parses the direct dependencies. No auth
// required for public repos. Falls back to the demo package set if the
// GitHub call fails so the demo never blocks on a transient network error.

import { emitEvent } from '@/lib/events/emitter';

export interface Package {
  name: string;
  version: string;
  registry: string;
}

export interface AuditResult {
  packages: Package[];
  manifestFiles: string[];
  repoUrl: string;
  usedFallback: boolean;
}

const FALLBACK_PACKAGES: Package[] = [
  { name: 'lodash', version: '4.17.15', registry: 'npm' },
  { name: 'express', version: '4.18.2', registry: 'npm' },
  { name: 'react', version: '18.2.0', registry: 'npm' },
  { name: 'axios', version: '1.4.0', registry: 'npm' },
  { name: 'minimist', version: '1.2.5', registry: 'npm' },
];

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/i);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

async function fetchPackageJson(owner: string, repo: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/contents/package.json`,
    { headers: { Accept: 'application/vnd.github.v3+json' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { content?: string; encoding?: string };
  if (!body.content || body.encoding !== 'base64') return null;
  try {
    const decoded = Buffer.from(body.content, 'base64').toString('utf8');
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractDependencies(pkg: Record<string, unknown>): Package[] {
  const deps: Package[] = [];
  const sections = ['dependencies', 'devDependencies', 'peerDependencies'];
  for (const s of sections) {
    const v = pkg[s];
    if (!v || typeof v !== 'object') continue;
    for (const [name, version] of Object.entries(v as Record<string, unknown>)) {
      if (typeof version !== 'string') continue;
      deps.push({
        name,
        version: version.replace(/^[~^]/, ''),
        registry: 'npm',
      });
    }
  }
  return deps;
}

export async function auditRepo(scanId: string, repoUrl: string): Promise<AuditResult> {
  const parsed = parseGithubUrl(repoUrl);
  let packages: Package[] = [];
  let usedFallback = false;
  if (parsed) {
    try {
      const pkg = await fetchPackageJson(parsed.owner, parsed.repo);
      if (pkg) packages = extractDependencies(pkg);
    } catch (err) {
      console.warn('[audit] fetchPackageJson failed:', err);
    }
  }
  if (packages.length === 0) {
    packages = FALLBACK_PACKAGES;
    usedFallback = true;
  }

  await emitEvent(scanId, {
    source: 'scan',
    type: 'deps.parsed',
    data: {
      repoUrl,
      manifestFiles: ['package.json'],
      totalPackages: packages.length,
      packages: packages.slice(0, 20),
      usedFallback,
    },
  });

  return { packages, manifestFiles: ['package.json'], repoUrl, usedFallback };
}
