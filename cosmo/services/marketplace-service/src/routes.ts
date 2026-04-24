import type { ConnectRouter } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
    ServiceV1,
    RemediationOptionSchema,
    PatchProviderSchema,
    X402ListingSchema,
    CVESchema,
    RemediationStrategy as StrategyEnum,
} from './generated/service/v1/service_pb';
import type {
    RemediationOption,
    PatchProvider,
    X402Listing,
    CVE,
} from './generated/service/v1/service_pb';
import {
    getRemediationsForCve,
    getRecommendedRemediation,
    getX402Listing,
    getX402ListingsForCve,
    getProvidersForPackage,
    type SeedRemediationOption,
    type SeedPatchProvider,
    type SeedX402Listing,
    type RemediationStrategy,
} from './data';

function toStrategy(s: RemediationStrategy): StrategyEnum {
    switch (s) {
        case 'UPGRADE':
            return StrategyEnum.UPGRADE;
        case 'PIN':
            return StrategyEnum.PIN;
        case 'CHAINGUARD_SWAP':
            return StrategyEnum.CHAINGUARD_SWAP;
        case 'VENDOR_PATCH':
            return StrategyEnum.VENDOR_PATCH;
        case 'ROLLBACK':
            return StrategyEnum.ROLLBACK;
    }
}

function toX402(x: SeedX402Listing): X402Listing {
    return create(X402ListingSchema, {
        id: x.id,
        providerUrl: x.providerUrl,
        priceUsd: x.priceUsd,
        description: x.description,
        acceptedNetworks: x.acceptedNetworks,
    });
}

function toRemediation(r: SeedRemediationOption): RemediationOption {
    const listing = r.x402ListingId ? getX402Listing(r.x402ListingId) : null;
    return create(RemediationOptionSchema, {
        id: r.id,
        cveId: r.cveId,
        strategy: toStrategy(r.strategy),
        targetVersion: r.targetVersion === null ? undefined : r.targetVersion,
        targetImage: r.targetImage === null ? undefined : r.targetImage,
        confidence: r.confidence,
        provider: r.provider,
        costUsd: r.costUsd,
        description: r.description,
        x402Listing: listing ? toX402(listing) : undefined,
    });
}

function toPatchProvider(p: SeedPatchProvider): PatchProvider {
    return create(PatchProviderSchema, {
        name: p.name,
        url: p.url,
        verified: p.verified,
        sbomSigned: p.sbomSigned,
    });
}

function toCveWithRemediations(cveId: string): CVE {
    return create(CVESchema, {
        id: cveId,
        remediationOptions: getRemediationsForCve(cveId).map(toRemediation),
        recommendedRemediation: (() => {
            const rec = getRecommendedRemediation(cveId);
            return rec ? toRemediation(rec) : undefined;
        })(),
    });
}

export default (router: ConnectRouter) => {
    router.service(ServiceV1, {
        queryRemediationOptions: async (req) => {
            return { remediationOptions: getRemediationsForCve(req.cveId).map(toRemediation) };
        },
        queryPatchProviders: async (req) => {
            return { patchProviders: getProvidersForPackage(req.packageName).map(toPatchProvider) };
        },
        queryX402Listings: async (req) => {
            return { x402Listings: getX402ListingsForCve(req.forCveId).map(toX402) };
        },
        queryRecommendedStrategy: async (req) => {
            const r = getRecommendedRemediation(req.cveId);
            return { recommendedStrategy: r ? toRemediation(r) : undefined };
        },
        lookupCVEById: async (req) => {
            // Federation entity merge: marketplace-service contributes remediationOptions.
            const result = req.keys.map((k) => toCveWithRemediations(k.id));
            return { result };
        },
    });
};
