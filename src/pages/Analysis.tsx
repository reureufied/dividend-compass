import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Trophy, BarChart3 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dividend } from "@/lib/dividends";
import { krwOf } from "@/lib/analytics";
import { formatKRW } from "@/lib/fx";

interface PortfolioRow {
  asset_name: string;
  principal: number;
}

interface Row {
  name: string;
  principal: number;
  dividend: number;
  yieldPct: number;
}

const Analysis = () => {
  const { user } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "수익률 분석 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, p] = await Promise.all([
        supabase.from("dividends").select("*"),
        supabase.from("portfolio").select("asset_name, principal"),
      ]);
      if (cancelled) return;
      setDividends((d.data ?? []) as Dividend[]);
      setPortfolio((p.data ?? []) as PortfolioRow[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const rows: Row[] = useMemo(() => {
    const divMap = new Map<string, number>();
    for (const d of dividends) divMap.set(d.asset_name, (divMap.get(d.asset_name) ?? 0) + krwOf(d));

    const principalMap = new Map<string, number>();
    for (const p of portfolio) principalMap.set(p.asset_name, Number(p.principal) || 0);

    const names = new Set<string>([...divMap.keys(), ...principalMap.keys()]);
    return Array.from(names).map((name) => {
      const principal = principalMap.get(name) ?? 0;
      const dividend = Math.round(divMap.get(name) ?? 0);
      const yieldPct = principal > 0 ? (dividend / principal) * 100 : 0;
      return { name, principal, dividend, yieldPct };
    });
  }, [dividends, portfolio]);

  const ranked = useMemo(
    () => [...rows].filter((r) => r.principal > 0).sort((a, b) => b.yieldPct - a.yieldPct),
    [rows]
  );

  const chartData = useMemo(
    () =>
      [...rows]
        .filter((r) => r.principal > 0 || r.dividend > 0)
        .sort((a, b) => b.principal + b.dividend - (a.principal + a.dividend))
        .slice(0, 10),
    [rows]
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">수익률 분석</h1>
        <p className="text-muted-foreground mt-1">
          종목별 투자 원금 대비 누적 배당률(Yield on Cost)을 확인하세요
        </p>
      </header>

      {/* Top yield list */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="font-semibold">수익률 Top 종목</h3>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        ) : ranked.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            마이페이지의 '투자 원금'에서 종목별 원금을 먼저 입력해주세요.
          </p>
        ) : (
          <ul className="space-y-3">
            {ranked.slice(0, 5).map((r, i) => {
              const max = ranked[0].yieldPct || 1;
              return (
                <li key={r.name} className="flex items-center gap-4">
                  <span className="w-6 text-sm font-bold text-muted-foreground tabular-nums">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1.5 gap-2">
                      <span className="font-medium truncate">{r.name}</span>
                      <span className="font-semibold tabular-nums text-sm">
                        {r.yieldPct.toFixed(2)}%
                      </span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                        style={{ width: `${(r.yieldPct / max) * 100}%` }}
                      />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                      배당 {formatKRW(r.dividend)} / 원금 {formatKRW(r.principal)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Comparison bar chart */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-1">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">투자 원금 vs 누적 배당</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">상위 10개 종목 기준</p>
        <div className="h-80">
          {chartData.length === 0 ? (
            <div className="h-full rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
              데이터가 없습니다
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) => compactKRW(v as number)}
                  width={56}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number, n) => [formatKRW(v), n as string]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="principal" name="투자 원금" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="dividend" name="누적 배당" fill="hsl(var(--chart-1))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Detail table */}
      <Card className="shadow-elev-sm overflow-hidden">
        <div className="p-6 pb-3">
          <h3 className="font-semibold">종목별 상세</h3>
        </div>
        {rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            아직 데이터가 없습니다.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목</TableHead>
                  <TableHead className="text-right">투자 원금</TableHead>
                  <TableHead className="text-right">누적 배당</TableHead>
                  <TableHead className="text-right">수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...rows]
                  .sort((a, b) => b.yieldPct - a.yieldPct)
                  .map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.principal > 0 ? formatKRW(r.principal) : <span className="text-muted-foreground">미입력</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatKRW(r.dividend)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.principal > 0 ? (
                          <Badge variant="secondary" className="tabular-nums">
                            {r.yieldPct.toFixed(2)}%
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
};

const compactKRW = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return `${v}`;
};

export default Analysis;
