import { addMonths, addQuarters, differenceInDays, endOfMonth, parseISO, startOfMonth } from "date-fns";
import { Dividend } from "@/lib/dividends";

export interface PredictedDividend {
  id: string;
  date: string; // yyyy-MM-dd
  asset_name: string;
  category: string;
  amount: number;
  currency: string;
  amount_krw: number | null;
  predicted: true;
}

/**
 * Detect each asset's payment cadence (monthly/quarterly/yearly) from history,
 * then project upcoming predicted payments within [from, to].
 * Heuristic: median gap between consecutive payments per asset.
 */
export const predictDividends = (
  history: Dividend[],
  from: Date,
  to: Date
): PredictedDividend[] => {
  const byAsset = new Map<string, Dividend[]>();
  for (const d of history) {
    const arr = byAsset.get(d.asset_name) ?? [];
    arr.push(d);
    byAsset.set(d.asset_name, arr);
  }

  const out: PredictedDividend[] = [];

  byAsset.forEach((records, asset) => {
    if (records.length < 1) return;
    const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
    const last = sorted[sorted.length - 1];
    const lastDate = parseISO(last.date);

    // Compute gaps in days
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(differenceInDays(parseISO(sorted[i].date), parseISO(sorted[i - 1].date)));
    }

    let cadence: "monthly" | "quarterly" | "yearly" = "quarterly";
    if (gaps.length === 0) {
      // Only 1 record — assume quarterly default
      cadence = "quarterly";
    } else {
      const sortedGaps = [...gaps].sort((a, b) => a - b);
      const median = sortedGaps[Math.floor(sortedGaps.length / 2)];
      if (median <= 45) cadence = "monthly";
      else if (median <= 150) cadence = "quarterly";
      else cadence = "yearly";
    }

    // Average amount (use last 4 records as the most representative)
    const recent = sorted.slice(-4);
    const avgAmount =
      recent.reduce((s, r) => s + Number(r.amount), 0) / recent.length;
    const avgKrw =
      recent.reduce(
        (s, r) =>
          s + Number(r.amount_krw ?? (r.currency === "USD" ? Number(r.amount) * 1350 : Number(r.amount))),
        0
      ) / recent.length;

    // Generate future dates from lastDate up to `to`
    let next = lastDate;
    const stepFn =
      cadence === "monthly"
        ? (d: Date) => addMonths(d, 1)
        : cadence === "quarterly"
          ? (d: Date) => addQuarters(d, 1)
          : (d: Date) => addMonths(d, 12);

    // Cap iterations to avoid runaway
    for (let i = 0; i < 60; i++) {
      next = stepFn(next);
      if (next > to) break;
      if (next < from) continue;
      out.push({
        id: `pred-${asset}-${next.toISOString().slice(0, 10)}`,
        date: next.toISOString().slice(0, 10),
        asset_name: asset,
        category: last.category,
        amount: Math.round(avgAmount * 100) / 100,
        currency: last.currency,
        amount_krw: Math.round(avgKrw),
        predicted: true,
      });
    }
  });

  return out;
};

export const predictionsForMonth = (history: Dividend[], cursor: Date) =>
  predictDividends(history, startOfMonth(cursor), endOfMonth(cursor));
