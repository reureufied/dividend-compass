import { Dividend } from "@/lib/dividends";
import { differenceInMonths, format, parseISO } from "date-fns";

export const krwOf = (d: Dividend) =>
  Number(d.amount_krw ?? (d.currency === "USD" ? Number(d.amount) * 1350 : Number(d.amount)));

export const filterByRange = (items: Dividend[], from: Date, to: Date) => {
  const f = from.getTime();
  const t = to.getTime() + 24 * 60 * 60 * 1000 - 1;
  return items.filter((d) => {
    const ts = parseISO(d.date).getTime();
    return ts >= f && ts <= t;
  });
};

export const sumKRW = (items: Dividend[]) => items.reduce((s, d) => s + krwOf(d), 0);

export interface SeriesPoint {
  label: string;
  amount: number;
}

export const groupForChart = (items: Dividend[], from: Date, to: Date): SeriesPoint[] => {
  const months = differenceInMonths(to, from);
  const useYear = months > 24;
  const map = new Map<string, number>();
  for (const d of items) {
    const dt = parseISO(d.date);
    const key = useYear ? format(dt, "yyyy") : format(dt, "yyyy-MM");
    map.set(key, (map.get(key) ?? 0) + krwOf(d));
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => ({
      label: useYear ? k : k.slice(2).replace("-", "."),
      amount: Math.round(v),
    }));
};

export const groupByCategory = (items: Dividend[]) => {
  const map = new Map<string, number>();
  for (const d of items) {
    map.set(d.category, (map.get(d.category) ?? 0) + krwOf(d));
  }
  return Array.from(map.entries())
    .map(([name, value]) => ({ name, value: Math.round(value) }))
    .sort((a, b) => b.value - a.value);
};

export const topAssets = (items: Dividend[], n = 5) => {
  const map = new Map<string, number>();
  for (const d of items) {
    map.set(d.asset_name, (map.get(d.asset_name) ?? 0) + krwOf(d));
  }
  return Array.from(map.entries())
    .map(([name, total]) => ({ name, total: Math.round(total) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
};
