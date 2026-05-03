// Frankfurter API for USD->KRW. Falls back to 1350 KRW/USD on failure.
const FALLBACK_USD_KRW = 1350;
let cache: { rate: number; ts: number } | null = null;
const TTL_MS = 1000 * 60 * 30; // 30 min

export async function getUsdKrwRate(): Promise<{ rate: number; fallback: boolean }> {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return { rate: cache.rate, fallback: false };
  }
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=KRW");
    if (!res.ok) throw new Error("rate fetch failed");
    const data = await res.json();
    const rate = data?.rates?.KRW;
    if (typeof rate !== "number") throw new Error("invalid rate");
    cache = { rate, ts: Date.now() };
    return { rate, fallback: false };
  } catch {
    return { rate: FALLBACK_USD_KRW, fallback: true };
  }
}

export const formatKRW = (n: number) =>
  new Intl.NumberFormat("ko-KR", { style: "currency", currency: "KRW", maximumFractionDigits: 0 }).format(n);

export const formatUSD = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
