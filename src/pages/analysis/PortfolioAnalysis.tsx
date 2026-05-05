import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateFilterBar, DateRange, computeRange } from "@/components/DateFilterBar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { formatKRW } from "@/lib/fx";

interface Snapshot {
  id: string;
  snapshot_date: string;
  asset_name: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
  target_weight: number;
  created_at: string;
  updated_at: string;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent-foreground))",
  "hsl(217 91% 60%)",
  "hsl(142 76% 36%)",
  "hsl(38 92% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 65% 60%)",
  "hsl(190 80% 45%)",
  "hsl(25 95% 53%)",
  "hsl(160 60% 45%)",
];

const PortfolioAnalysis = () => {
  const { user } = useAuth();
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<DateRange>(computeRange("3m"));
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [trendAsset, setTrendAsset] = useState<string>("");
  const [trendSortAsc, setTrendSortAsc] = useState<boolean>(true);

  const loadSnaps = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("portfolio_snapshots")
      .select("*")
      .order("snapshot_date", { ascending: false });
    if (error) toast.error(error.message);
    setSnaps((data ?? []) as Snapshot[]);
    setLoading(false);
  };

  useEffect(() => { loadSnaps(); }, [user]);

  const filteredSnaps = useMemo(() => {
    const fromMs = range.from.getTime();
    const toMs = new Date(range.to).setHours(23, 59, 59, 999);
    return snaps.filter((s) => {
      const c = s.created_at ? new Date(s.created_at).getTime() : 0;
      const u = s.updated_at ? new Date(s.updated_at).getTime() : 0;
      const t = Math.max(c, u);
      return t >= fromMs && t <= toMs;
    });
  }, [snaps, range]);

  const distinctDates = useMemo(() => {
    return Array.from(new Set(filteredSnaps.map((s) => s.snapshot_date))).sort((a, b) => (a < b ? 1 : -1));
  }, [filteredSnaps]);

  useEffect(() => {
    if (!selectedDate && distinctDates.length > 0) setSelectedDate(distinctDates[0]);
  }, [distinctDates, selectedDate]);

  const view1Rows = useMemo(() => {
    const rows = filteredSnaps.filter((s) => s.snapshot_date === selectedDate);
    const enriched = rows.map((s) => {
      const principal = s.quantity * s.avg_purchase_price;
      const value = s.quantity * s.current_price;
      const pnl = value - principal;
      const yieldPct = principal > 0 ? (pnl / principal) * 100 : 0;
      return { ...s, principal, value, pnl, yieldPct };
    });
    const totalValue = enriched.reduce((a, b) => a + b.value, 0);
    return enriched
      .map((e) => ({ ...e, currentWeight: totalValue > 0 ? (e.value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }, [filteredSnaps, selectedDate]);

  const view1Totals = useMemo(() => {
    const principal = view1Rows.reduce((a, b) => a + b.principal, 0);
    const value = view1Rows.reduce((a, b) => a + b.value, 0);
    const pnl = value - principal;
    return { principal, value, pnl, yieldPct: principal > 0 ? (pnl / principal) * 100 : 0 };
  }, [view1Rows]);

  const weightCompareData = useMemo(
    () => view1Rows.map((r) => ({
      name: r.asset_name,
      "목표 비중": Number(r.target_weight.toFixed(2)),
      "현재 비중": Number(r.currentWeight.toFixed(2)),
    })),
    [view1Rows]
  );

  const seriesData = useMemo(() => {
    const byDate = new Map<string, { date: string; principal: number; value: number }>();
    filteredSnaps.forEach((s) => {
      const cur = byDate.get(s.snapshot_date) ?? { date: s.snapshot_date, principal: 0, value: 0 };
      cur.principal += s.quantity * s.avg_purchase_price;
      cur.value += s.quantity * s.current_price;
      byDate.set(s.snapshot_date, cur);
    });
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredSnaps]);

  const allAssets = useMemo(() => Array.from(new Set(filteredSnaps.map((s) => s.asset_name))).sort(), [filteredSnaps]);

  const trendRows = useMemo(() => {
    if (!trendAsset) return [];
    return filteredSnaps
      .filter((s) => s.asset_name === trendAsset)
      .map((s) => {
        const principal = s.quantity * s.avg_purchase_price;
        const value = s.quantity * s.current_price;
        return {
          date: s.snapshot_date,
          quantity: s.quantity,
          avg_purchase_price: s.avg_purchase_price,
          current_price: s.current_price,
          principal,
          value,
          pnl: value - principal,
        };
      })
      .sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredSnaps, trendAsset]);

  const trendTableRows = useMemo(() => {
    const arr = [...trendRows];
    arr.sort((a, b) => (trendSortAsc ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1));
    return arr;
  }, [trendRows, trendSortAsc]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">포트폴리오 분석</h2>
        <p className="text-muted-foreground text-sm mt-1">
          자산 기록을 바탕으로 비중, 수익률, 시계열 변동을 시각화합니다.
        </p>
      </div>

      <Card className="p-4 shadow-elev-sm animate-fade-in">
        <DateFilterBar value={range} onChange={setRange} />
      </Card>

      <Tabs defaultValue="point" className="space-y-4">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="point">시점 분석</TabsTrigger>
          <TabsTrigger value="series">변동 추이</TabsTrigger>
          <TabsTrigger value="trend">종목 추이</TabsTrigger>
        </TabsList>

        {/* ===== View 1: 시점 분석 ===== */}
        <TabsContent value="point" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">조회 날짜 선택</span>
            <Select value={selectedDate} onValueChange={setSelectedDate}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="날짜 선택" />
              </SelectTrigger>
              <SelectContent>
                {distinctDates.map((d) => (
                  <SelectItem key={d} value={d}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <Card className="p-10 text-center text-muted-foreground">불러오는 중…</Card>
          ) : view1Rows.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground italic">
              해당 기간에 저장된 기록이 없습니다.
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">투자 원금</p>
                  <p className="text-xl font-bold mt-1">{formatKRW(Math.round(view1Totals.principal))}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">평가 금액</p>
                  <p className="text-xl font-bold mt-1">{formatKRW(Math.round(view1Totals.value))}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">총 손익</p>
                  <p className={cn("text-xl font-bold mt-1", view1Totals.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>
                    {view1Totals.pnl >= 0 ? "+" : ""}{formatKRW(Math.round(view1Totals.pnl))}
                  </p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">총 수익률</p>
                  <p className={cn("text-xl font-bold mt-1", view1Totals.yieldPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                    {view1Totals.yieldPct >= 0 ? "+" : ""}{view1Totals.yieldPct.toFixed(2)}%
                  </p>
                </Card>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card className="p-5">
                  <h3 className="font-semibold mb-3">현재 자산 비중</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={view1Rows.map((r) => ({ name: r.asset_name, value: Number(r.value.toFixed(0)) }))}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={90}
                          label={(e: any) => (e.percent && e.percent > 0.04 ? `${(e.percent * 100).toFixed(0)}%` : "")}
                          labelLine={false}
                        >
                          {view1Rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatKRW(v)} />
                        <Legend verticalAlign="bottom" align="left" iconType="circle" />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="font-semibold mb-3">목표 vs 현재 비중 (%)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weightCompareData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-45} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="목표 비중" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="현재 비중" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <Card className="p-0 overflow-hidden shadow-none border">
                <div className="overflow-x-auto relative">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead className="font-bold">종목명</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">매수단가</TableHead>
                        <TableHead className="text-right">현재단가</TableHead>
                        <TableHead className="text-right font-semibold">평가금액</TableHead>
                        <TableHead className="text-right">수익률</TableHead>
                        <TableHead className="text-right">현재 비중</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view1Rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.asset_name}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.avg_purchase_price.toLocaleString()}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.current_price.toLocaleString()}</TableCell>
                          <TableCell className="text-right font-semibold tabular-nums">{formatKRW(Math.round(r.value))}</TableCell>
                          <TableCell className={cn("text-right font-medium tabular-nums", r.yieldPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                            {r.yieldPct >= 0 ? "+" : ""}{r.yieldPct.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="font-mono">{r.currentWeight.toFixed(1)}%</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        {/* ===== View 2: 변동 추이 ===== */}
        <TabsContent value="series" className="space-y-4">
          <Card className="p-5">
            <h3 className="font-semibold mb-3">투자원금 vs 평가금액 추이</h3>
            <div className="h-[320px]">
              {seriesData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm italic">데이터가 없습니다.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={(v) => `${(Number(v) / 10000).toFixed(0)}만`} />
                    <Tooltip formatter={(v: number) => formatKRW(Math.round(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="principal" name="투자원금" stroke="hsl(var(--muted-foreground))" strokeWidth={2} dot={{ r: 4 }} />
                    <Line type="monotone" dataKey="value" name="평가금액" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* ===== View 3: 종목 추이 ===== */}
        <TabsContent value="trend" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <span className="text-sm font-medium">분석 종목</span>
              <Select value={trendAsset} onValueChange={setTrendAsset}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="종목을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {allAssets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!trendAsset ? (
              <div className="h-40 flex items-center justify-center text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                종목을 선택하면 과거부터 현재까지의 상세 데이터를 분석합니다.
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-center">수량 변동 추이</h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                        <Tooltip />
                        <Line type="stepAfter" dataKey="quantity" name="수량" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-center">수익률 추이</h4>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRows.map(r => ({ ...r, yield: r.principal > 0 ? ((r.value - r.principal) / r.principal) * 100 : 0 }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip formatter={(v: number) => `${v.toFixed(2)}%`} />
                        <Line type="monotone" dataKey="yield" name="수익률" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PortfolioAnalysis;