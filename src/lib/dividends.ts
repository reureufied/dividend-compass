export const CATEGORIES = [
  "한국 ETF",
  "미국 ETF",
  "한국 주식",
  "미국 주식",
  "채권",
] as const;

export type Category = (typeof CATEGORIES)[number];
export type Currency = "USD" | "KRW";

export interface Dividend {
  id: string;
  user_id: string;
  date: string;
  asset_name: string;
  category: string;
  amount: number;
  currency: string;
  amount_krw: number | null;
  created_at: string;
}
