import { useEffect, useMemo, useState } from "react";
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Wallet, TrendingUp, PiggyBank, Calendar as CalIcon } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Dividend } from "@/lib/dividends";
import { krwOf } from "@/lib/analytics";
import { formatKRW } from "@/lib/fx";
import { predictionsForMonth } from "@/lib/predictions";
import { cn } from "@/lib/utils";

interface Snapshot {
  asset_name: string;
  snapshot_date: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
}

const Index = () => {
  const { user } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "대시보드 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, s] = await Promise.all([
        supabase.from("dividends").select("*").order("date", { ascending: true }).limit(10000),
        supabase.from("portfolio_snapshots").select("asset_name, snapshot_date, quantity, avg_purchase_price, current_price").limit(10000),
      ]);
      if (cancelled) return;
      setDividends((d.data ?? []) as Dividend[]);
      setSnaps((s.data ?? []) as Snapshot[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const now = new Date();

  // ===== Dividend summary =====
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear(), 11, 31);

  const ytdDividend = useMemo(
    () => dividends.filter((d) => {
      const dt = parseISO(d.date);
      return dt >= yearStart && dt <= yearEnd;
    }).reduce((s, d) => s + krwOf(d), 0),
    [dividends]
  );

  const thisMonthActual = useMemo(
    () => dividends.filter((d) => {
      const dt = parseISO(d.date);
      return dt >= monthStart && dt <= monthEnd;
    }).reduce((s, d) => s + krwOf(d), 0),
    [dividends]
  );

  const thisMonthPredicted = useMemo(() => {
    const preds = predictionsForMonth(dividends, now);
    return preds.reduce((s, p) => s + Number(p.amount_krw ?? 0), 0);
  }, [dividends]);

  const expectedThisMonth = thisMonthActual + thisMonthPredicted;

  // ===== Portfolio summary (latest snapshot date) =====
  const distinctDates = useMemo(
    () => Array.from(new Set(snaps.map((s) => s.snapshot_date))).sort(),
    [snaps]
  );
  const latestDate = distinctDates[distinctDates.length - 1];
  const prevDate = distinctDates[distinctDates.length - 2];

  const totalsForDate = (date?: string) => {
    if (!date) return { value: 0, principal: 0, pnl: 0 };
    const rows = snaps.filter((s) => s.snapshot_date === date);
    const principal = rows.reduce((a, r) => a + Number(r.quantity) * Number(r.avg_purchase_price), 0);
    const value = rows.reduce((a, r) => a + Number(r.quantity) * Number(r.current_price), 0);
    return { value, principal, pnl: value - principal };
  };

  const cur = totalsForDate(latestDate);
  const prev = totalsForDate(prevDate);
  const momPct = prev.value > 0 ? ((cur.value - prev.value) / prev.value) * 100 : 0;

  // ===== Composed chart: last 6 months (assets latest-per-month + dividends sum) =====
  const composed = useMemo(() => {
    const arr: { label: string; assetValue: number; dividend: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const m = subMonths(startOfMonth(now), i);
      const mEnd = endOfMonth(m);
      const label = format(m, "yyyy-MM");
      // Latest snapshot date <= mEnd
      const candidateDates = distinctDates.filter((d) => parseISO(d) <= mEnd);
      const useDate = candidateDates[candidateDates.length - 1];
      const t = totalsForDate(useDate);
      const div = dividends.filter((d) => {
        const dt = parseISO(d.date);
        return dt >= m && dt <= mEnd;
      }).reduce((s, d) => s + krwOf(d), 0);
      arr.push({ label, assetValue: Math.round(t.value), dividend: Math.round(div) });
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snaps, dividends, distinctDates]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground mt-1">나의 자산과 배당 흐름을 한눈에 확인하세요</p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-5 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">이번 달 예상 배당</span>
            <CalIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold tabular-nums">{formatKRW(Math.round(expectedThisMonth))}</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            확정 {formatKRW(Math.round(thisMonthActual))} + 예상 {formatKRW(Math.round(thisMonthPredicted))}
          </p>
        </Card>

        <Card className="p-5 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">올해 누적 배당</span>
            <PiggyBank className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold tabular-nums">{formatKRW(Math.round(ytdDividend))}</div>
          <p className="text-[11px] text-muted-foreground mt-1">{now.getFullYear()}년 YTD</p>
        </Card>

        <Card className="p-5 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">총 자산 평가금액</span>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-xl font-bold tabular-nums">{formatKRW(Math.round(cur.value))}</div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {latestDate ? `기준 ${latestDate}` : "스냅샷 없음"}
          </p>
        </Card>

        <Card className="p-5 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">총 손익</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={cn("text-xl font-bold tabular-nums", cur.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>
            {cur.pnl >= 0 ? "+" : ""}{formatKRW(Math.round(cur.pnl))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            원금 {formatKRW(Math.round(cur.principal))}
          </p>
        </Card>

        <Card className="p-5 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">전월 대비</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={cn("text-xl font-bold tabular-nums", momPct >= 0 ? "text-emerald-500" : "text-destructive")}>
            {prev.value > 0 ? `${momPct >= 0 ? "+" : ""}${momPct.toFixed(2)}%` : "-"}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {prevDate ? `vs ${prevDate}` : "이전 스냅샷 없음"}
          </p>
        </Card>
      </div>

      {/* Composed chart */}
      <Card className="p-6 shadow-elev-sm">
        <h3 className="font-semibold mb-1">최근 6개월 자산 & 배당</h3>
        <p className="text-xs text-muted-foreground mb-4">막대: 총 자산 평가금액 · 선: 월별 받은 배당금</p>
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">불러오는 중…</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={composed} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 100000000).toFixed(1)}억`} width={56} />
                <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} width={56} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12 }}
                  formatter={(v: number) => formatKRW(Math.round(v))}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="left" dataKey="assetValue" name="총 자산 평가금액" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="dividend" name="월별 받은 배당금" stroke="hsl(var(--accent-foreground))" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
};

export default Index;
