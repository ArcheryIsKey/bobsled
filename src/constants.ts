export const OWNER_WALLET = '11111111111111111111111111111111';
export const ESCROW_HOUSE_WALLET = '11111111111111111111111111111111';
export const PRICE_CACHE_TTL_MS = 5_000;
export const SOLANA_RPC_URL =
  typeof window !== 'undefined'
    ? `${window.location.origin}/api/solana/rpc`
    : 'https://api.mainnet-beta.solana.com';

