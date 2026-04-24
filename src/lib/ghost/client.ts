import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Client as PgClient } from 'pg';
import { env } from '@/lib/env';
import { emitEvent } from '@/lib/events/emitter';
import type {
  Dependency,
  GhostDatabase,
  GhostFork,
  PatchResultInput,
} from './types';

const execFile = promisify(execFileCb);

async function ghostCli(args: string[]): Promise<string> {
  const { stdout } = await execFile('ghost', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function listDatabases(_scanId: string): Promise<GhostDatabase[]> {
  const out = await ghostCli(['list', '--json']);
  const parsed = JSON.parse(out) as GhostDatabase[];
  return parsed;
}

export async function getConnectionString(
  _scanId: string,
  dbName: string,
): Promise<string> {
  const out = await ghostCli(['connect', dbName]);
  const connStr = out.trim();
  if (!connStr.startsWith('postgres')) {
    throw new Error(`Ghost connect returned unexpected output for "${dbName}": ${connStr}`);
  }
  return connStr;
}

export interface CreateForkOptions {
  forkName?: string;
  hypothesis?: string;
  cveId?: string;
}

export async function createFork(
  scanId: string,
  sourceDb: string,
  opts: CreateForkOptions = {},
): Promise<GhostFork> {
  await emitEvent(scanId, {
    source: 'ghost',
    type: 'ghost.fork.started',
    data: {
      forkId: null,
      hypothesis: opts.hypothesis ?? null,
      cveId: opts.cveId ?? null,
      parentDb: sourceDb,
    },
  });

  const started = Date.now();
  const args = ['fork', sourceDb, '--wait', '--json'];
  if (opts.forkName) args.push('--name', opts.forkName);

  const out = await ghostCli(args);
  const parsed = JSON.parse(out) as { id: string; name: string; connection: string };
  if (!parsed.id || !parsed.connection) {
    throw new Error(`Ghost fork returned malformed output: ${out}`);
  }

  await emitEvent(scanId, {
    source: 'ghost',
    type: 'ghost.fork.complete',
    data: {
      forkId: parsed.id,
      forkName: parsed.name,
      parentDb: sourceDb,
      hypothesis: opts.hypothesis ?? null,
      cveId: opts.cveId ?? null,
      durationMs: Date.now() - started,
    },
  });

  return parsed;
}

export async function deleteFork(
  _scanId: string,
  forkNameOrId: string,
): Promise<void> {
  await execFile('ghost', ['delete', forkNameOrId, '--confirm'], {
    encoding: 'utf8',
  });
}

export async function listForks(
  scanId: string,
  prefix: string,
): Promise<GhostDatabase[]> {
  const all = await listDatabases(scanId);
  return all.filter((db) => db.name.startsWith(prefix));
}

export async function withPg<T>(
  _scanId: string,
  connectionString: string,
  fn: (client: PgClient) => Promise<T>,
): Promise<T> {
  const client = new PgClient({ connectionString });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function queryDeps(
  scanId: string,
  connectionString: string,
  packageName: string,
): Promise<Dependency[]> {
  return withPg(scanId, connectionString, async (client) => {
    const result = await client.query<{
      id: number;
      package_name: string;
      version: string;
      registry: string;
      license: string | null;
      transitive_deps: string[];
      dep_path: string | null;
      introduced_at: Date;
    }>(
      `SELECT id, package_name, version, registry, license, transitive_deps, dep_path, introduced_at
       FROM dependencies
       WHERE package_name = $1
       ORDER BY version DESC`,
      [packageName],
    );
    return result.rows.map((r) => ({
      id: r.id,
      packageName: r.package_name,
      version: r.version,
      registry: r.registry,
      license: r.license,
      transitiveDeps: r.transitive_deps,
      depPath: r.dep_path,
      introducedAt: r.introduced_at.toISOString(),
    }));
  });
}

export async function countDeps(
  scanId: string,
  connectionString: string,
): Promise<number> {
  return withPg(scanId, connectionString, async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM dependencies',
    );
    return Number(result.rows[0].count);
  });
}

export async function writePatchResult(
  scanId: string,
  connectionString: string,
  input: PatchResultInput,
): Promise<number> {
  return withPg(scanId, connectionString, async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO patch_results (cve_id, hypothesis, fork_id, outcome, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.cveId, input.hypothesis, input.forkId, input.outcome, input.details],
    );
    return result.rows[0].id;
  });
}

export async function getConnectionForPhalanx(scanId: string): Promise<string> {
  return getConnectionString(scanId, env().GHOST_DB_NAME);
}
