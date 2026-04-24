import type { ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    ServiceV1,
    CVESchema,
    RiskScoreSchema,
    BlastRadiusSchema,
    DependencySchema,
    DependencyRiskSummarySchema,
    Severity as SeverityEnum,
} from './generated/service/v1/service_pb';
import type {
    CVE,
    RiskScore,
    BlastRadius,
    Dependency,
    DependencyRiskSummary,
} from './generated/service/v1/service_pb';
import {
    getCveById,
    getCvesBySeverity,
    getCvesForDependency,
    getRiskScore,
    getBlastRadius,
    type SeedCVE,
    type SeedRiskScore,
    type SeedBlastRadius,
    type Severity,
} from './data';

function toProtoSeverity(s: Severity): SeverityEnum {
    switch (s) {
        case 'CRITICAL':
            return SeverityEnum.CRITICAL;
        case 'HIGH':
            return SeverityEnum.HIGH;
        case 'MEDIUM':
            return SeverityEnum.MEDIUM;
        case 'LOW':
            return SeverityEnum.LOW;
        case 'INFORMATIONAL':
            return SeverityEnum.INFORMATIONAL;
    }
}

function toCve(c: SeedCVE): CVE {
    return create(CVESchema, {
        id: c.id,
        cvssScore: c.cvssScore,
        severity: toProtoSeverity(c.severity),
        publishedAt: c.publishedAt,
        description: c.description,
        affectedPackages: c.affectedPackages,
        exploitInWild: c.exploitInWild,
        nvdUrl: c.nvdUrl,
    });
}

function toRiskScore(r: SeedRiskScore): RiskScore {
    return create(RiskScoreSchema, {
        cveId: r.cveId,
        repoId: r.repoId,
        score: r.score,
        reasoning: r.reasoning,
        affectedComponentCount: r.affectedComponentCount,
        transitiveImpact: r.transitiveImpact,
    });
}

function toBlastRadius(b: SeedBlastRadius): BlastRadius {
    return create(BlastRadiusSchema, {
        cveId: b.cveId,
        repoId: b.repoId,
        servicesAffected: b.servicesAffected,
        transitiveDepth: b.transitiveDepth,
        estimatedUsers: b.estimatedUsers,
        criticalPath: b.criticalPath,
    });
}

function summarizeDependencyRisks(dependencyId: string): DependencyRiskSummary {
    const cves = getCvesForDependency(dependencyId);
    const maxCvssScore = cves.reduce((m, c) => Math.max(m, c.cvssScore), 0);
    const criticalCount = cves.filter((c) => c.severity === 'CRITICAL').length;
    const highCount = cves.filter((c) => c.severity === 'HIGH').length;
    return create(DependencyRiskSummarySchema, {
        dependencyId,
        maxCvssScore,
        criticalCount,
        highCount,
        totalCount: cves.length,
    });
}

function toDependency(id: string): Dependency {
    return create(DependencySchema, {
        id,
        risks: getCvesForDependency(id).map(toCve),
        riskSummary: summarizeDependencyRisks(id),
    });
}

export default (router: ConnectRouter) => {
    router.service(ServiceV1, {
        queryCve: async (req) => {
            const c = getCveById(req.id);
            return { cve: c ? toCve(c) : undefined };
        },
        queryCvesBySeverity: async (req) => {
            return { cvesBySeverity: getCvesBySeverity(req.minScore).map(toCve) };
        },
        queryRiskScore: async (req) => {
            const r = getRiskScore(req.cveId, req.repoId);
            return { riskScore: r ? toRiskScore(r) : undefined };
        },
        queryBlastRadius: async (req) => {
            const b = getBlastRadius(req.cveId, req.repoId);
            if (!b) {
                return {
                    blastRadius: create(BlastRadiusSchema, {
                        cveId: req.cveId,
                        repoId: req.repoId,
                        servicesAffected: 0,
                        transitiveDepth: 0,
                        estimatedUsers: 0,
                        criticalPath: [],
                    }),
                };
            }
            return { blastRadius: toBlastRadius(b) };
        },
        queryCvesForDependency: async (req) => {
            return { cvesForDependency: getCvesForDependency(req.dependencyId).map(toCve) };
        },
        lookupCVEById: async (req) => {
            const result = req.keys
                .map((k) => {
                    const c = getCveById(k.id);
                    return c ? toCve(c) : null;
                })
                .filter((r): r is CVE => r !== null);
            return { result };
        },
        lookupDependencyById: async (req) => {
            // Federation entity merge: risk-service contributes risks + riskSummary
            // for every Dependency the router needs — we always return a record
            // even when the dep has no CVEs (empty risks array + zero summary).
            const result = req.keys.map((k) => toDependency(k.id));
            return { result };
        },
    });
};
