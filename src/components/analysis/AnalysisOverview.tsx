import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Wallet, Coins, TrendingUp, TrendingDown, ArrowUpDown, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
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

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(217 91% 70%)",
  "hsl(263 75% 75%)",
  "hsl(199 89% 65%)",
];

const PROFIT = "hsl(var(--chart-1))"; // blue
const LOSS = "hsl(var(--destructive))";

const compactKRW = (v: number) => {
  const a = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (a >= 100_000_000) return `${sign}${(a / 100_000_000).toFixed(1)}억`;
  if (a >= 10_000) return `${sign}${Math.round(a / 10_000)}만`;
  return `${sign}${a}`;
};

const monthKey = (d: string) => d.slice(0, 7);

const AnalysisOverview = () => {
  const { user } = useAuth();
  const [dividends, setDividends] = useState<Dividend[]>([]);
  const [snaps, setSnaps] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  // bottom tab state
  const [search, setSearch] = useState("");
  const [dpsAsset, setDpsAsset] = useState<string>("");
  const [dpsSortAsc, setDpsSortAsc] = useState(false);
  const [assetSortKey, setAssetSortKey] = useState<"date" | "value" | "diff">("date");
  const [assetSortAsc, setAssetSortAsc] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [d, s] = await Promise.all([
        supabase.from("dividends").select("*").order("date", { ascending: true }).limit(10000),
        supabase
          .from("portfolio_snapshots")
          .select("asset_name, snapshot_date, quantity, avg_purchase_price, current_price")
          .order("snapshot_date", { ascending: true })
          .limit(10000),
      ]);
      if (cancelled) return;
      setDividends((d.data ?? []) as Dividend[]);
      setSnaps((s.data ?? []) as Snapshot[]);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  // ===== latest snapshot (per asset) =====
  const latestDate = useMemo(() => {
    if (snaps.length === 0) return "";
    return snaps.reduce((a, b) => (a > b.snapshot_date ? a : b.snapshot_date), "");
  }, [snaps]);

  const latestRows = useMemo(() => {
    const map = new Map<string, Snapshot>();
    for (const s of snaps) {
      const cur = map.get(s.asset_name);
      if (!cur || s.snapshot_date > cur.snapshot_date) map.set(s.asset_name, s);
    }
    return Array.from(map.values()).map((s) => {
      const principal = Number(s.quantity) * Number(s.avg_purchase_price);
      const value = Number(s.quantity) * Number(s.current_price);
      return { ...s, principal, value, pnl: value - principal };
    });
  }, [snaps]);

  // ===== KPIs =====
  const totals = useMemo(() => {
    const principal = latestRows.reduce((a, r) => a + r.principal, 0);
    const value = latestRows.reduce((a, r) => a + r.value, 0);
    const pnl = value - principal;
    const yieldPct = principal > 0 ? (pnl / principal) * 100 : 0;
    return { principal, value, pnl, yieldPct };
  }, [latestRows]);

  const thisMonthDiv = useMemo(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    return dividends
      .filter((d) => monthKey(d.date) === key)
      .reduce((a, d) => a + krwOf(d), 0);
  }, [dividends]);

  // ===== Donut: asset weight =====
  const allocation = useMemo(() => {
    const arr = latestRows
      .filter((r) => r.value > 0)
      .map((r) => ({ name: r.asset_name, value: Math.round(r.value) }))
      .sort((a, b) => b.value - a.value);
    if (arr.length <= 7) return arr;
    const top = arr.slice(0, 6);
    const other = arr.slice(6).reduce((s, x) => s + x.value, 0);
    return [...top, { name: "기타", value: other }];
  }, [latestRows]);

  // ===== Bar: dividend contribution =====
  const dividendByAsset = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of dividends) map.set(d.asset_name, (map.get(d.asset_name) ?? 0) + krwOf(d));
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [dividends]);

  // ===== DPS chart data =====
  const assetNames = useMemo(() => {
    const set = new Set<string>();
    dividends.forEach((d) => set.add(d.asset_name));
    return Array.from(set).sort();
  }, [dividends]);

  useEffect(() => {
    if (!dpsAsset && assetNames.length > 0) setDpsAsset(assetNames[0]);
  }, [assetNames, dpsAsset]);

  const dpsPoints = useMemo(() => {
    if (!dpsAsset) return [] as Array<{ date: string; dps: number; quantity: number; amount: number; currency: string }>;
    const aSnaps = snaps.filter((s) => s.asset_name === dpsAsset).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const aDivs = dividends.filter((d) => d.asset_name === dpsAsset).sort((a, b) => a.date.localeCompare(b.date));
    return aDivs.map((d) => {
      let qty = 0;
      for (const s of aSnaps) {
        if (s.snapshot_date <= d.date) qty = Number(s.quantity);
        else break;
      }
      if (qty === 0 && aSnaps.length > 0) qty = Number(aSnaps[0].quantity);
      const amount = Number(d.amount);
      return { date: d.date, dps: qty > 0 ? amount / qty : 0, quantity: qty, amount, currency: d.currency };
    }).filter((p) => p.dps > 0);
  }, [dpsAsset, dividends, snaps]);

  const dpsCurrency = dpsPoints[0]?.currency ?? "KRW";
  const dpsTableRows = useMemo(() => {
    const arr = [...dpsPoints];
    arr.sort((a, b) => (dpsSortAsc ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date)));
    if (search.trim()) return arr.filter((p) => p.date.includes(search.trim()));
    return arr;
  }, [dpsPoints, dpsSortAsc, search]);

  // ===== Monthly asset trend =====
  const monthlyAssets = useMemo(() => {
    // For each distinct snapshot_date, sum value across all assets that day
    const byDate = new Map<string, { date: string; value: number; principal: number }>();
    for (const s of snaps) {
      const cur = byDate.get(s.snapshot_date) ?? { date: s.snapshot_date, value: 0, principal: 0 };
      cur.value += Number(s.quantity) * Number(s.current_price);
      cur.principal += Number(s.quantity) * Number(s.avg_purchase_price);
      byDate.set(s.snapshot_date, cur);
    }
    const arr = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
    return arr.map((r, i) => {
      const prev = i > 0 ? arr[i - 1] : null;
      const diff = prev ? r.value - prev.value : 0;
      const diffPct = prev && prev.value > 0 ? (diff / prev.value) * 100 : 0;
      return { ...r, diff, diffPct };
    });
  }, [snaps]);

  const monthlyTableRows = useMemo(() => {
    let arr = [...monthlyAssets];
    if (search.trim()) arr = arr.filter((r) => r.date.includes(search.trim()));
    arr.sort((a, b) => {
      let cmp = 0;
      if (assetSortKey === "date") cmp = a.date.localeCompare(b.date);
      else if (assetSortKey === "value") cmp = a.value - b.value;
      else cmp = a.diff - b.diff;
      return assetSortAsc ? cmp : -cmp;
    });
    return arr;
  }, [monthlyAssets, assetSortKey, assetSortAsc, search]);

  return (
    <div className="space-y-6">
      {/* ==== 1. Summary cards ==== */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          icon={<Wallet className="h-4 w-4" />}
          label="총 자산 평가금액"
          value={formatKRW(Math.round(totals.value))}
          hint={latestDate ? `기준일 ${latestDate}` : "기록 없음"}
        />
        <SummaryCard
          icon={<Coins className="h-4 w-4" />}
          label="이번 달 배당금"
          value={formatKRW(Math.round(thisMonthDiv))}
          hint="원화 환산"
        />
        <SummaryCard
          icon={totals.pnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          label="총 손익"
          value={`${totals.pnl >= 0 ? "+" : ""}${formatKRW(Math.round(totals.pnl))}`}
          tone={totals.pnl >= 0 ? "profit" : "loss"}
        />
        <SummaryCard
          icon={totals.yieldPct >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          label="총 수익률"
          value={`${totals.yieldPct >= 0 ? "+" : ""}${totals.yieldPct.toFixed(2)}%`}
          tone={totals.yieldPct >= 0 ? "profit" : "loss"}
        />
      </div>

      {/* ==== 2. 2-column grid ==== */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6 shadow-elev-sm">
          <h3 className="font-semibold mb-1">자산 비중</h3>
          <p className="text-xs text-muted-foreground mb-4">최신 기록 평가금액 기준</p>
          <div className="h-72">
            {allocation.length === 0 ? (
              <Empty msg={loading ? "불러오는 중…" : "기록이 없습니다"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={allocation}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                    label={({ percent }) => (percent > 0.05 ? `${(percent * 100).toFixed(0)}%` : "")}
                    labelLine={false}
                  >
                    {allocation.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: number, n) => [formatKRW(v), n as string]}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-elev-sm">
          <h3 className="font-semibold mb-1">종목별 배당 기여도</h3>
          <p className="text-xs text-muted-foreground mb-4">누적 배당금 상위 10종목</p>
          <div className="h-72">
            {dividendByAsset.length === 0 ? (
              <Empty msg={loading ? "불러오는 중…" : "배당 기록이 없습니다"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dividendByAsset} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => compactKRW(v as number)} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={11} width={110} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatKRW(v), "누적 배당"]} />
                  <Bar dataKey="value" fill={PROFIT} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* ==== 3. Bottom tabs: DPS / Monthly assets ==== */}
      <Card className="p-6 shadow-elev-sm">
        <Tabs defaultValue="dps" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="dps">1주당 배당금(DPS) 추이</TabsTrigger>
              <TabsTrigger value="assets">월별 자산 증감</TabsTrigger>
            </TabsList>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="날짜 검색 (예: 2025 또는 2025-03)"
                className="pl-8 h-9 w-[220px]"
              />
            </div>
          </div>

          <TabsContent value="dps" className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">종목</span>
              <Select value={dpsAsset} onValueChange={setDpsAsset}>
                <SelectTrigger className="w-[260px]"><SelectValue placeholder="종목 선택" /></SelectTrigger>
                <SelectContent>
                  {assetNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="h-64">
              {dpsPoints.length === 0 ? (
                <Empty msg={loading ? "불러오는 중…" : "데이터가 없습니다"} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dpsPoints} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      width={60}
                      tickFormatter={(v) => dpsCurrency === "USD" ? `$${Number(v).toFixed(2)}` : `${Math.round(Number(v))}`}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(v: number) => [
                        dpsCurrency === "USD" ? `$${Number(v).toFixed(4)}` : `${Math.round(Number(v)).toLocaleString()}원`,
                        "1주당 배당",
                      ]}
                    />
                    <Line type="monotone" dataKey="dps" stroke={PROFIT} strokeWidth={2} dot={{ r: 4, fill: PROFIT }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <DataTable
              headers={[
                { label: "날짜", onClick: () => setDpsSortAsc((v) => !v), active: true },
                { label: "수량" },
                { label: "배당금" },
                { label: "1주당 배당" },
              ]}
              rows={dpsTableRows.map((p) => [
                p.date,
                p.quantity.toLocaleString(),
                dpsCurrency === "USD" ? `$${p.amount.toFixed(2)}` : `${Math.round(p.amount).toLocaleString()}원`,
                dpsCurrency === "USD" ? `$${p.dps.toFixed(4)}` : `${Math.round(p.dps).toLocaleString()}원`,
              ])}
              empty="데이터가 없습니다"
            />
          </TabsContent>

          <TabsContent value="assets" className="space-y-4">
            <div className="h-64">
              {monthlyAssets.length === 0 ? (
                <Empty msg={loading ? "불러오는 중…" : "기록이 없습니다"} />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={monthlyAssets} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} width={60} tickFormatter={(v) => compactKRW(v as number)} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [formatKRW(v), "평가금액"]} />
                    <Line type="monotone" dataKey="value" stroke={PROFIT} strokeWidth={2} dot={{ r: 4, fill: PROFIT }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
            <DataTable
              headers={[
                { label: "날짜", onClick: () => { setAssetSortKey("date"); setAssetSortAsc((v) => assetSortKey === "date" ? !v : false); }, active: assetSortKey === "date" },
                { label: "투자 원금" },
                { label: "평가금액", onClick: () => { setAssetSortKey("value"); setAssetSortAsc((v) => assetSortKey === "value" ? !v : false); }, active: assetSortKey === "value" },
                { label: "전월 대비", onClick: () => { setAssetSortKey("diff"); setAssetSortAsc((v) => assetSortKey === "diff" ? !v : false); }, active: assetSortKey === "diff" },
              ]}
              rows={monthlyTableRows.map((r) => [
                r.date,
                formatKRW(Math.round(r.principal)),
                formatKRW(Math.round(r.value)),
                <span key="d" className={cn("font-medium", r.diff >= 0 ? "text-[hsl(var(--chart-1))]" : "text-destructive")}>
                  {r.diff >= 0 ? "+" : ""}{formatKRW(Math.round(r.diff))} ({r.diffPct >= 0 ? "+" : ""}{r.diffPct.toFixed(1)}%)
                </span>,
              ])}
              empty="데이터가 없습니다"
            />
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
};

const tooltipStyle = {
  background: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 12,
};

const SummaryCard = ({
  icon, label, value, hint, tone,
}: {
  icon: React.ReactNode; label: string; value: string; hint?: string; tone?: "profit" | "loss";
}) => (
  <Card className="p-5 shadow-elev-sm hover:shadow-elev-md transition-smooth">
    <div className="flex items-center justify-between mb-2 text-muted-foreground">
      <span className="text-xs font-medium">{label}</span>
      {icon}
    </div>
    <div className={cn(
      "text-2xl sm:text-3xl font-bold tabular-nums tracking-tight",
      tone === "profit" && "text-[hsl(var(--chart-1))]",
      tone === "loss" && "text-destructive",
    )}>
      {value}
    </div>
    {hint && <p className="text-[11px] text-muted-foreground mt-2">{hint}</p>}
  </Card>
);

const Empty = ({ msg }: { msg: string }) => (
  <div className="h-full rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
    {msg}
  </div>
);

interface Header { label: string; onClick?: () => void; active?: boolean; }
const DataTable = ({ headers, rows, empty }: { headers: Header[]; rows: React.ReactNode[][]; empty: string }) => (
  <div className="rounded-lg border border-border overflow-hidden">
    <div className="overflow-x-auto max-h-[360px]">
      <Table>
        <TableHeader className="sticky top-0 bg-card z-10">
          <TableRow>
            {headers.map((h, i) => (
              <TableHead key={i} className={cn(i > 0 && "text-right")}>
                {h.onClick ? (
                  <Button variant="ghost" size="sm" className="h-7 px-2 -ml-2 font-medium" onClick={h.onClick}>
                    {h.label}
                    <ArrowUpDown className={cn("ml-1 h-3 w-3", h.active ? "opacity-100" : "opacity-40")} />
                  </Button>
                ) : h.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow><TableCell colSpan={headers.length} className="text-center text-sm text-muted-foreground py-8">{empty}</TableCell></TableRow>
          ) : rows.map((r, i) => (
            <TableRow key={i}>
              {r.map((cell, j) => (
                <TableCell key={j} className={cn("tabular-nums", j > 0 && "text-right")}>{cell}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  </div>
);

export default AnalysisOverview;
