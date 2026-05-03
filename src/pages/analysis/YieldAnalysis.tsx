import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
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

interface Snapshot {
  asset_name: string;
  snapshot_date: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
}

interface Row {
  name: string;
  principal: number;
  value: number;
  dividend: number;
  yieldPct: number;
  sold: boolean; // true when no snapshot found
}

const YieldAnalysis = () => {
  const { user } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, s] = await Promise.all([
        supabase.from("dividends").select("*").limit(10000),
        supabase
          .from("portfolio_snapshots")
          .select("asset_name, snapshot_date, quantity, avg_purchase_price, current_price")
          .limit(10000),
      ]);
      if (cancelled) return;
      setDividends((d.data ?? []) as Dividend[]);
      setSnaps((s.data ?? []) as Snapshot[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Latest snapshot per asset
  const latestByAsset = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const s of snaps) {
      const cur = map.get(s.asset_name);
      if (!cur || s.snapshot_date > cur.snapshot_date) map.set(s.asset_name, s);
    }
    return map;
  }, [snaps]);

  const rows: Row[] = useMemo(() => {
    const divMap = new Map<string, number>();
    for (const d of dividends)
      divMap.set(d.asset_name, (divMap.get(d.asset_name) ?? 0) + krwOf(d));

    const names = new Set<string>([...divMap.keys(), ...latestByAsset.keys()]);
    return Array.from(names).map((name) => {
      const snap = latestByAsset.get(name);
      const principal = snap ? Number(snap.quantity) * Number(snap.avg_purchase_price) : 0;
      const value = snap ? Number(snap.quantity) * Number(snap.current_price) : 0;
      const dividend = Math.round(divMap.get(name) ?? 0);
      const yieldPct = principal > 0 ? (dividend / principal) * 100 : 0;
      return { name, principal, value, dividend, yieldPct, sold: !snap };
    });
  }, [dividends, latestByAsset]);

  const heldRows = useMemo(() => rows.filter((r) => !r.sold), [rows]);
  const soldRows = useMemo(
    () => rows.filter((r) => r.sold && r.dividend > 0).sort((a, b) => b.dividend - a.dividend),
    [rows]
  );

  const ranked = useMemo(
    () => [...heldRows].filter((r) => r.principal > 0).sort((a, b) => b.yieldPct - a.yieldPct),
    [heldRows]
  );

  const chartData = useMemo(() => ranked.slice(0, 10).map((r) => ({
    name: r.name,
    yieldPct: Number(r.yieldPct.toFixed(2)),
  })), [ranked]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">수익률 분석</h1>
        <p className="text-muted-foreground mt-1">
          포트폴리오 스냅샷의 가장 최근 투자 원금과 누적 배당금을 결합해 자동으로 계산해요.
        </p>
      </header>

      {/* Yield ranking chart */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-1">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="font-semibold">투자금 대비 배당 수익률 랭킹</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-4">상위 10개 종목 · Yield on Cost(%)</p>
        <div className="h-80">
          {loading ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">불러오는 중…</div>
          ) : chartData.length === 0 ? (
            <div className="h-full rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground text-center px-6">
              포트폴리오 스냅샷 또는 배당 내역을 먼저 등록하면 자동으로 분석돼요.
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
                  unit="%"
                  width={48}
                />
                <Tooltip
                  cursor={{ fill: "hsl(var(--accent))", opacity: 0.4 }}
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [`${v.toFixed(2)}%`, "수익률"]}
                />
                <Bar dataKey="yieldPct" name="수익률" radius={[6, 6, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill="hsl(var(--primary))" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Detail table */}
      <Card className="shadow-elev-sm overflow-hidden">
        <div className="p-6 pb-3 flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">종목별 배당 수익률</h3>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-muted-foreground">불러오는 중…</div>
        ) : heldRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            보유 종목 스냅샷이 아직 없어요. 포트폴리오 페이지에서 스냅샷을 등록해 주세요.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목명</TableHead>
                  <TableHead className="text-right">최근 투자원금</TableHead>
                  <TableHead className="text-right">현재 평가금액</TableHead>
                  <TableHead className="text-right">총 누적 배당금</TableHead>
                  <TableHead className="text-right">투자금 대비 배당 수익률</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...heldRows]
                  .sort((a, b) => b.yieldPct - a.yieldPct)
                  .map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.principal > 0 ? formatKRW(Math.round(r.principal)) : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.value > 0 ? formatKRW(Math.round(r.value)) : <span className="text-muted-foreground">-</span>}
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
                          <span className="text-muted-foreground">0%</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}

        {soldRows.length > 0 && (
          <div className="border-t border-border">
            <div className="p-6 pb-2">
              <h4 className="font-semibold text-sm">매도 후에도 누적된 배당금</h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                현재 보유 스냅샷이 없는 종목이에요. 과거에 받은 배당금만 합산해 표시합니다.
              </p>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>종목명</TableHead>
                    <TableHead className="text-right">투자원금</TableHead>
                    <TableHead className="text-right">총 누적 배당금</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {soldRows.map((r) => (
                    <TableRow key={r.name}>
                      <TableCell className="font-medium">
                        {r.name} <span className="text-xs text-muted-foreground ml-1">(매도됨)</span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">0원</TableCell>
                      <TableCell className="text-right tabular-nums">{formatKRW(r.dividend)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
};

export default Analysis;
