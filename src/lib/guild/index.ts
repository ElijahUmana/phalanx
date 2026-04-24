// Guild agent orchestration — Task #8
//
// Triggers real Guild sessions for the five Phalanx agents (scanner, analyst,
// planner, validator, operator). Each function takes `scanId: string` as the
// FIRST argument and emits events the dashboard subscribes to:
//   - guild.action            (one per successful agent turn)
//   - guild.cancel.broadcast  (analyst FALSE_POSITIVE ≥ 0.9 confidence)
//   - guild.approval.granted  (operator APPROVE)
//   - guild.approval.denied   (operator REJECT or HOLD)

export {
    runScanner,
    runAnalyst,
    runPlanner,
    runValidator,
    runApprovalGate,
    listPhalanxAgents,
    type ApprovalOptions,
} from './orchestrator';

export {
    AGENT_NAMES,
    scannerOutputSchema,
    scannerFindingSchema,
    analystOutputSchema,
    plannerOutputSchema,
    hypothesisSchema,
    validatorOutputSchema,
    operatorOutputSchema,
    evidenceBundleSchema,
    severitySchema,
    remediationStrategySchema,
    approvalDecisionSchema,
    analystVerdictLabelSchema,
    blastRadiusSchema,
    cancelPolicySchema,
} from './types';

export type {
    PhalanxAgentName,
    Severity,
    RemediationStrategy,
    ScannerOutput,
    ScannerFinding,
    AnalystOutput,
    AnalystVerdictLabel,
    BlastRadius,
    PlannerOutput,
    Hypothesis,
    HypothesisChange,
    CancelPolicy,
    ValidatorOutput,
    RankedHypothesis,
    ValidatorScoreBreakdown,
    ValidationResult,
    OperatorOutput,
    ApprovalDecision,
    EvidenceBundle,
    GuildSessionMeta,
    GuildActionEvent,
    GuildApprovalEvent,
} from './types';
