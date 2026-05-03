import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { LineChart as LineIcon, TrendingUp, TrendingDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dividend } from "@/lib/dividends";

interface Snapshot {
  asset_name: string;
  snapshot_date: string;
  quantity: number;
}

interface DpsPoint {
  date: string;
  dps: number;
  amount: number;
  quantity: number;
  currency: string;
}

const formatNumber = (v: number, currency: string) => {
  if (currency === "USD") return `$${v.toFixed(4)}`;
  return `${Math.round(v).toLocaleString("ko-KR")}원`;
};

const DpsTrendChart = () => {
  const { user } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [divs, snaps] = await Promise.all([
        supabase.from("dividends").select("*").order("date", { ascending: true }),
        supabase.from("portfolio_snapshots").select("asset_name, snapshot_date, quantity").order("snapshot_date", { ascending: true }),
      ]);
      if (cancelled) return;
      setDividends((divs.data ?? []) as Dividend[]);
      setSnapshots((snaps.data ?? []) as Snapshot[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const assetNames = useMemo(() => {
    const set = new Set<string>();
    dividends.forEach((d) => set.add(d.asset_name));
    return Array.from(set).sort();
  }, [dividends]);

  useEffect(() => {
    if (!selected && assetNames.length > 0) setSelected(assetNames[0]);
  }, [assetNames, selected]);

  const points: DpsPoint[] = useMemo(() => {
    if (!selected) return [];
    const assetSnaps = snapshots
      .filter((s) => s.asset_name === selected)
      .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const assetDivs = dividends
      .filter((d) => d.asset_name === selected)
      .sort((a, b) => a.date.localeCompare(b.date));

    return assetDivs
      .map((d) => {
        // Find the most recent snapshot on or before the dividend date
        let qty = 0;
        for (const s of assetSnaps) {
          if (s.snapshot_date <= d.date) qty = Number(s.quantity);
          else break;
        }
        // Fallback: if no past snapshot, use the earliest snapshot
        if (qty === 0 && assetSnaps.length > 0) {
          qty = Number(assetSnaps[0].quantity);
        }
        const amount = Number(d.amount);
        const dps = qty > 0 ? amount / qty : 0;
        return {
          date: d.date,
          dps,
          amount,
          quantity: qty,
          currency: d.currency,
        };
      })
      .filter((p) => p.dps > 0);
  }, [selected, dividends, snapshots]);

  const currency = points[0]?.currency ?? "KRW";

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const first = points[0].dps;
    const last = points[points.length - 1].dps;
    const growth = first > 0 ? ((last - first) / first) * 100 : 0;
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const recent = points.filter((p) => new Date(p.date) >= oneYearAgo);
    const avg = recent.length > 0
      ? recent.reduce((s, p) => s + p.dps, 0) / recent.length
      : 0;
    return { growth, avg, recentCount: recent.length };
  }, [points]);

  return (
    <Card className="p-6 shadow-elev-sm">
      <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <LineIcon className="h-4 w-4 text-muted-foreground" />
          <div>
            <h3 className="font-semibold">종목별 배당 성장 추이</h3>
            <p className="text-xs text-muted-foreground mt-0.5">시점별 보유 수량 기준 1주당 배당금 변화</p>
          </div>
        </div>
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="종목 선택" />
          </SelectTrigger>
          <SelectContent>
            {assetNames.map((n) => (
              <SelectItem key={n} value={n}>{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="h-72">
        {loading ? (
          <EmptyState message="불러오는 중…" />
        ) : assetNames.length === 0 ? (
          <EmptyState message="배당금 기록이 없습니다" />
        ) : points.length === 0 ? (
          <EmptyState message="해당 종목의 시점별 보유 수량이 부족해 계산할 수 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="date"
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v) => currency === "USD" ? `$${Number(v).toFixed(2)}` : `${Math.round(Number(v))}`}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                  fontSize: 12,
                }}
                formatter={(v: number, _n, item: any) => {
                  const p = item.payload as DpsPoint;
                  return [
                    `${formatNumber(v, p.currency)} (수량 ${p.quantity})`,
                    "1주당 배당금",
                  ];
                }}
              />
              <Line
                type="monotone"
                dataKey="dps"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 4, fill: "hsl(var(--primary))" }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {stats && points.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 mt-4 pt-4 border-t border-border">
          <div className="flex items-center gap-3">
            {stats.growth >= 0 ? (
              <TrendingUp className="h-4 w-4 text-success" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
            <div>
              <div className="text-xs text-muted-foreground">첫 배당 대비 현재 성장률</div>
              <div className={`text-lg font-bold tabular-nums ${stats.growth >= 0 ? "text-success" : "text-destructive"}`}>
                {stats.growth >= 0 ? "+" : ""}{stats.growth.toFixed(1)}%
              </div>
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">최근 1년 평균 1주당 배당</div>
            <div className="text-lg font-bold tabular-nums">
              {stats.recentCount > 0 ? formatNumber(stats.avg, currency) : "데이터 없음"}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
};

const EmptyState = ({ message }: { message: string }) => (
  <div className="h-full rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground px-4 text-center">
    {message}
  </div>
);

export default DpsTrendChart;
