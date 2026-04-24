import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';
import { Client as PgClient } from 'pg';
import { env } from '@/lib/env';
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

export async function listDatabases(): Promise<GhostDatabase[]> {
  const out = await ghostCli(['list', '--json']);
  const parsed = JSON.parse(out) as GhostDatabase[];
  return parsed;
}

export async function getConnectionString(dbName: string): Promise<string> {
  const out = await ghostCli(['connect', dbName]);
  const connStr = out.trim();
  if (!connStr.startsWith('postgres')) {
    throw new Error(`Ghost connect returned unexpected output for "${dbName}": ${connStr}`);
  }
  return connStr;
}

export async function createFork(
  sourceDb: string,
  forkName?: string,
): Promise<GhostFork> {
  const args = ['fork', sourceDb, '--wait', '--json'];
  if (forkName) args.push('--name', forkName);
  const out = await ghostCli(args);
  const parsed = JSON.parse(out) as { id: string; name: string; connection: string };
  if (!parsed.id || !parsed.connection) {
    throw new Error(`Ghost fork returned malformed output: ${out}`);
  }
  return parsed;
}

export async function deleteFork(forkNameOrId: string): Promise<void> {
  await execFile('ghost', ['delete', forkNameOrId, '--confirm'], {
    encoding: 'utf8',
  });
}

export async function listForks(prefix: string): Promise<GhostDatabase[]> {
  const all = await listDatabases();
  return all.filter((db) => db.name.startsWith(prefix));
}

async function withPg<T>(
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
  connectionString: string,
  packageName: string,
): Promise<Dependency[]> {
  return withPg(connectionString, async (client) => {
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

export async function countDeps(connectionString: string): Promise<number> {
  return withPg(connectionString, async (client) => {
    const result = await client.query<{ count: string }>(
      'SELECT COUNT(*)::text AS count FROM dependencies',
    );
    return Number(result.rows[0].count);
  });
}

export async function writePatchResult(
  connectionString: string,
  input: PatchResultInput,
): Promise<number> {
  return withPg(connectionString, async (client) => {
    const result = await client.query<{ id: number }>(
      `INSERT INTO patch_results (cve_id, hypothesis, fork_id, outcome, details)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [input.cveId, input.hypothesis, input.forkId, input.outcome, input.details],
    );
    return result.rows[0].id;
  });
}

export async function getConnectionForPhalanx(): Promise<string> {
  return getConnectionString(env().GHOST_DB_NAME);
}

export { withPg };
