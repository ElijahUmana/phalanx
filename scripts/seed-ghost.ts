/**
 * Phalanx Ghost seed.
 *
 * Populates `phalanx-deps` with:
 *   1. Express 5.2.1's real dependency tree (cloned from github.com/expressjs/express)
 *   2. A synthesized `enterprise-api` service with real historical vulnerable pinned
 *      versions (lodash 4.17.15, minimist 1.2.0, axios 0.21.0, node-fetch 2.6.0, ws 7.4.5,
 *      follow-redirects 1.13.0, jsonwebtoken 8.5.1, express 4.19.1) — every entry corresponds
 *      to a real CVE with real NVD/GHSA data (see seed-data/cves.json).
 *   3. All 8 CVEs from cves.json with pgvector embeddings.
 *
 * Idempotent: re-running is safe (ON CONFLICT DO UPDATE on CVEs, DO NOTHING on deps/services).
 */

import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Client as PgClient } from 'pg';
import { env } from '@/lib/env';
import { getConnectionForPhalanx } from '@/lib/ghost/client';
import { recordCve } from '@/lib/ghost/memory';
import type { CveRecord } from '@/lib/ghost/types';

const ROOT = join(process.cwd());
const EXPRESS_CLONE = join(ROOT, 'tmp-seed', 'express');
const SCAN_ID = `seed-${Date.now()}`;

async function main() {
  env();

  if (!existsSync(EXPRESS_CLONE)) {
    console.log('[seed] cloning expressjs/express into tmp-seed/express ...');
    execFileSync('git', ['clone', '--depth', '1', 'https://github.com/expressjs/express.git', EXPRESS_CLONE], {
      stdio: 'inherit',
    });
  }

  const expressPkg = JSON.parse(readFileSync(join(EXPRESS_CLONE, 'package.json'), 'utf8')) as {
    name: string;
    version: string;
    license: string;
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  const connStr = await getConnectionForPhalanx(SCAN_ID);
  const client = new PgClient({ connectionString: connStr });
  await client.connect();

  try {
    console.log('[seed] inserting express 5.2.1 dependency tree ...');
    const expressId = await insertDependency(client, {
      packageName: expressPkg.name,
      version: expressPkg.version,
      license: expressPkg.license,
      transitiveDeps: Object.keys(expressPkg.dependencies),
      depPath: 'express',
    });

    const depIds: number[] = [expressId];
    for (const [name, range] of Object.entries(expressPkg.dependencies)) {
      const pinned = range.replace(/^[\^~]/, '');
      const id = await insertDependency(client, {
        packageName: name,
        version: pinned,
        license: null,
        transitiveDeps: [],
        depPath: `express.${sanitizeLtree(name)}`,
      });
      depIds.push(id);
    }

    await upsertService(client, {
      name: 'expressjs-upstream',
      repoUrl: 'https://github.com/expressjs/express',
      description: 'Upstream express@5.2.1 dependency tree (seed fixture — safe current versions).',
      dependencyIds: depIds,
    });

    console.log(`[seed]   inserted ${depIds.length} deps for expressjs-upstream`);

    const vulnerableDeps = [
      { name: 'lodash', version: '4.17.15', license: 'MIT' },
      { name: 'minimist', version: '1.2.0', license: 'MIT' },
      { name: 'axios', version: '0.21.0', license: 'MIT' },
      { name: 'node-fetch', version: '2.6.0', license: 'MIT' },
      { name: 'ws', version: '7.4.5', license: 'MIT' },
      { name: 'follow-redirects', version: '1.13.0', license: 'MIT' },
      { name: 'jsonwebtoken', version: '8.5.1', license: 'MIT' },
      { name: 'express', version: '4.19.1', license: 'MIT' },
      { name: 'body-parser', version: '1.20.2', license: 'MIT' },
      { name: 'cors', version: '2.8.5', license: 'MIT' },
      { name: 'helmet', version: '7.1.0', license: 'MIT' },
      { name: 'dotenv', version: '16.3.1', license: 'BSD-2-Clause' },
      { name: 'pg', version: '8.11.3', license: 'MIT' },
      { name: 'redis', version: '4.6.10', license: 'MIT' },
    ];

    const entIds: number[] = [];
    for (const dep of vulnerableDeps) {
      const id = await insertDependency(client, {
        packageName: dep.name,
        version: dep.version,
        license: dep.license,
        transitiveDeps: [],
        depPath: `enterprise-api.${sanitizeLtree(dep.name)}`,
      });
      entIds.push(id);
    }

    await upsertService(client, {
      name: 'enterprise-api',
      repoUrl: 'https://github.com/example-corp/enterprise-api',
      description:
        'Synthesized enterprise Node.js service with historical pinned-vulnerable versions of real packages (lodash 4.17.15, axios 0.21.0, ws 7.4.5, etc.) — each matched by a real CVE entry.',
      dependencyIds: entIds,
    });

    console.log(`[seed]   inserted ${entIds.length} deps for enterprise-api (historical pinned vulnerable versions)`);
  } finally {
    await client.end();
  }

  console.log('[seed] inserting CVE records with embeddings ...');
  const cves = JSON.parse(readFileSync(join(ROOT, 'scripts', 'seed-data', 'cves.json'), 'utf8')) as CveRecord[];
  for (const cve of cves) {
    await recordCve(SCAN_ID, cve);
    console.log(`[seed]   ${cve.cveId} (${cve.severity}, cvss ${cve.cvssScore})`);
  }
  console.log(`[seed] inserted ${cves.length} CVE records`);

  console.log('[seed] done');
}

function sanitizeLtree(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, '_');
}

async function insertDependency(
  client: PgClient,
  dep: { packageName: string; version: string; license: string | null; transitiveDeps: string[]; depPath: string },
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO dependencies (package_name, version, registry, license, transitive_deps, dep_path)
     VALUES ($1, $2, 'npm', $3, $4, $5::ltree)
     ON CONFLICT (package_name, version, registry) DO UPDATE SET
       license = EXCLUDED.license,
       transitive_deps = EXCLUDED.transitive_deps,
       dep_path = EXCLUDED.dep_path
     RETURNING id`,
    [dep.packageName, dep.version, dep.license, JSON.stringify(dep.transitiveDeps), dep.depPath],
  );
  return result.rows[0].id;
}

async function upsertService(
  client: PgClient,
  svc: { name: string; repoUrl: string; description: string; dependencyIds: number[] },
): Promise<number> {
  const result = await client.query<{ id: number }>(
    `INSERT INTO services (name, repo_url, description, dependency_ids)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (name) DO UPDATE SET
       repo_url = EXCLUDED.repo_url,
       description = EXCLUDED.description,
       dependency_ids = EXCLUDED.dependency_ids
     RETURNING id`,
    [svc.name, svc.repoUrl, svc.description, svc.dependencyIds],
  );
  return result.rows[0].id;
}

main().catch((err) => {
  console.error('[seed] FAILED:', err);
  process.exit(1);
});
