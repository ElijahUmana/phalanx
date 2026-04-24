// Optional HTTP front-end for the gateway, useful for testing and for
// integration by Next.js API routes that prefer REST over MCP stdio.
//
// POST /invoke { toolName, args } → JSON ToolResult
// GET  /tools                      → list tool metadata
// GET  /health                     → liveness

import { fastify } from 'fastify';
import { PhalanxGateway, type ToolResult } from './gateway';
import { TOOLS } from './tools';

const PORT = Number(process.env.MCP_HTTP_PORT ?? 4006);
const ROUTER_URL = process.env.COSMO_ROUTER_URL ?? 'http://localhost:3002';
const JWT_ISSUER_URL = process.env.JWT_MOCK_URL ?? 'http://localhost:4005';

async function main(): Promise<void> {
    const gateway = new PhalanxGateway({
        routerUrl: ROUTER_URL,
        issuerUrl: JWT_ISSUER_URL,
    });

    const server = fastify({ logger: false });

    server.get('/health', async () => ({ status: 'ok', tools: TOOLS.length }));

    server.get('/tools', async () => ({
        tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            requiredScopes: t.requiredScopes,
            defaultRole: t.defaultRole,
            variableKeys: t.variableKeys,
        })),
    }));

    server.post<{
        Body: { toolName?: string; args?: Record<string, unknown> };
    }>('/invoke', async (request, reply) => {
        const body = request.body ?? {};
        if (typeof body.toolName !== 'string') {
            reply.code(400);
            return { error: 'toolName is required' };
        }
        const tool = TOOLS.find((t) => t.name === body.toolName);
        if (!tool) {
            reply.code(404);
            return { error: `unknown tool: ${body.toolName}` };
        }
        try {
            const validated = tool.inputSchema.parse(body.args ?? {});
            const result: ToolResult = await gateway.invoke({
                toolName: body.toolName,
                args: validated as Record<string, unknown>,
            });
            return result;
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            reply.code(500);
            return { error: message };
        }
    });

    await server.listen({ host: '0.0.0.0', port: PORT });
    console.log(
        `[mcp-http] ready on :${PORT} — router=${ROUTER_URL} issuer=${JWT_ISSUER_URL}`,
    );
}

main().catch((err) => {
    console.error('[mcp-http] fatal:', err);
    process.exit(1);
});
