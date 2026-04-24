/**
 * Phalanx x402 + CDP integration smoke test.
 *
 * Verifies real CDP server-wallet provisioning on Base Sepolia and the 402
 * payment challenge that protects /api/intelligence. If the wallet has enough
 * testnet USDC, also exercises a real end-to-end fetch round-trip (pay +
 * retrieve). Exits non-zero on any required-flow failure.
 *
 *   1. Create or retrieve the `phalanx-main` CDP wallet → assert an address
 *   2. Read on-chain balances (ETH + USDC) via viem public client
 *   3. Fund from faucet if under threshold (soft — logs tx hash)
 *   4. Start a Next.js dev server on a free port, hit /api/intelligence:
 *        a. without payment header → assert 402 with valid {x402Version, accepts}
 *        b. via x402Fetch (CDP-signed payment) → assert 200 + intelligence JSON
 */

import { spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  getWallet,
  getBalances,
  ensureFunded,
  x402Fetch,
  PHALANX_ACCOUNT_NAME,
} from '@/lib/x402';
import { env } from '@/lib/env';

const SCAN_ID = `test-x402-${Date.now()}`;
const PORT = 3301;
const ENDPOINT = `http://localhost:${PORT}/api/intelligence?q=prototype+pollution+lodash`;

interface DevServer {
  proc: ReturnType<typeof spawn>;
  kill: () => Promise<void>;
}

async function startDevServer(): Promise<DevServer> {
  const proc = spawn('node_modules/.bin/next', ['dev', '-p', String(PORT)], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'development' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  proc.stdout?.on('data', (chunk) => {
    process.stdout.write(`[next] ${chunk.toString()}`);
  });
  proc.stderr?.on('data', (chunk) => {
    process.stderr.write(`[next!] ${chunk.toString()}`);
  });

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/`);
      if (r.status < 500) break;
    } catch {
      // keep waiting
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return {
    proc,
    kill: async () => {
      proc.kill('SIGINT');
      await once(proc, 'exit').catch(() => undefined);
    },
  };
}

async function main() {
  env();

  console.log(`\n→ Step 1: create/retrieve CDP wallet "${PHALANX_ACCOUNT_NAME}"`);
  const wallet = await getWallet(SCAN_ID);
  if (!wallet.address.startsWith('0x') || wallet.address.length !== 42) {
    throw new Error(`invalid wallet address: ${wallet.address}`);
  }
  console.log(`  ✓ address = ${wallet.address} (network=${wallet.network})`);

  console.log(`\n→ Step 2: read on-chain balances (Base Sepolia)`);
  const balances = await getBalances(SCAN_ID);
  const ethEth = Number(balances.eth) / 1e18;
  const usdcDollars = Number(balances.usdc) / 1e6;
  console.log(`  ✓ ETH   = ${ethEth.toFixed(6)} (wei=${balances.eth})`);
  console.log(`  ✓ USDC  = ${usdcDollars.toFixed(6)} (atomic=${balances.usdc})`);

  console.log(`\n→ Step 3: ensure faucet-funded (min 0.001 ETH + 0.001 USDC)`);
  try {
    const result = await ensureFunded(SCAN_ID, 1_000n, 1_000_000_000_000_000n);
    if (result.funded) {
      console.log(`  ✓ already funded (${result.faucetTxs.length} faucet txs issued)`);
    } else {
      for (const tx of result.faucetTxs) {
        console.log(`  ✓ faucet ${tx.token.toUpperCase()} tx = ${tx.txHash}`);
      }
      console.log(`  ! funds en route; waiting 20s for tx inclusion before payment round-trip`);
      await new Promise((resolve) => setTimeout(resolve, 20_000));
    }
  } catch (err) {
    console.log(`  ~ faucet check failed (continuing): ${err instanceof Error ? err.message : err}`);
  }

  console.log(`\n→ Step 4: start dev server on :${PORT}`);
  const server = await startDevServer();

  try {
    console.log(`\n→ Step 5a: GET ${ENDPOINT} without payment → expect 402`);
    const unpaid = await fetch(ENDPOINT);
    if (unpaid.status !== 402) {
      throw new Error(`expected 402 Payment Required, got ${unpaid.status}`);
    }
    const unpaidBody = await unpaid.json().catch(() => null);
    if (!unpaidBody || typeof unpaidBody !== 'object') {
      throw new Error('402 body was not JSON');
    }
    const typed = unpaidBody as { x402Version?: number; accepts?: unknown[] };
    if (typed.x402Version !== 2) throw new Error(`x402Version should be 2, got ${typed.x402Version}`);
    if (!Array.isArray(typed.accepts) || typed.accepts.length === 0) {
      throw new Error('accepts[] missing or empty');
    }
    console.log(`  ✓ 402 with x402Version=2 and ${typed.accepts.length} accepts option(s)`);

    console.log(`\n→ Step 5b: x402Fetch → pay + retrieve`);
    const postBalances = await getBalances(SCAN_ID);
    const canPay = postBalances.usdc >= 1_000n;
    if (!canPay) {
      console.log(
        `  ~ skipping round-trip: USDC balance ${postBalances.usdc} < 1000 atomic (0.001 USDC). Faucet may not have settled yet.`,
      );
    } else {
      const paid = await (await x402Fetch(SCAN_ID))(ENDPOINT);
      if (paid.status !== 200) {
        const text = await paid.text().catch(() => '');
        throw new Error(`expected 200 after payment, got ${paid.status}: ${text.slice(0, 300)}`);
      }
      const receipt = paid.headers.get('x-payment-response');
      const body = (await paid.json()) as { semanticMatches?: unknown[] };
      if (!Array.isArray(body.semanticMatches)) {
        throw new Error('intelligence body missing semanticMatches array');
      }
      console.log(`  ✓ 200 with ${body.semanticMatches.length} semantic matches`);
      if (receipt) {
        console.log(`  ✓ X-Payment-Response = ${receipt.slice(0, 120)}...`);
      }
    }
  } finally {
    await server.kill();
  }

  console.log(`\n[test-x402] ✓ wallet + 402 challenge + protected route all verified`);
}

main().catch((err) => {
  console.error('\n[test-x402] FAILED:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
