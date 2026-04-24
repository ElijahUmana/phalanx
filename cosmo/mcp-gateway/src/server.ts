// MCP server for the Phalanx supergraph (stdio transport).
//
// Exposes 5 MCP tools, one per persisted GraphQL operation. Each call is
// forwarded through the Cosmo Router so @requiresScopes runs on every field.
// The tool handler returns the raw GraphQL response plus metadata showing
// which JWT was minted and whether the router denied a scope — useful for the
// Guild agents to audit their own blast radius at runtime.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { PhalanxGateway, type ToolResult } from './gateway';
import { TOOLS } from './tools';
import { zodToJsonSchema } from './schema-utils';

const ROUTER_URL = process.env.COSMO_ROUTER_URL ?? 'http://localhost:3002';
const JWT_ISSUER_URL = process.env.JWT_MOCK_URL ?? 'http://localhost:4005';

async function main(): Promise<void> {
    const gateway = new PhalanxGateway({
        routerUrl: ROUTER_URL,
        issuerUrl: JWT_ISSUER_URL,
    });

    const server = new Server(
        {
            name: 'phalanx-mcp-gateway',
            version: '1.0.0',
        },
        {
            capabilities: {
                tools: {},
            },
        },
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
        return {
            tools: TOOLS.map((t) => ({
                name: t.name,
                description: t.description,
                inputSchema: zodToJsonSchema(t.inputSchema),
            })),
        };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        const tool = TOOLS.find((t) => t.name === name);
        if (!tool) {
            return {
                content: [{ type: 'text', text: `Unknown tool: ${name}` }],
                isError: true,
            };
        }

        try {
            const validated = tool.inputSchema.parse(args);
            const result = await gateway.invoke({
                toolName: name,
                args: validated as Record<string, unknown>,
            });
            return formatResult(result);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return {
                content: [
                    {
                        type: 'text',
                        text: `Tool invocation failed: ${message}`,
                    },
                ],
                isError: true,
            };
        }
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error(
        `[phalanx-mcp-gateway] ready. router=${ROUTER_URL} issuer=${JWT_ISSUER_URL} tools=${TOOLS.length}`,
    );
}

function formatResult(result: ToolResult): {
    content: { type: 'text'; text: string }[];
    isError?: boolean;
} {
    const header = [
        `operation: ${result.operationName}`,
        `role: ${result.minted.role}`,
        `minted-scopes: ${result.minted.scopes.join(' ') || '<none>'}`,
        `required-scopes: ${result.requiredScopes.join(' ')}`,
        `router-status: ${result.status}`,
        `scope-denied: ${result.scopeDenied}${result.deniedScope ? ` (${result.deniedScope})` : ''}`,
    ].join('\n');

    const body = JSON.stringify(
        { data: result.data, errors: result.errors },
        null,
        2,
    );

    const output = `${header}\n---\n${body}`;
    return {
        content: [{ type: 'text', text: output }],
        isError: !result.ok,
    };
}

main().catch((err) => {
    console.error('[phalanx-mcp-gateway] fatal:', err);
    process.exit(1);
});
