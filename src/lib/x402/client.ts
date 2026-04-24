/**
 * x402 fetch wrapper. Wraps globalThis.fetch so that any 402 response is
 * automatically paid via the phalanx CDP wallet and retried. Used by the
 * agent to pay external providers (e.g. agentic.market PoC verification).
 */

import { x402Client } from '@x402/core/client';
import { wrapFetchWithPayment } from '@x402/fetch';
import { ExactEvmScheme, toClientEvmSigner } from '@x402/evm';
import { emitEvent } from '@/lib/events/emitter';
import { publicClient, getX402Signer } from './wallet';

const BASE_SEPOLIA_NETWORK_ID = 'eip155:84532' as const;

let cachedClient: x402Client | null = null;
let cachedForScan: string | null = null;

async function buildClient(scanId: string): Promise<x402Client> {
  const baseSigner = await getX402Signer(scanId);
  const signer = toClientEvmSigner(baseSigner, {
    readContract: publicClient.readContract.bind(publicClient),
  });
  const client = new x402Client();
  client.register(BASE_SEPOLIA_NETWORK_ID, new ExactEvmScheme(signer));
  return client;
}

export async function getX402Client(scanId: string): Promise<x402Client> {
  if (cachedClient && cachedForScan === scanId) return cachedClient;
  cachedClient = await buildClient(scanId);
  cachedForScan = scanId;
  return cachedClient;
}

export type X402Fetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export async function x402Fetch(scanId: string): Promise<X402Fetch> {
  const client = await getX402Client(scanId);
  const paid = wrapFetchWithPayment(fetch, client);
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
    const response = await paid(input, init);
    const paymentHeader = response.headers.get('x-payment-response');
    if (paymentHeader) {
      await emitEvent(scanId, {
        source: 'x402',
        type: 'x402.payment',
        data: {
          url,
          status: response.status,
          paid: true,
          paymentResponse: paymentHeader,
        },
      });
    }
    return response;
  };
}
