// PR creator. Two strategies:
//   - tinyfish-agent: uses a TinyFish browser agent to navigate GitHub's
//     compare/pull UI end-to-end. This is the narrative "autonomous web
//     action" the FINAL-CONCEPT demands — the demo shows a live browser.
//   - github-api: uses the GitHub REST API with GITHUB_TOKEN (Octokit-less
//     — we `fetch()` directly to avoid an extra dep). More reliable for
//     automated pipelines.
//
// Callers can pick via `preferBrowserAgent` on PrCreationInput. We default
// to the agent path so the demo lights up the live-browser panel; the API
// path is the fallback when the agent run fails or the caller explicitly
// wants a reliable backend path.

import { getTinyFish } from './client.js';
import { emitEvent } from '../events/emitter.js';
import { env } from '../env.js';
import type { PrCreationInput, PrCreationResult } from './types.js';

// Inlined from @tiny-fish/sdk to avoid ESM static-link issues under tsx .mts.
const BROWSER_PROFILE_STEALTH = 'stealth' as const;
const RUN_STATUS_COMPLETED = 'COMPLETED' as const;

export async function createPullRequest(
    scanId: string,
    input: PrCreationInput,
): Promise<PrCreationResult> {
    const prefersAgent = input.preferBrowserAgent !== false;

    if (prefersAgent) {
        try {
            return await createPullRequestViaAgent(scanId, input);
        } catch (agentErr) {
            const message = agentErr instanceof Error ? agentErr.message : String(agentErr);
            await emitEvent(scanId, {
                type: 'tinyfish.pr.create',
                source: 'tinyfish',
                data: {
                    stage: 'agent-failed-falling-back-to-api',
                    error: message,
                    repoSlug: input.repoSlug,
                },
            });
            return createPullRequestViaApi(scanId, input, message);
        }
    }
    return createPullRequestViaApi(scanId, input, null);
}

/**
 * Drive the GitHub compare/pull UI with a TinyFish browser agent. The caller
 * MUST have already pushed `headBranch` to the remote — the agent only opens
 * the PR UI and submits; it does not commit code.
 */
export async function createPullRequestViaAgent(
    scanId: string,
    input: PrCreationInput,
): Promise<PrCreationResult> {
    const client = getTinyFish();

    const compareUrl = `https://github.com/${input.repoSlug}/compare/${encodeURIComponent(input.baseBranch)}...${encodeURIComponent(input.headBranch)}?expand=1`;

    const labelsClause =
        (input.labels?.length ?? 0) > 0
            ? ` Add these labels: ${(input.labels ?? []).join(', ')}.`
            : '';
    const reviewersClause =
        (input.reviewers?.length ?? 0) > 0
            ? ` Request review from: ${(input.reviewers ?? []).join(', ')}.`
            : '';
    const commitsClause = input.commitsSummary
        ? ` Context on the commits already pushed: ${input.commitsSummary}.`
        : '';

    const goal = [
        `On this GitHub compare page, open a pull request from "${input.headBranch}" into "${input.baseBranch}" on repo ${input.repoSlug}.`,
        `Set the PR title to: "${input.title.replace(/"/g, '\\"')}".`,
        `Set the PR description to: "${input.body.replace(/"/g, '\\"')}".`,
        commitsClause,
        labelsClause,
        reviewersClause,
        'Click "Create pull request" to submit. Then return strictly this JSON:',
        '{"prUrl": "<url of the created PR>", "prNumber": <number>}.',
        'If the button is already labeled "Draft" only, still open it as a regular PR. Do not abandon if labels fail to apply — submit anyway and report what worked.',
    ].join(' ');

    await emitEvent(scanId, {
        type: 'tinyfish.pr.create',
        source: 'tinyfish',
        data: {
            stage: 'agent-start',
            repoSlug: input.repoSlug,
            baseBranch: input.baseBranch,
            headBranch: input.headBranch,
            compareUrl,
        },
    });

    let runId = '';
    let streamingUrl: string | null = null;
    let agentResult: unknown = null;
    let agentError: string | null = null;

    const stream = await client.agent.stream(
        { goal, url: compareUrl, browser_profile: BROWSER_PROFILE_STEALTH },
        {
            onStarted: async (event) => {
                runId = event.run_id;
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.start',
                    source: 'tinyfish',
                    data: { runId, url: compareUrl, phase: 'pr-create' },
                });
            },
            onStreamingUrl: async (event) => {
                streamingUrl = event.streaming_url;
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.stream',
                    source: 'tinyfish',
                    data: { runId, streamingUrl, phase: 'pr-create' },
                });
            },
            onProgress: async (event) => {
                await emitEvent(scanId, {
                    type: 'tinyfish.agent.progress',
                    source: 'tinyfish',
                    data: { runId, purpose: event.purpose, phase: 'pr-create' },
                });
            },
            onComplete: async (event) => {
                agentResult = event.result;
            },
        },
    );

    for await (const evt of stream) {
        if (evt.type === 'COMPLETE' && evt.status !== RUN_STATUS_COMPLETED) {
            agentError = evt.error?.message ?? `TinyFish run ended with status ${evt.status}`;
        }
    }

    if (agentError !== null) {
        throw new Error(`TinyFish PR agent failed on ${input.repoSlug}: ${agentError}`);
    }

    const parsed = parseJson(agentResult);
    const prUrl = typeof parsed['prUrl'] === 'string' ? parsed['prUrl'] : null;
    const prNumber = typeof parsed['prNumber'] === 'number' ? parsed['prNumber'] : extractPrNumber(prUrl);

    await emitEvent(scanId, {
        type: 'tinyfish.pr.create',
        source: 'tinyfish',
        data: {
            stage: 'agent-complete',
            runId,
            prUrl,
            prNumber,
            repoSlug: input.repoSlug,
        },
    });

    return {
        strategy: 'tinyfish-agent',
        success: prUrl !== null,
        prUrl,
        prNumber,
        repoSlug: input.repoSlug,
        branchName: input.headBranch,
        title: input.title,
        body: input.body,
        labels: input.labels ?? [],
        reviewers: input.reviewers ?? [],
        streamingUrl,
        runId,
        error: prUrl === null ? 'Agent completed but did not return a PR URL' : null,
    };
}

/**
 * Create a PR via GitHub REST API. Uses GITHUB_TOKEN from env. Returns the
 * PR URL on success. Applies labels + reviewers in separate follow-up calls —
 * if those fail, the PR is still created and we surface the partial-failure
 * message on the result.
 */
export async function createPullRequestViaApi(
    scanId: string,
    input: PrCreationInput,
    causeFromAgent: string | null,
): Promise<PrCreationResult> {
    const token = env().GITHUB_TOKEN;
    if (!token) {
        const err = 'GITHUB_TOKEN not set — cannot fall back to GitHub API PR creation';
        await emitEvent(scanId, {
            type: 'tinyfish.pr.create',
            source: 'tinyfish',
            data: { stage: 'api-unavailable', repoSlug: input.repoSlug, error: err },
        });
        return failureResult(input, err, null);
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
    };

    const prResponse = await fetch(
        `https://api.github.com/repos/${input.repoSlug}/pulls`,
        {
            method: 'POST',
            headers,
            body: JSON.stringify({
                title: input.title,
                body: input.body,
                head: input.headBranch,
                base: input.baseBranch,
                maintainer_can_modify: true,
            }),
        },
    );

    if (!prResponse.ok) {
        const text = await prResponse.text();
        const err = `GitHub API returned ${prResponse.status} ${prResponse.statusText}: ${text}`;
        await emitEvent(scanId, {
            type: 'tinyfish.pr.create',
            source: 'tinyfish',
            data: { stage: 'api-failed', repoSlug: input.repoSlug, status: prResponse.status, error: err },
        });
        throw new Error(`${err}${causeFromAgent ? ` (agent fallback cause: ${causeFromAgent})` : ''}`);
    }

    const pr = (await prResponse.json()) as {
        html_url?: string;
        number?: number;
    };
    const prUrl = pr.html_url ?? null;
    const prNumber = typeof pr.number === 'number' ? pr.number : null;

    await emitEvent(scanId, {
        type: 'tinyfish.pr.create',
        source: 'tinyfish',
        data: {
            stage: 'api-created',
            repoSlug: input.repoSlug,
            prUrl,
            prNumber,
            cause: causeFromAgent,
        },
    });

    // Apply labels (best-effort — don't fail the PR if labels don't stick).
    if ((input.labels?.length ?? 0) > 0 && prNumber !== null) {
        await fetch(
            `https://api.github.com/repos/${input.repoSlug}/issues/${prNumber}/labels`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ labels: input.labels }),
            },
        ).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            // Surface as event but not fatal — PR is already open.
            void emitEvent(scanId, {
                type: 'tinyfish.pr.create',
                source: 'tinyfish',
                data: { stage: 'api-labels-failed', prNumber, error: message },
            });
        });
    }

    // Request reviewers (same best-effort shape).
    if ((input.reviewers?.length ?? 0) > 0 && prNumber !== null) {
        await fetch(
            `https://api.github.com/repos/${input.repoSlug}/pulls/${prNumber}/requested_reviewers`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ reviewers: input.reviewers }),
            },
        ).catch((err) => {
            const message = err instanceof Error ? err.message : String(err);
            void emitEvent(scanId, {
                type: 'tinyfish.pr.create',
                source: 'tinyfish',
                data: { stage: 'api-reviewers-failed', prNumber, error: message },
            });
        });
    }

    return {
        strategy: 'github-api',
        success: prUrl !== null,
        prUrl,
        prNumber,
        repoSlug: input.repoSlug,
        branchName: input.headBranch,
        title: input.title,
        body: input.body,
        labels: input.labels ?? [],
        reviewers: input.reviewers ?? [],
        streamingUrl: null,
        runId: null,
        error: prUrl === null ? 'GitHub API returned no html_url' : null,
    };
}

function failureResult(
    input: PrCreationInput,
    error: string,
    runId: string | null,
): PrCreationResult {
    return {
        strategy: 'github-api',
        success: false,
        prUrl: null,
        prNumber: null,
        repoSlug: input.repoSlug,
        branchName: input.headBranch,
        title: input.title,
        body: input.body,
        labels: input.labels ?? [],
        reviewers: input.reviewers ?? [],
        streamingUrl: null,
        runId,
        error,
    };
}

function parseJson(value: unknown): Record<string, unknown> {
    if (value === null || value === undefined) return {};
    if (typeof value === 'object') return value as Record<string, unknown>;
    if (typeof value === 'string') {
        const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
        try {
            const parsed = JSON.parse(trimmed);
            return typeof parsed === 'object' && parsed !== null ? parsed : {};
        } catch {
            return {};
        }
    }
    return {};
}

function extractPrNumber(url: string | null): number | null {
    if (!url) return null;
    const match = url.match(/\/pull\/(\d+)/);
    return match ? Number(match[1]) : null;
}
