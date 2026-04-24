// Malicious-content scanner. Primary path is `mal` (malcontent, YARA-X based
// with ~14,500+ rules). Chainguard's hardened-skill-catalog narrative depends on
// this — candidate replacement packages get scanned for known IoCs before the
// remediator can pick them.
//
// Fallback path: when malcontent is unavailable, fall back to a prebuilt
// fixture. Like the SBOM fallback, this is explicit (`mode: 'fixture'`) so the
// orchestrator can reason about confidence.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { emitEvent } from '@/lib/events/emitter';
import type { MalcontentHit, ScanResult } from './types';

const execFileAsync = promisify(execFile);
const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');

const RISK_LEVEL_WEIGHT: Record<string, number> = {
    CRITICAL: 10,
    HIGH: 7,
    MEDIUM: 4,
    LOW: 1,
    INFORMATIONAL: 0,
};

/**
 * Scan a filesystem path (typically an extracted package) for IoCs.
 * Emits `chainguard.scan` on completion.
 */
export async function scanPackages(
    scanId: string,
    target: string,
    opts: { fixtureFallback?: boolean } = {},
): Promise<ScanResult> {
    const resolved = path.resolve(target);
    const useFallback = opts.fixtureFallback !== false;

    const startedAt = Date.now();
    try {
        const { stdout } = await execFileAsync(
            'mal',
            ['scan', '--format', 'json', resolved],
            { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
        );
        const parsed = parseMalcontentOutput(stdout);
        const durationMs = Date.now() - startedAt;
        const result: ScanResult = {
            target: resolved,
            mode: 'malcontent',
            hits: parsed.hits,
            riskScore: parsed.riskScore,
            summary: parsed.summary,
            durationMs,
        };
        await emitEvent(scanId, {
            type: 'chainguard.scan',
            source: 'chainguard',
            data: {
                target: resolved,
                mode: 'malcontent',
                hits: parsed.hits.length,
                riskScore: parsed.riskScore,
                durationMs,
            },
        });
        return result;
    } catch (err) {
        if (!useFallback) {
            throw err;
        }
        const fallback = await loadScanFixture(resolved);
        await emitEvent(scanId, {
            type: 'chainguard.scan',
            source: 'chainguard',
            data: {
                target: resolved,
                mode: 'fixture',
                hits: fallback.hits.length,
                riskScore: fallback.riskScore,
                fallbackReason: err instanceof Error ? err.message : String(err),
            },
        });
        return fallback;
    }
}

interface MalcontentOutput {
    hits: MalcontentHit[];
    riskScore: number;
    summary: string;
}

function parseMalcontentOutput(raw: string): MalcontentOutput {
    if (!raw.trim()) {
        return { hits: [], riskScore: 0, summary: 'No hits.' };
    }
    // malcontent emits a JSON object with per-file "files" map; each file has
    // "behaviors" with "risk_level" + "rule_name" + "description" + "category".
    // We normalize that into our MalcontentHit shape regardless of how nested
    // the payload is, since field names have shifted across minor versions.
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch {
        return { hits: [], riskScore: 0, summary: 'Non-JSON malcontent output.' };
    }

    const hits: MalcontentHit[] = [];
    walk(parsed, (node: Record<string, unknown>) => {
        const rule = node['rule_name'] ?? node['ruleName'] ?? node['name'];
        if (typeof rule !== 'string') return;
        const severityRaw = node['risk_level'] ?? node['riskLevel'] ?? node['severity'];
        const severity = normalizeSeverity(severityRaw);
        if (!severity) return;
        const category = typeof node['category'] === 'string' ? node['category'] : 'uncategorized';
        const description = typeof node['description'] === 'string' ? node['description'] : null;
        const hitPath =
            typeof node['path'] === 'string'
                ? node['path']
                : typeof node['file'] === 'string'
                  ? node['file']
                  : 'unknown';
        hits.push({ path: hitPath, ruleName: rule, severity, category, description });
    });

    const riskScore = hits.reduce((sum, h) => sum + (RISK_LEVEL_WEIGHT[h.severity] ?? 0), 0);
    const summary =
        hits.length === 0
            ? 'No hits.'
            : `${hits.length} hits (${hits.filter((h) => h.severity === 'CRITICAL').length} CRITICAL, ${
                  hits.filter((h) => h.severity === 'HIGH').length
              } HIGH)`;

    return { hits, riskScore, summary };
}

function walk(node: unknown, visit: (obj: Record<string, unknown>) => void): void {
    if (node === null || node === undefined) return;
    if (Array.isArray(node)) {
        for (const item of node) walk(item, visit);
        return;
    }
    if (typeof node === 'object') {
        const record = node as Record<string, unknown>;
        visit(record);
        for (const value of Object.values(record)) walk(value, visit);
    }
}

function normalizeSeverity(raw: unknown): MalcontentHit['severity'] | null {
    if (typeof raw !== 'string') return null;
    const up = raw.toUpperCase();
    if (up.includes('CRIT')) return 'CRITICAL';
    if (up.includes('HIGH')) return 'HIGH';
    if (up.includes('MED')) return 'MEDIUM';
    if (up.includes('LOW')) return 'LOW';
    if (up.includes('INFO')) return 'INFORMATIONAL';
    return null;
}

async function loadScanFixture(target: string): Promise<ScanResult> {
    const fixturePath = path.join(FIXTURES_DIR, 'malcontent-scan.json');
    const raw = JSON.parse(await fs.readFile(fixturePath, 'utf8')) as {
        hits: MalcontentHit[];
        riskScore: number;
        summary: string;
    };
    return {
        target,
        mode: 'fixture',
        hits: raw.hits,
        riskScore: raw.riskScore,
        summary: raw.summary,
        durationMs: 0,
    };
}
