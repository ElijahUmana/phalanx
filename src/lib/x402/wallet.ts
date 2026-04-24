/**
 * x402 payment wallet for Phalanx.
 *
 * Two custody modes:
 *
 *   1. CDP server wallet (preferred) — when `CDP_API_KEY_ID`,
 *      `CDP_API_KEY_SECRET`, and `CDP_WALLET_SECRET` are all set, we provision
 *      a named EVM account via the Coinbase Developer Platform SDK. The
 *      SDK owns the private key; we get signing + faucet via API.
 *
 *   2. Local viem account (fallback) — when no `CDP_WALLET_SECRET`, we derive
 *      an EOA from `PHALANX_WALLET_PRIVATE_KEY`. On first use we generate
 *      one, persist it back to `.env.local`, and use viem's `privateKeyToAccount`.
 *      The CDP faucet API needs the walletSecret so falls back too — in that
 *      mode the test skips the funding round-trip and the operator funds
 *      manually (Coinbase faucet, Alchemy, etc).
 *
 * Either way, the exported signer satisfies x402's `ClientEvmSigner` shape.
 */

import { appendFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { CdpClient, type EvmServerAccount } from '@coinbase/cdp-sdk';
import { env } from '@/lib/env';
import { emitEvent } from '@/lib/events/emitter';
import type { FaucetResult, PhalanxWallet } from './types';

export const PHALANX_ACCOUNT_NAME = 'phalanx-main';
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

type SignTypedDataArgs = {
  domain: Record<string, unknown>;
  types: Record<string, unknown>;
  primaryType: string;
  message: Record<string, unknown>;
};

export interface X402CompatibleSigner {
  readonly address: Address;
  signTypedData: (args: SignTypedDataArgs) => Promise<`0x${string}`>;
}

export type WalletCustody = 'cdp' | 'local';

export interface ResolvedWallet {
  address: Address;
  custody: WalletCustody;
  signer: X402CompatibleSigner;
  cdpAccount?: EvmServerAccount;
}

let cdpClient: CdpClient | null = null;
let cachedResolved: ResolvedWallet | null = null;

function hasCdpWalletCreds(): boolean {
  const e = env();
  return Boolean(e.CDP_API_KEY_ID && e.CDP_API_KEY_SECRET && e.CDP_WALLET_SECRET);
}

function getCdp(): CdpClient {
  if (cdpClient) return cdpClient;
  const e = env();
  if (!e.CDP_API_KEY_ID || !e.CDP_API_KEY_SECRET || !e.CDP_WALLET_SECRET) {
    throw new Error(
      'CDP server-wallet mode requires CDP_API_KEY_ID + CDP_API_KEY_SECRET + CDP_WALLET_SECRET in .env.local',
    );
  }
  cdpClient = new CdpClient({
    apiKeyId: e.CDP_API_KEY_ID,
    apiKeySecret: e.CDP_API_KEY_SECRET,
    walletSecret: e.CDP_WALLET_SECRET,
  });
  return cdpClient;
}

function getOrCreateLocalPrivateKey(): `0x${string}` {
  const e = env();
  if (e.PHALANX_WALLET_PRIVATE_KEY && /^0x[0-9a-fA-F]{64}$/.test(e.PHALANX_WALLET_PRIVATE_KEY)) {
    return e.PHALANX_WALLET_PRIVATE_KEY as `0x${string}`;
  }
  const pk = generatePrivateKey();
  const envPath = '.env.local';
  if (existsSync(envPath)) {
    const existing = readFileSync(envPath, 'utf8');
    if (existing.includes('PHALANX_WALLET_PRIVATE_KEY=')) {
      const rewritten = existing.replace(
        /^PHALANX_WALLET_PRIVATE_KEY=.*$/m,
        `PHALANX_WALLET_PRIVATE_KEY=${pk}`,
      );
      writeFileSync(envPath, rewritten, 'utf8');
    } else {
      appendFileSync(envPath, `\nPHALANX_WALLET_PRIVATE_KEY=${pk}\n`, 'utf8');
    }
  } else {
    writeFileSync(envPath, `PHALANX_WALLET_PRIVATE_KEY=${pk}\n`, 'utf8');
  }
  process.env.PHALANX_WALLET_PRIVATE_KEY = pk;
  return pk;
}

async function resolveCdpWallet(
  _scanId: string,
  name: string,
): Promise<ResolvedWallet> {
  const cdp = getCdp();
  const account = await cdp.evm.getOrCreateAccount({ name });
  return {
    address: account.address,
    custody: 'cdp',
    cdpAccount: account,
    signer: {
      address: account.address,
      signTypedData: (args) =>
        (account.signTypedData as (a: SignTypedDataArgs) => Promise<`0x${string}`>)(args),
    },
  };
}

function resolveLocalWallet(): ResolvedWallet {
  const pk = getOrCreateLocalPrivateKey();
  const account = privateKeyToAccount(pk);
  return {
    address: account.address,
    custody: 'local',
    signer: {
      address: account.address,
      signTypedData: async (args) =>
        (account.signTypedData as (a: Record<string, unknown>) => Promise<`0x${string}`>)({
          domain: args.domain,
          types: args.types,
          primaryType: args.primaryType,
          message: args.message,
        }),
    },
  };
}

export async function resolveWallet(
  scanId: string,
  name = PHALANX_ACCOUNT_NAME,
): Promise<ResolvedWallet> {
  if (cachedResolved) return cachedResolved;
  cachedResolved = hasCdpWalletCreds()
    ? await resolveCdpWallet(scanId, name)
    : resolveLocalWallet();
  return cachedResolved;
}

export async function getOrCreateAccount(
  scanId: string,
  name = PHALANX_ACCOUNT_NAME,
): Promise<EvmServerAccount> {
  const resolved = await resolveWallet(scanId, name);
  if (!resolved.cdpAccount) {
    throw new Error(
      `CDP account not available (custody=${resolved.custody}). Set CDP_WALLET_SECRET to use CDP server wallets.`,
    );
  }
  return resolved.cdpAccount;
}

export async function getWallet(scanId: string): Promise<PhalanxWallet> {
  const resolved = await resolveWallet(scanId);
  return {
    address: resolved.address,
    network: 'base-sepolia',
    cdpAccountName: PHALANX_ACCOUNT_NAME,
  };
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export async function getBalances(
  scanId: string,
): Promise<{ eth: bigint; usdc: bigint }> {
  const resolved = await resolveWallet(scanId);
  const [ethWei, usdc] = await Promise.all([
    publicClient.getBalance({ address: resolved.address }),
    publicClient.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: [
        {
          type: 'function',
          name: 'balanceOf',
          stateMutability: 'view',
          inputs: [{ name: 'owner', type: 'address' }],
          outputs: [{ type: 'uint256' }],
        },
      ] as const,
      functionName: 'balanceOf',
      args: [resolved.address],
    }),
  ]);
  return { eth: ethWei, usdc: usdc as bigint };
}

export async function fundFromFaucet(
  scanId: string,
  tokens: Array<'eth' | 'usdc'> = ['eth', 'usdc'],
): Promise<FaucetResult[]> {
  const resolved = await resolveWallet(scanId);
  if (resolved.custody !== 'cdp' || !resolved.cdpAccount) {
    throw new Error(
      'CDP faucet unavailable in local-wallet mode. Fund ' +
        resolved.address +
        ' manually via https://portal.cdp.coinbase.com/products/faucet or a public Base Sepolia faucet.',
    );
  }
  const cdp = getCdp();
  const results: FaucetResult[] = [];
  for (const token of tokens) {
    const { transactionHash } = await cdp.evm.requestFaucet({
      address: resolved.address,
      network: 'base-sepolia',
      token,
    });
    results.push({ txHash: transactionHash, token, address: resolved.address });
    await emitEvent(scanId, {
      source: 'x402',
      type: 'x402.faucet',
      data: {
        address: resolved.address,
        token,
        network: 'base-sepolia',
        txHash: transactionHash,
      },
    });
  }
  return results;
}

export async function ensureFunded(
  scanId: string,
  minUsdc = 1_000n,
  minEthWei = 1_000_000_000_000_000n,
): Promise<{
  funded: boolean;
  faucetTxs: FaucetResult[];
  balances: { eth: bigint; usdc: bigint };
  custody: WalletCustody;
}> {
  const resolved = await resolveWallet(scanId);
  const balances = await getBalances(scanId);
  const needsEth = balances.eth < minEthWei;
  const needsUsdc = balances.usdc < minUsdc;
  if (!needsEth && !needsUsdc) {
    return { funded: true, faucetTxs: [], balances, custody: resolved.custody };
  }
  if (resolved.custody === 'local') {
    return { funded: false, faucetTxs: [], balances, custody: resolved.custody };
  }
  const requested: Array<'eth' | 'usdc'> = [];
  if (needsEth) requested.push('eth');
  if (needsUsdc) requested.push('usdc');
  const faucetTxs = await fundFromFaucet(scanId, requested);
  return { funded: false, faucetTxs, balances, custody: resolved.custody };
}

export async function getX402Signer(scanId: string): Promise<X402CompatibleSigner> {
  const resolved = await resolveWallet(scanId);
  return resolved.signer;
}

export async function getWalletCustody(scanId: string): Promise<WalletCustody> {
  const resolved = await resolveWallet(scanId);
  return resolved.custody;
}
