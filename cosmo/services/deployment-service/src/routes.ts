import type { ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    ServiceV1,
    DeploymentSchema,
    DeploymentResultSchema,
} from './generated/service/v1/service_pb';
import type { Deployment } from './generated/service/v1/service_pb';
import {
    DEPLOYMENTS,
    getDeploymentById,
    getDeploymentsByRepo,
    getActiveVersion,
    nextDeploymentId,
    type SeedDeployment,
} from './data';

function toDeployment(d: SeedDeployment): Deployment {
    return create(DeploymentSchema, {
        id: d.id,
        repoId: d.repoId,
        environment: d.environment,
        version: d.version,
        deployedAt: d.deployedAt,
        deployedBy: d.deployedBy,
        affectedServices: d.affectedServices,
        status: d.status,
        sbomId: d.sbomId === null ? undefined : d.sbomId,
        hypothesisId: d.hypothesisId === null ? undefined : d.hypothesisId,
    });
}

export default (router: ConnectRouter) => {
    router.service(ServiceV1, {
        queryDeployments: async (req) => {
            return { deployments: getDeploymentsByRepo(req.repoId).map(toDeployment) };
        },
        queryDeployment: async (req) => {
            const d = getDeploymentById(req.id);
            return { deployment: d ? toDeployment(d) : undefined };
        },
        queryActiveVersion: async (req) => {
            const version = getActiveVersion(req.service, req.environment);
            return { activeVersion: version === null ? undefined : version };
        },
        mutationStageDeployment: async (req) => {
            const input = req.input;
            if (!input) {
                throw new Error('StageDeploymentInput is required');
            }
            const now = new Date().toISOString();
            const staged: SeedDeployment = {
                id: nextDeploymentId('staging'),
                repoId: input.repoId,
                environment: 'staging',
                version: input.version,
                deployedAt: now,
                deployedBy: 'guild-remediator',
                affectedServices: input.affectedServices,
                status: 'running',
                sbomId: null,
                hypothesisId:
                    input.hypothesisId === '' ||
                    input.hypothesisId === undefined ||
                    input.hypothesisId === null
                        ? null
                        : input.hypothesisId,
            };
            DEPLOYMENTS.push(staged);
            return { stageDeployment: toDeployment(staged) };
        },
        mutationRollout: async (req) => {
            const existing = getDeploymentById(req.deploymentId);
            const message = existing
                ? `Rollout of ${req.deploymentId} queued. Awaiting Guild approval gate.`
                : `Deployment ${req.deploymentId} not found — rollout rejected.`;
            return {
                rollout: create(DeploymentResultSchema, {
                    deploymentId: req.deploymentId,
                    success: existing !== null,
                    message,
                    approvalRequired: true,
                }),
            };
        },
        lookupDeploymentById: async (req) => {
            const result = req.keys
                .map((k) => {
                    const d = getDeploymentById(k.id);
                    return d ? toDeployment(d) : null;
                })
                .filter((r): r is Deployment => r !== null);
            return { result };
        },
    });
};
