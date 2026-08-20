import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
];

export async function fetchSolBalanceDirect(walletAddress: string): Promise<number> {
  if (!walletAddress) return 0;

  for (const endpoint of RPC_ENDPOINTS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getBalance',
          params: [walletAddress, { commitment: 'confirmed' }],
        }),
      });

      if (!res.ok) continue;
      const data = await res.json();
      if (data?.result?.value !== undefined && typeof data.result.value === 'number') {
        return data.result.value / LAMPORTS_PER_SOL;
      }
    } catch {
      // try next RPC endpoint
    }
  }

  return 0;
}
