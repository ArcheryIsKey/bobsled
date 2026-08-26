export const OWNER_WALLET = (import.meta as any).env?.VITE_OWNER_WALLET || '';
export const ESCROW_HOUSE_WALLET = (import.meta as any).env?.VITE_ESCROW_HOUSE_WALLET || '';
export const PRICE_CACHE_TTL_MS = 5_000;
export const SOLANA_NETWORK = 'devnet';
export const SOLANA_FAUCET_URL = 'https://faucet.solana.com';
export const SOLANA_RPC_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/solana/rpc`
    : 'https://api.devnet.solana.com';
