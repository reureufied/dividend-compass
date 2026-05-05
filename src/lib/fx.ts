// Frankfurter API for USD->KRW. Falls back to 1350 KRW/USD on failure.
const FALLBACK_USD_KRW = 1350;
let cache: { rate: number; ts: number } | null = null;
const TTL_MS = 1000 * 60 * 30; // 30 min

export async function getUsdKrwRate(): Promise<{ rate: number; fallback: boolean }> {
  if (cache && Date.now() - cache.ts < TTL_MS) {
    return { rate: cache.rate, fallback: false };
  }
  try {
    // CORS 제한이 없는 다른 무료 환율 API로 교체
const response = await fetch("https://open.er-api.com/v6/latest/USD");
const data = await response.json();

// 참고: er-api는 데이터 구조가 약간 달라서, 환율 값을 꺼내는 부분도 확인이 필요합니다.
// 보통 return data.rates.KRW; 로 되어 있다면 그대로 두셔도 됩니다!
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
