// x402 payment rails + CDP wallet — Task #7
// USDC micropayments on Base Sepolia, CDP server-wallet, agentic.market integration.
export * from './types';
export {
  getOrCreateAccount,
  getWallet,
  getBalances,
  fundFromFaucet,
  ensureFunded,
  getX402Signer,
  getWalletCustody,
  resolveWallet,
  publicClient,
  PHALANX_ACCOUNT_NAME,
  BASE_SEPOLIA_CHAIN_ID,
  BASE_SEPOLIA_USDC,
} from './wallet';
export { getX402Client, x402Fetch, type X402Fetch } from './client';
export {
  x402Protected,
  DEFAULT_FACILITATOR_URL,
  type X402Pricing,
  type X402Handler,
} from './guard';
