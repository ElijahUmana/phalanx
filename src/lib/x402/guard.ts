/**
 * Next.js App Router x402 payment middleware.
 *
 * Wraps a route handler so that requests without an `X-Payment` header return
 * 402 with the required payment requirements, and paid requests are verified
 * via a facilitator before the handler runs. On success, attaches the
 * `X-Payment-Response` receipt header.
 *
 * Uses @x402/core's framework-agnostic x402HTTPResourceServer so we inherit
 * the protocol handling (scheme dispatch, verification, settlement) from the
 * upstream x402 library.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { HTTPFacilitatorClient } from '@x402/core/server';
import type {
  HTTPAdapter,
  HTTPRequestContext,
  RouteConfig,
  RoutesConfig,
} from '@x402/core/server';
import { x402HTTPResourceServer, x402ResourceServer } from '@x402/core/server';
import { ExactEvmScheme as ExactEvmServerScheme } from '@x402/evm/exact/server';
import { emitEvent } from '@/lib/events/emitter';
import { getWallet } from './wallet';

const BASE_SEPOLIA_NETWORK_ID = 'eip155:84532' as const;
const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';

/**
 * Default facilitator for EVM testnets. Operated by the x402 Foundation; for
 * production we'd point this at our own facilitator (or Coinbase's).
 */
export const DEFAULT_FACILITATOR_URL = 'https://x402.org/facilitator';

export interface X402Pricing {
  amountUsdc: string;
  description: string;
  resource: string;
}

interface CachedServer {
  httpServer: x402HTTPResourceServer;
  payTo: string;
  routesConfig: Record<string, RouteConfig>;
}

let cachedServer: CachedServer | null = null;

class NextRequestAdapter implements HTTPAdapter {
  constructor(
    private req: NextRequest,
    private bodyCache: unknown,
  ) {}
  getHeader(name: string) {
    return this.req.headers.get(name) ?? undefined;
  }
  getMethod() {
    return this.req.method;
  }
  getPath() {
    return new URL(this.req.url).pathname;
  }
  getUrl() {
    return this.req.url;
  }
  getAcceptHeader() {
    return this.req.headers.get('accept') ?? '';
  }
  getUserAgent() {
    return this.req.headers.get('user-agent') ?? '';
  }
  getQueryParams(): Record<string, string | string[]> {
    const url = new URL(this.req.url);
    const params: Record<string, string | string[]> = {};
    for (const [k, v] of url.searchParams.entries()) {
      const existing = params[k];
      if (existing === undefined) params[k] = v;
      else if (Array.isArray(existing)) existing.push(v);
      else params[k] = [existing, v];
    }
    return params;
  }
  getQueryParam(name: string) {
    const url = new URL(this.req.url);
    const all = url.searchParams.getAll(name);
    return all.length === 0 ? undefined : all.length === 1 ? all[0] : all;
  }
  getBody() {
    return this.bodyCache;
  }
}

async function getOrBuildServer(
  scanId: string,
  pricing: X402Pricing,
): Promise<CachedServer> {
  if (cachedServer) return cachedServer;

  const wallet = await getWallet(scanId);

  const facilitator = new HTTPFacilitatorClient({ url: DEFAULT_FACILITATOR_URL });
  const resourceServer = new x402ResourceServer(facilitator).register(
    BASE_SEPOLIA_NETWORK_ID,
    new ExactEvmServerScheme(),
  );

  const routeKey = `GET ${new URL(pricing.resource).pathname}`;
  const routeConfig: RouteConfig = {
    resource: pricing.resource,
    description: pricing.description,
    mimeType: 'application/json',
    accepts: [
      {
        scheme: 'exact',
        network: BASE_SEPOLIA_NETWORK_ID,
        payTo: wallet.address,
        price: {
          asset: BASE_SEPOLIA_USDC,
          amount: pricing.amountUsdc,
          extra: { name: 'USDC', version: '2' },
        },
        maxTimeoutSeconds: 60,
        extra: { name: 'USDC', version: '2' },
      },
    ],
  };
  const routesConfig: Record<string, RouteConfig> = { [routeKey]: routeConfig };

  const httpServer = new x402HTTPResourceServer(resourceServer, routesConfig);
  await httpServer.initialize();

  cachedServer = { httpServer, payTo: wallet.address, routesConfig };
  return cachedServer;
}

export type X402Handler<T = unknown> = (
  scanId: string,
  req: NextRequest,
) => Promise<{ status?: number; body: T; headers?: Record<string, string> }>;

export function x402Protected<T>(
  pricing: X402Pricing,
  handler: X402Handler<T>,
) {
  return async function protectedRoute(req: NextRequest): Promise<NextResponse> {
    const scanId = req.headers.get('x-phalanx-scan-id') ?? `x402-${Date.now()}`;
    let body: unknown = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      try {
        body = await req.clone().json();
      } catch {
        body = await req.clone().text();
      }
    }
    const { httpServer } = await getOrBuildServer(scanId, pricing);
    const url = new URL(req.url);
    const adapter = new NextRequestAdapter(req, body);
    const context: HTTPRequestContext = {
      adapter,
      path: url.pathname,
      method: req.method,
      paymentHeader: req.headers.get('x-payment') ?? undefined,
    };

    const result = await httpServer.processHTTPRequest(context);

    if (result.type === 'payment-error') {
      const { status, headers, body: respBody } = result.response;
      await emitEvent(scanId, {
        source: 'x402',
        type: 'x402.payment',
        data: {
          resource: pricing.resource,
          status,
          paid: false,
          outcome: 'payment-required',
        },
      });
      return NextResponse.json(respBody as Record<string, unknown>, { status, headers });
    }

    const outcome = await handler(scanId, req);

    if (result.type === 'no-payment-required') {
      return NextResponse.json(outcome.body as Record<string, unknown>, {
        status: outcome.status ?? 200,
        headers: outcome.headers,
      });
    }

    const settlement = await httpServer.processSettlement(
      result.paymentPayload,
      result.paymentRequirements,
      result.declaredExtensions,
    );

    if (!settlement.success) {
      const { status, headers, body: errBody } = settlement.response;
      await emitEvent(scanId, {
        source: 'x402',
        type: 'x402.payment',
        data: {
          resource: pricing.resource,
          status,
          paid: false,
          outcome: 'settlement-failed',
          errorReason: settlement.errorReason,
        },
      });
      return NextResponse.json(errBody as Record<string, unknown>, { status, headers });
    }

    await emitEvent(scanId, {
      source: 'x402',
      type: 'x402.payment',
      data: {
        resource: pricing.resource,
        status: 200,
        paid: true,
        outcome: 'settled',
        network: settlement.network,
        transaction: settlement.transaction,
      },
    });

    const headers = {
      ...(outcome.headers ?? {}),
      ...settlement.headers,
    };
    return NextResponse.json(outcome.body as Record<string, unknown>, {
      status: outcome.status ?? 200,
      headers,
    });
  };
}
