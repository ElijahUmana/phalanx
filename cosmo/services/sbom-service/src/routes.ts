import type { ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    ServiceV1,
    DependencySchema,
    SBOMSchema,
} from './generated/service/v1/service_pb';
import type { Dependency, SBOM } from './generated/service/v1/service_pb';
import {
    getDependencyById,
    getSbomById,
    getSbomByRepo,
    getDepsForRepo,
    getDepsForCve,
} from './data';
import type { SeedDependency, SeedSBOM } from './data';

function toDependency(d: SeedDependency): Dependency {
    return create(DependencySchema, {
        id: d.id,
        name: d.name,
        version: d.version,
        ecosystem: d.ecosystem,
        transitive: d.transitive,
        depth: d.depth,
        license: d.license === null ? undefined : d.license,
        parentId: d.parentId === null ? undefined : d.parentId,
        sha256: d.sha256 === null ? undefined : d.sha256,
    });
}

function toSbom(s: SeedSBOM): SBOM {
    const components = s.componentIds
        .map(getDependencyById)
        .filter((d): d is SeedDependency => d !== null)
        .map(toDependency);
    return create(SBOMSchema, {
        id: s.id,
        repoId: s.repoId,
        generatedAt: s.generatedAt,
        signedBy: s.signedBy === null ? undefined : s.signedBy,
        sigstoreBundleUrl:
            s.sigstoreBundleUrl === null ? undefined : s.sigstoreBundleUrl,
        slsaLevel: s.slsaLevel === null ? undefined : s.slsaLevel,
        componentCount: components.length,
        components,
    });
}

export default (router: ConnectRouter) => {
    router.service(ServiceV1, {
        querySbom: async (req) => {
            const sbom = getSbomByRepo(req.repoId);
            return { sbom: sbom ? toSbom(sbom) : undefined };
        },
        queryDependencyTree: async (req) => {
            const deps = getDepsForRepo(req.repoId, req.depth ?? null);
            return { dependencyTree: deps.map(toDependency) };
        },
        queryVulnerableDependencies: async (req) => {
            const deps = getDepsForCve(req.cveId);
            return { vulnerableDependencies: deps.map(toDependency) };
        },
        queryDependency: async (req) => {
            const dep = getDependencyById(req.id);
            return { dependency: dep ? toDependency(dep) : undefined };
        },
        lookupSBOMById: async (req) => {
            const result = req.keys
                .map((k) => {
                    const sbom = getSbomById(k.id);
                    return sbom ? toSbom(sbom) : null;
                })
                .filter((r): r is SBOM => r !== null);
            return { result };
        },
        lookupDependencyById: async (req) => {
            const result = req.keys
                .map((k) => {
                    const dep = getDependencyById(k.id);
                    return dep ? toDependency(dep) : null;
                })
                .filter((r): r is Dependency => r !== null);
            return { result };
        },
    });
};
