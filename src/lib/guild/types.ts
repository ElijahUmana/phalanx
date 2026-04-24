// Guild agent orchestration — input/output Zod schemas for the 5 Phalanx
// agents. The agents themselves enforce these shapes via their system prompts
// (see /Users/elijahumana/hackathon-2026/agents/phalanx-*/agent.ts). Here we
// parse responses at the system boundary so the orchestrator never operates
// on untyped agent output.

import { z } from 'zod';

// ────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ────────────────────────────────────────────────────────────────────────────

export const severitySchema = z.enum([
    'CRITICAL',
    'HIGH',
    'MEDIUM',
    'LOW',
    'INFORMATIONAL',
]);
export type Severity = z.infer<typeof severitySchema>;

export const remediationStrategySchema = z.enum([
    'UPGRADE',
    'PIN',
    'CHAINGUARD_SWAP',
    'VENDOR_PATCH',
    'ROLLBACK',
]);
export type RemediationStrategy = z.infer<typeof remediationStrategySchema>;

export const AGENT_NAMES = [
    'phalanx-scanner',
    'phalanx-analyst',
    'phalanx-planner',
    'phalanx-validator',
    'phalanx-operator',
] as const;
export type PhalanxAgentName = (typeof AGENT_NAMES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Scanner
// ────────────────────────────────────────────────────────────────────────────

export const scannerFindingSchema = z.object({
    package: z.string(),
    version: z.string(),
    ecosystem: z.string(),
    cveId: z.string().nullable(),
    severity: severitySchema,
    cvssScore: z.number().nullable(),
    affectedRange: z.string(),
    patchedVersion: z.string().nullable(),
    reasoning: z.string(),
});
export type ScannerFinding = z.infer<typeof scannerFindingSchema>;

export const scannerOutputSchema = z.object({
    repoUrl: z.string(),
    scannedAt: z.string(),
    componentCount: z.number().int().nonnegative(),
    findings: z.array(scannerFindingSchema),
    topFinding: scannerFindingSchema.nullable(),
    recommendNextStep: z.string(),
});
export type ScannerOutput = z.infer<typeof scannerOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Analyst
// ────────────────────────────────────────────────────────────────────────────

export const analystVerdictLabelSchema = z.enum([
    'REAL_RISK',
    'FALSE_POSITIVE',
    'NEEDS_MORE_DATA',
]);
export type AnalystVerdictLabel = z.infer<typeof analystVerdictLabelSchema>;

export const blastRadiusSchema = z.object({
    servicesAffected: z.number().int().nonnegative(),
    transitiveDepth: z.number().int().nonnegative(),
    estimatedUsers: z.number().int().nonnegative(),
    criticalPath: z.array(z.string()),
});
export type BlastRadius = z.infer<typeof blastRadiusSchema>;

export const analystOutputSchema = z.object({
    cveId: z.string(),
    repoUrl: z.string(),
    verdict: analystVerdictLabelSchema,
    confidence: z.number().min(0).max(1),
    reasoning: z.string(),
    blastRadius: blastRadiusSchema,
    recommendCancel: z.boolean(),
    escalateToPlanner: z.boolean(),
});
export type AnalystOutput = z.infer<typeof analystOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Planner
// ────────────────────────────────────────────────────────────────────────────

export const hypothesisChangeSchema = z.object({
    file: z.string(),
    from: z.string(),
    to: z.string(),
});
export type HypothesisChange = z.infer<typeof hypothesisChangeSchema>;

export const hypothesisSchema = z.object({
    id: z.string(),
    name: z.string(),
    strategy: remediationStrategySchema,
    description: z.string(),
    changes: z.array(hypothesisChangeSchema),
    confidence: z.number().min(0).max(1),
    estimatedRisk: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    requiresExternalPayment: z.boolean(),
    requiresTinyFishAgent: z.boolean(),
});
export type Hypothesis = z.infer<typeof hypothesisSchema>;

export const cancelPolicySchema = z.enum([
    'FALSE_POSITIVE',
    'TEST_FAILURE_ALL',
    'TIMEOUT_300S',
]);
export type CancelPolicy = z.infer<typeof cancelPolicySchema>;

export const plannerOutputSchema = z.object({
    cveId: z.string(),
    repoUrl: z.string(),
    hypothesisCount: z.number().int().positive(),
    hypotheses: z.array(hypothesisSchema),
    recommendedOrder: z.array(z.string()),
    cancelOn: cancelPolicySchema,
});
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Validator
// ────────────────────────────────────────────────────────────────────────────

export const validationResultSchema = z.object({
    hypothesisId: z.string(),
    backendId: z.string(),
    testsPassed: z.number().int().nonnegative(),
    testsTotal: z.number().int().nonnegative(),
    latencyMs: z.number().nonnegative(),
    regressionCount: z.number().int().nonnegative(),
    sbomAttested: z.boolean(),
    chainguardBase: z.boolean(),
    cancelled: z.boolean(),
    errorLog: z.string().nullable(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const validatorScoreBreakdownSchema = z.object({
    testPassRate: z.number(),
    regressionPenalty: z.number(),
    latencyPenalty: z.number(),
    chainguardBonus: z.number(),
    sbomBonus: z.number(),
});
export type ValidatorScoreBreakdown = z.infer<typeof validatorScoreBreakdownSchema>;

export const rankedHypothesisSchema = z.object({
    hypothesisId: z.string(),
    strategy: remediationStrategySchema,
    score: z.number().min(0).max(1),
    scoreBreakdown: validatorScoreBreakdownSchema,
    verdict: z.enum(['WINNER', 'RUNNER_UP', 'REJECTED']),
    rejectionReason: z.string().nullable(),
});
export type RankedHypothesis = z.infer<typeof rankedHypothesisSchema>;

export const validatorOutputSchema = z.object({
    cveId: z.string(),
    repoUrl: z.string(),
    survivors: z.number().int().nonnegative(),
    cancelled: z.number().int().nonnegative(),
    ranked: z.array(rankedHypothesisSchema),
    winner: z
        .object({
            hypothesisId: z.string(),
            strategy: remediationStrategySchema,
            score: z.number(),
            rationale: z.string(),
        })
        .nullable(),
    approvalRequired: z.boolean(),
    nextAgent: z.literal('phalanx-operator'),
});
export type ValidatorOutput = z.infer<typeof validatorOutputSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Operator (multi-turn approval gate)
// ────────────────────────────────────────────────────────────────────────────

export const approvalDecisionSchema = z.enum(['APPROVE', 'REJECT', 'HOLD']);
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

export const operatorOutputSchema = z.object({
    decision: approvalDecisionSchema,
    cveId: z.string(),
    hypothesisId: z.string(),
    approver: z.string(),
    reason: z.string(),
    actions: z.array(z.string()),
    productionTouched: z.boolean(),
    followup: z.string().nullable(),
});
export type OperatorOutput = z.infer<typeof operatorOutputSchema>;

export const evidenceBundleSchema = z.object({
    chainguardSbomHash: z.string().nullable(),
    sigstoreBundleUrl: z.string().nullable(),
    x402ReceiptHash: z.string().nullable(),
    slsaLevel: z.number().int().nullable(),
});
export type EvidenceBundle = z.infer<typeof evidenceBundleSchema>;

// ────────────────────────────────────────────────────────────────────────────
// Shared Guild session metadata (emitted as guild.action events)
// ────────────────────────────────────────────────────────────────────────────

export interface GuildSessionMeta {
    agentName: PhalanxAgentName;
    agentId: string;
    sessionId: string;
    startedAt: number;
    durationMs: number;
}

export interface GuildActionEvent {
    agentName: PhalanxAgentName;
    agentId: string;
    sessionId: string;
    action: string;
    inputHash: string;
    outputHash: string;
    durationMs: number;
}

export interface GuildApprovalEvent {
    gateId: string;
    approver: string;
    decision: ApprovalDecision;
    hypothesisId: string;
    reason: string;
}
