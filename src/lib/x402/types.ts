import type { Address } from 'viem';

export type X402Network = 'base-sepolia' | 'base';

export interface PhalanxWallet {
  address: Address;
  network: X402Network;
  cdpAccountName: string;
}

export interface FaucetResult {
  txHash: string;
  token: 'eth' | 'usdc' | 'eurc' | 'cbbtc';
  address: Address;
}

export interface PaymentRequirementsV2 {
  x402Version: number;
  accepts: Array<{
    scheme: 'exact';
    network: string;
    maxAmountRequired: string;
    resource: string;
    description: string;
    mimeType: string;
    payTo: string;
    maxTimeoutSeconds: number;
    asset: string;
    extra: {
      name?: string;
      version?: string;
    };
  }>;
  error?: string;
}

export interface PaymentResponseReceipt {
  success: boolean;
  transaction?: string;
  network?: string;
  errorReason?: string;
}
