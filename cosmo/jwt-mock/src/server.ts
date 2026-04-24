// Phalanx mock JWT issuer. Exposes:
//   GET  /.well-known/jwks.json  — public RSA key in JWKS format
//   POST /token                  — mint a signed JWT for a named agent role
//   GET  /health                 — liveness probe
//
// The router (configured with authentication.providers[phalanx-mock].jwks.url
// pointing here) fetches the JWKS and validates incoming Bearer tokens. Tokens
// carry a `scope` claim (space-separated OAuth 2.0 style) which Cosmo parses and
// matches against @requiresScopes directives on the federated schema.
//
// Roles are hard-coded (ANALYST, REMEDIATOR, ROLLOUT_OPERATOR, UNAUTHORIZED)
// so the demo can issue "the Analyst role" directly without an IdP roundtrip.
// Prod would replace this with an actual OIDC provider (Auth0, WorkOS, etc.).

import { fastify } from 'fastify';
import { generateKeyPair, exportJWK, SignJWT, type JWK, type KeyLike } from 'jose';
import type { FastifyInstance } from 'fastify';

const PORT = Number(process.env.JWT_MOCK_PORT ?? 4005);
const ISSUER = process.env.JWT_MOCK_ISSUER ?? 'phalanx-mock';
const KEY_ID = 'phalanx-mock-key-1';
const ALG = 'RS256';

export type PhalanxRole = 'ANALYST' | 'REMEDIATOR' | 'ROLLOUT_OPERATOR' | 'UNAUTHORIZED';

export const ROLE_SCOPES: Record<PhalanxRole, string[]> = {
    // Analyst: reads only. Cannot write anywhere.
    ANALYST: ['read:sbom', 'read:deployment', 'read:risk', 'read:marketplace'],
    // Remediator: can stage deploys. Cannot touch production.
    REMEDIATOR: [
        'read:sbom',
        'read:deployment',
        'read:risk',
        'read:marketplace',
        'write:staging',
    ],
    // Rollout Operator: full authority. Gated by Guild human approval in prod.
    ROLLOUT_OPERATOR: [
        'read:sbom',
        'read:deployment',
        'read:risk',
        'read:marketplace',
        'write:staging',
        'write:production',
    ],
    // UNAUTHORIZED: no scopes. Used to prove the default-deny behavior.
    UNAUTHORIZED: [],
};

export function resolveRoleScopes(role: PhalanxRole): string[] {
    return ROLE_SCOPES[role];
}

interface KeyMaterial {
    privateKey: KeyLike;
    publicJwk: JWK;
}

async function generateKeys(): Promise<KeyMaterial> {
    const { publicKey, privateKey } = await generateKeyPair(ALG, { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = KEY_ID;
    publicJwk.alg = ALG;
    publicJwk.use = 'sig';
    return { privateKey, publicJwk };
}

export async function mintToken(
    role: PhalanxRole,
    privateKey: KeyLike,
    agentId?: string,
): Promise<{ token: string; scopes: string[]; expiresAt: number }> {
    const scopes = resolveRoleScopes(role);
    const subject = agentId ?? `phalanx-agent-${role.toLowerCase()}`;
    const expiresIn = 3600; // 1 hour
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + expiresIn;
    const token = await new SignJWT({
        scope: scopes.join(' '),
        role,
    })
        .setProtectedHeader({ alg: ALG, kid: KEY_ID, typ: 'JWT' })
        .setIssuedAt(now)
        .setIssuer(ISSUER)
        .setAudience('phalanx-supergraph')
        .setSubject(subject)
        .setExpirationTime(expiresAt)
        .sign(privateKey);
    return { token, scopes, expiresAt };
}

function isPhalanxRole(value: unknown): value is PhalanxRole {
    return (
        typeof value === 'string' &&
        (value === 'ANALYST' ||
            value === 'REMEDIATOR' ||
            value === 'ROLLOUT_OPERATOR' ||
            value === 'UNAUTHORIZED')
    );
}

export async function buildServer(keys: KeyMaterial): Promise<FastifyInstance> {
    const server = fastify({ logger: false });

    server.get('/health', async () => ({ status: 'ok', issuer: ISSUER }));

    server.get('/.well-known/jwks.json', async (_, reply) => {
        reply.header('Content-Type', 'application/json');
        reply.header('Cache-Control', 'public, max-age=300');
        return { keys: [keys.publicJwk] };
    });

    server.post<{
        Body: { role?: unknown; agentId?: unknown };
    }>('/token', async (request, reply) => {
        const body = request.body ?? {};
        const role = body.role;
        if (!isPhalanxRole(role)) {
            reply.code(400);
            return {
                error:
                    'invalid role; expected ANALYST, REMEDIATOR, ROLLOUT_OPERATOR, or UNAUTHORIZED',
            };
        }
        const agentId = typeof body.agentId === 'string' ? body.agentId : undefined;
        const minted = await mintToken(role, keys.privateKey, agentId);
        return {
            accessToken: minted.token,
            tokenType: 'Bearer',
            expiresIn: minted.expiresAt - Math.floor(Date.now() / 1000),
            scopes: minted.scopes,
            role,
        };
    });

    return server;
}

async function main(): Promise<void> {
    const keys = await generateKeys();
    const server = await buildServer(keys);
    await server.listen({ host: '0.0.0.0', port: PORT });
    console.log(`[jwt-mock] issuer=${ISSUER} listening on http://localhost:${PORT}`);
    console.log(`[jwt-mock] jwks:   http://localhost:${PORT}/.well-known/jwks.json`);
    console.log(`[jwt-mock] token:  POST http://localhost:${PORT}/token {"role":"ANALYST"}`);
}

if (require.main === module) {
    main().catch((err) => {
        console.error('[jwt-mock] failed to start:', err);
        process.exit(1);
    });
}
