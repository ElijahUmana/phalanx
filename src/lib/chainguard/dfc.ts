// DFC wrapper — converts an arbitrary Dockerfile to use Chainguard base images.
// Shells out to the `dfc` CLI (install: `brew install chainguard-dev/tap/dfc`).
// Emits chainguard.dfc.convert on completion so the dashboard renders the
// before/after + diff as a live demo panel.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { emitEvent } from '@/lib/events/emitter';
import type { DFCResult } from './types';

const execFileAsync = promisify(execFile);

const FROM_LINE_REGEX = /^FROM\s+(\S+)(?:\s+AS\s+\S+)?/im;

/**
 * Convert a Dockerfile to use Chainguard base images.
 *
 * @param scanId orchestrator scan id for event correlation
 * @param inputPath absolute path to the source Dockerfile
 * @param opts.strict fail if any package has no Chainguard mapping
 * @param opts.org organization namespace for cgr.dev/<org> (default ORG)
 */
export async function convertDockerfile(
    scanId: string,
    inputPath: string,
    opts: { strict?: boolean; org?: string } = {},
): Promise<DFCResult> {
    const resolvedPath = path.resolve(inputPath);
    const before = await fs.readFile(resolvedPath, 'utf8');
    const beforeImage = parseFromImage(before);

    const args: string[] = [];
    if (opts.strict) args.push('--strict');
    if (opts.org) args.push('--org', opts.org);
    args.push(resolvedPath);

    const startedAt = Date.now();
    const { stdout } = await execFileAsync('dfc', args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
    const durationMs = Date.now() - startedAt;

    const after = stdout;
    const afterImage = parseFromImage(after);
    const diff = buildUnifiedDiff(before, after, resolvedPath);

    const result: DFCResult = {
        inputPath: resolvedPath,
        before,
        after,
        diff,
        beforeImage,
        afterImage,
        durationMs,
    };

    await emitEvent(scanId, {
        type: 'chainguard.dfc.convert',
        source: 'chainguard',
        data: {
            inputPath: resolvedPath,
            beforeImage,
            afterImage,
            diff,
            durationMs,
        },
    });

    return result;
}

/** Apply the DFC conversion in-place on a Dockerfile. Saves original to <file>.bak. */
export async function convertDockerfileInPlace(
    scanId: string,
    inputPath: string,
    opts: { strict?: boolean; org?: string } = {},
): Promise<DFCResult> {
    const resolvedPath = path.resolve(inputPath);
    const before = await fs.readFile(resolvedPath, 'utf8');
    const beforeImage = parseFromImage(before);

    const args: string[] = ['--in-place'];
    if (opts.strict) args.push('--strict');
    if (opts.org) args.push('--org', opts.org);
    args.push(resolvedPath);

    const startedAt = Date.now();
    await execFileAsync('dfc', args, {
        encoding: 'utf8',
        maxBuffer: 16 * 1024 * 1024,
    });
    const durationMs = Date.now() - startedAt;
    const after = await fs.readFile(resolvedPath, 'utf8');
    const afterImage = parseFromImage(after);
    const diff = buildUnifiedDiff(before, after, resolvedPath);

    const result: DFCResult = {
        inputPath: resolvedPath,
        before,
        after,
        diff,
        beforeImage,
        afterImage,
        durationMs,
    };

    await emitEvent(scanId, {
        type: 'chainguard.dfc.convert',
        source: 'chainguard',
        data: {
            inputPath: resolvedPath,
            beforeImage,
            afterImage,
            diff,
            durationMs,
            inPlace: true,
        },
    });

    return result;
}

function parseFromImage(dockerfile: string): string {
    const match = dockerfile.match(FROM_LINE_REGEX);
    if (!match) {
        throw new Error(
            'Dockerfile has no FROM instruction; cannot derive base image reference',
        );
    }
    return match[1];
}

function buildUnifiedDiff(before: string, after: string, filePath: string): string {
    // We deliberately avoid pulling in `diff` as a dep. A small, correct LCS-based
    // diff is cheap to maintain and sufficient for dashboard display. If callers
    // need semantic diff (whitespace collapsing, move detection) they should use
    // `git diff --no-index` against the on-disk copies instead.
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    const lcs = longestCommonSubsequence(beforeLines, afterLines);

    const out: string[] = [];
    out.push(`--- ${filePath}`);
    out.push(`+++ ${filePath} (dfc-converted)`);

    let i = 0;
    let j = 0;
    let k = 0;
    while (i < beforeLines.length || j < afterLines.length) {
        if (k < lcs.length && beforeLines[i] === lcs[k] && afterLines[j] === lcs[k]) {
            out.push(` ${beforeLines[i]}`);
            i++;
            j++;
            k++;
        } else if (j < afterLines.length && (k >= lcs.length || afterLines[j] !== lcs[k])) {
            out.push(`+${afterLines[j]}`);
            j++;
        } else if (i < beforeLines.length && (k >= lcs.length || beforeLines[i] !== lcs[k])) {
            out.push(`-${beforeLines[i]}`);
            i++;
        } else {
            break;
        }
    }

    return out.join('\n');
}

function longestCommonSubsequence<T>(a: T[], b: T[]): T[] {
    const m = a.length;
    const n = b.length;
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
    }
    const out: T[] = [];
    let i = m;
    let j = n;
    while (i > 0 && j > 0) {
        if (a[i - 1] === b[j - 1]) {
            out.unshift(a[i - 1]);
            i--;
            j--;
        } else if (dp[i - 1][j] >= dp[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return out;
}
