// Core gateway logic — shared between stdio (MCP) and HTTP modes.
//
// Every tool call follows the same shape:
//   1. Mint a JWT from jwt-mock for the requested role.
//   2. POST the persisted GraphQL operation to the Cosmo Router at $ROUTER_URL.
//   3. Surface the GraphQL response (including scope-denial errors) back to the caller.
//
// Scope denials are not swallowed — when the router returns a 4xx or GraphQL
// errors array containing an AUTH-category error, we surface that explicitly
// so the demo can show the deny path succeeding as designed.

import { JwtClient, type MintedToken, type PhalanxRole } from './jwt-client';
import { getToolByName, TOOLS, type PhalanxTool } from './tools';

export interface GatewayConfig {
    routerUrl: string;
    issuerUrl: string;
}

export interface ToolInvocation {
    toolName: string;
    args: Record<string, unknown>;
}

export interface ToolResult {
    ok: boolean;
    status: number;
    data: unknown;
    errors: unknown[];
    scopeDenied: boolean;
    deniedScope: string | null;
    minted: { role: PhalanxRole; scopes: string[] };
    operationName: string;
    requiredScopes: string[];
}

export class PhalanxGateway {
    private readonly jwt: JwtClient;

    constructor(private readonly config: GatewayConfig) {
        this.jwt = new JwtClient({ issuerUrl: config.issuerUrl });
    }

    tools(): PhalanxTool[] {
        return TOOLS;
    }

    async invoke(invocation: ToolInvocation): Promise<ToolResult> {
        const tool = getToolByName(invocation.toolName);
        if (!tool) {
            throw new Error(`unknown tool: ${invocation.toolName}`);
        }

        // Extract control args from the input.
        const roleOverride = invocation.args['_roleOverride'] as PhalanxRole | undefined;
        const agentId = invocation.args['_agentId'] as string | undefined;
        const role: PhalanxRole = roleOverride ?? tool.defaultRole;

        const variables: Record<string, unknown> = {};
        for (const key of tool.variableKeys) {
            if (key in invocation.args) {
                variables[key] = invocation.args[key];
            }
        }

        const minted = await this.jwt.mint(role, agentId);
        const response = await this.executeGraphQL(tool, variables, minted);
        return this.interpretResponse(tool, minted, response);
    }

    private async executeGraphQL(
        tool: PhalanxTool,
        variables: Record<string, unknown>,
        minted: MintedToken,
    ): Promise<{ status: number; body: unknown }> {
        const url = `${this.config.routerUrl.replace(/\/$/, '')}/graphql`;
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${minted.accessToken}`,
            },
            body: JSON.stringify({
                query: tool.operationText,
                operationName: tool.operationName,
                variables,
            }),
        });
        const text = await res.text();
        let body: unknown;
        try {
            body = text ? JSON.parse(text) : {};
        } catch {
            body = { rawBody: text };
        }
        return { status: res.status, body };
    }

    private interpretResponse(
        tool: PhalanxTool,
        minted: MintedToken,
        response: { status: number; body: unknown },
    ): ToolResult {
        const body = response.body as { data?: unknown; errors?: unknown[] } | null;
        const errors = Array.isArray(body?.errors) ? body.errors : [];
        const data = body?.data ?? null;

        const scopeDenial = detectScopeDenial(errors);
        const ok = response.status >= 200 && response.status < 300 && errors.length === 0;

        return {
            ok,
            status: response.status,
            data,
            errors,
            scopeDenied: scopeDenial.denied,
            deniedScope: scopeDenial.deniedScope,
            minted: { role: minted.role, scopes: minted.scopes },
            operationName: tool.operationName,
            requiredScopes: tool.requiredScopes,
        };
    }
}

function detectScopeDenial(errors: unknown[]): {
    denied: boolean;
    deniedScope: string | null;
} {
    for (const err of errors) {
        if (!isGraphQLError(err)) continue;
        const code = (err.extensions?.code as string | undefined) ?? '';
        const msg = (err.message as string | undefined) ?? '';
        if (
            code === 'UNAUTHORIZED_FIELD_OR_TYPE' ||
            code === 'UNAUTHENTICATED' ||
            code === 'FORBIDDEN' ||
            /requires scope/i.test(msg) ||
            /authorization/i.test(msg) ||
            /unauthorized/i.test(msg)
        ) {
            const scopeMatch = msg.match(/(read|write|admin):[a-zA-Z_]+/);
            return { denied: true, deniedScope: scopeMatch?.[0] ?? null };
        }
    }
    return { denied: false, deniedScope: null };
}

interface GraphQLError {
    message?: string;
    extensions?: Record<string, unknown>;
}

function isGraphQLError(err: unknown): err is GraphQLError {
    return typeof err === 'object' && err !== null;
}
