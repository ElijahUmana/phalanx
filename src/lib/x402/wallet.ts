/**
 * CDP server-wallet integration for x402 payments on Base Sepolia.
 *
 * Creates or retrieves a named EVM account via the Coinbase Developer Platform
 * SDK, funds it from the Base Sepolia USDC + ETH faucets on first use, and
 * exposes a viem-compatible signer (satisfying x402's ClientEvmSigner shape)
 * together with a public client for on-chain reads.
 */

import { createPublicClient, http, type Address } from 'viem';
import { baseSepolia } from 'viem/chains';
import { CdpClient, type EvmServerAccount } from '@coinbase/cdp-sdk';
import { env } from '@/lib/env';
import { emitEvent } from '@/lib/events/emitter';
import type { FaucetResult, PhalanxWallet } from './types';

export const PHALANX_ACCOUNT_NAME = 'phalanx-main';
export const BASE_SEPOLIA_CHAIN_ID = 84532;
export const BASE_SEPOLIA_USDC = '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const;

let cdpClient: CdpClient | null = null;
let cachedAccount: EvmServerAccount | null = null;

function getCdp(): CdpClient {
  if (cdpClient) return cdpClient;
  const e = env();
  if (!e.CDP_API_KEY_ID || !e.CDP_API_KEY_SECRET) {
    throw new Error(
      'x402/wallet requires CDP_API_KEY_ID and CDP_API_KEY_SECRET to be set in .env.local',
    );
  }
  cdpClient = new CdpClient({
    apiKeyId: e.CDP_API_KEY_ID,
    apiKeySecret: e.CDP_API_KEY_SECRET,
    walletSecret: e.CDP_WALLET_SECRET,
  });
  return cdpClient;
}

export async function getOrCreateAccount(
  _scanId: string,
  name = PHALANX_ACCOUNT_NAME,
): Promise<EvmServerAccount> {
  if (cachedAccount && cachedAccount.name === name) return cachedAccount;
  const cdp = getCdp();
  const account = await cdp.evm.getOrCreateAccount({ name });
  cachedAccount = account;
  return account;
}

export async function getWallet(scanId: string): Promise<PhalanxWallet> {
  const account = await getOrCreateAccount(scanId);
  return {
    address: account.address,
    network: 'base-sepolia',
    cdpAccountName: account.name ?? PHALANX_ACCOUNT_NAME,
  };
}

export const publicClient = createPublicClient({
  chain: baseSepolia,
  transport: http(),
});

export async function getBalances(
  scanId: string,
): Promise<{ eth: bigint; usdc: bigint }> {
  const account = await getOrCreateAccount(scanId);
  const [ethWei, usdc] = await Promise.all([
    publicClient.getBalance({ address: account.address }),
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
      args: [account.address],
    }),
  ]);
  return { eth: ethWei, usdc: usdc as bigint };
}

export async function fundFromFaucet(
  scanId: string,
  tokens: Array<'eth' | 'usdc'> = ['eth', 'usdc'],
): Promise<FaucetResult[]> {
  const cdp = getCdp();
  const account = await getOrCreateAccount(scanId);
  const results: FaucetResult[] = [];
  for (const token of tokens) {
    const { transactionHash } = await cdp.evm.requestFaucet({
      address: account.address,
      network: 'base-sepolia',
      token,
    });
    results.push({ txHash: transactionHash, token, address: account.address as Address });

    await emitEvent(scanId, {
      source: 'x402',
      type: 'x402.faucet',
      data: {
        address: account.address,
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
): Promise<{ funded: boolean; faucetTxs: FaucetResult[]; balances: { eth: bigint; usdc: bigint } }> {
  const balances = await getBalances(scanId);
  const needsEth = balances.eth < minEthWei;
  const needsUsdc = balances.usdc < minUsdc;
  if (!needsEth && !needsUsdc) {
    return { funded: true, faucetTxs: [], balances };
  }
  const requested: Array<'eth' | 'usdc'> = [];
  if (needsEth) requested.push('eth');
  if (needsUsdc) requested.push('usdc');
  const faucetTxs = await fundFromFaucet(scanId, requested);
  return { funded: false, faucetTxs, balances };
}

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

/**
 * Adapts the CDP EvmServerAccount into the minimal ClientEvmSigner shape
 * that @x402/evm's toClientEvmSigner expects. The CDP account's signTypedData
 * takes the same {domain, types, primaryType, message} arguments but types
 * them more strictly — we pass them through as-is.
 */
export async function getX402Signer(scanId: string): Promise<X402CompatibleSigner> {
  const account = await getOrCreateAccount(scanId);
  return {
    address: account.address,
    signTypedData: (args) =>
      (account.signTypedData as (a: SignTypedDataArgs) => Promise<`0x${string}`>)(args),
  };
}
