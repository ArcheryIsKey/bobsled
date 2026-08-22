import { useState, useEffect } from 'react';

let cachedSolPrice: number | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache

const listeners = new Set<(price: number | null) => void>();

async function fetchLiveSolPrice(): Promise<number | null> {
  const now = Date.now();
  if (cachedSolPrice !== null && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedSolPrice;
  }

  // 1. Try Coinbase API (100% CORS-friendly, zero rate limits)
  try {
    const res = await fetch('https://api.coinbase.com/v2/prices/SOL-USD/spot');
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data?.data?.amount);
      if (!isNaN(price) && price > 0) {
        cachedSolPrice = price;
        lastFetchTime = now;
        notifyListeners(price);
        return price;
      }
    }
  } catch (e) {
    // try fallback
  }

  // 2. Try CoinGecko API
  try {
    const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    if (res.ok) {
      const data = await res.json();
      const price = data?.solana?.usd;
      if (typeof price === 'number' && price > 0) {
        cachedSolPrice = price;
        lastFetchTime = now;
        notifyListeners(price);
        return price;
      }
    }
  } catch (e) {
    // fallback
  }

  // 3. Try Binance API
  try {
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT');
    if (res.ok) {
      const data = await res.json();
      const price = parseFloat(data.price);
      if (!isNaN(price) && price > 0) {
        cachedSolPrice = price;
        lastFetchTime = now;
        notifyListeners(price);
        return price;
      }
    }
  } catch (e) {
    // try fallback
  }

  return cachedSolPrice;
}

function notifyListeners(price: number | null) {
  listeners.forEach((listener) => listener(price));
}

export function useSolPrice() {
  const [price, setPrice] = useState<number | null>(cachedSolPrice);

  useEffect(() => {
    // Register listener
    listeners.add(setPrice);

    // Initial fetch
    fetchLiveSolPrice().then((p) => {
      if (p !== null) setPrice(p);
    });

    // Periodic refresh
    const interval = setInterval(() => {
      fetchLiveSolPrice().then((p) => {
        if (p !== null) setPrice(p);
      });
    }, CACHE_TTL_MS);

    return () => {
      listeners.delete(setPrice);
      clearInterval(interval);
    };
  }, []);

  const formatUsd = (solAmount: number): string => {
    if (price === null || isNaN(solAmount)) return '';
    const usd = solAmount * price;
    if (usd < 0.01 && usd > 0) return '< $0.01';
    return `$${usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  return {
    solPrice: price,
    formatUsd,
    getUsdValue: (solAmount: number) => (price ? solAmount * price : null),
  };
}
