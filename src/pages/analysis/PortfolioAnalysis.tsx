import { useEffect, useMemo, useState } from "react";
import { format, subMonths } from "date-fns";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CalendarIcon, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EditHoldingDialog } from "@/components/EditHoldingDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  // View 1: selected date
  const [selectedDate, setSelectedDate] = useState<string>("");
  // View 2: time series
  const [periodMonths, setPeriodMonths] = useState<number>(6);
  const [focusAsset, setFocusAsset] = useState<string>("");
  // View 3: asset-centric trend
  const [trendAsset, setTrendAsset] = useState<string>("");
  const [trendSortAsc, setTrendSortAsc] = useState<boolean>(true);

  // Snapshot manager
  const [editHolding, setEditHolding] = useState<Snapshot | null>(null);
  const [editHoldingOpen, setEditHoldingOpen] = useState(false);
  const [deleteRowId, setDeleteRowId] = useState<string | null>(null);
  const [deleteDateTarget, setDeleteDateTarget] = useState<string | null>(null);
  const [editDateTarget, setEditDateTarget] = useState<string | null>(null);
  const [editDateNew, setEditDateNew] = useState<Date>(new Date());
  const [dateOpsLoading, setDateOpsLoading] = useState(false);

  useEffect(() => {
    // title controlled by parent Analysis page
  }, []);

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

  useEffect(() => { loadSnaps(); /* eslint-disable-next-line */ }, [user]);

  // Filter snapshots by created_at / updated_at within selected range
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

  // Available distinct dates (newest first)
  const distinctDates = useMemo(() => {
    return Array.from(new Set(filteredSnaps.map((s) => s.snapshot_date))).sort((a, b) => (a < b ? 1 : -1));
  }, [filteredSnaps]);

  useEffect(() => {
    if (!selectedDate && distinctDates.length > 0) setSelectedDate(distinctDates[0]);
  }, [distinctDates, selectedDate]);

  // ====== View 1 calculations ======
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

  // ====== View 2 calculations (time-series) ======
  const seriesData = useMemo(() => {
    const cutoff = subMonths(new Date(), periodMonths);
    const byDate = new Map<string, { date: string; principal: number; value: number }>();
    filteredSnaps.forEach((s) => {
      if (new Date(s.snapshot_date) < cutoff) return;
      const cur = byDate.get(s.snapshot_date) ?? { date: s.snapshot_date, principal: 0, value: 0 };
      cur.principal += s.quantity * s.avg_purchase_price;
      cur.value += s.quantity * s.current_price;
      byDate.set(s.snapshot_date, cur);
    });
    return Array.from(byDate.values()).sort((a, b) => (a.date < b.date ? -1 : 1));
  }, [filteredSnaps, periodMonths]);

  const allAssets = useMemo(() => Array.from(new Set(filteredSnaps.map((s) => s.asset_name))).sort(), [filteredSnaps]);

  const assetDiffs = useMemo(() => {
    if (!focusAsset) return null;
    const cutoff = subMonths(new Date(), periodMonths);
    const rows = filteredSnaps
      .filter((s) => s.asset_name === focusAsset && new Date(s.snapshot_date) >= cutoff)
      .sort((a, b) => (a.snapshot_date < b.snapshot_date ? -1 : 1));
    const diffs = rows.map((cur, i) => {
      const prev = i > 0 ? rows[i - 1] : null;
      const principal = cur.quantity * cur.avg_purchase_price;
      const prevPrincipal = prev ? prev.quantity * prev.avg_purchase_price : 0;
      return {
        date: cur.snapshot_date,
        quantity: cur.quantity,
        qtyDiff: prev ? cur.quantity - prev.quantity : 0,
        principal,
        principalDiff: prev ? principal - prevPrincipal : 0,
      };
    });
    return diffs;
  }, [filteredSnaps, focusAsset, periodMonths]);

  // ====== View 3: asset-centric trend (all-time) ======
  const trendRows = useMemo(() => {
    if (!trendAsset) return [];
    const rows = filteredSnaps
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
    return rows;
  }, [filteredSnaps, trendAsset]);

  const trendTableRows = useMemo(() => {
    const arr = [...trendRows];
    arr.sort((a, b) => (trendSortAsc ? (a.date < b.date ? -1 : 1) : a.date < b.date ? 1 : -1));
    return arr;
  }, [trendRows, trendSortAsc]);

  const deleteSnapshotDate = async (date: string) => {
    if (!user) return;
    setDateOpsLoading(true);
    const { error } = await supabase
      .from("portfolio_snapshots")
      .delete()
      .eq("user_id", user.id)
      .eq("snapshot_date", date);
    setDateOpsLoading(false);
    if (error) return toast.error(error.message);
    toast.success("삭제되었어요");
    setDeleteDateTarget(null);
    loadSnaps();
  };

  const deleteHoldingRow = async (id: string) => {
    const { error } = await supabase.from("portfolio_snapshots").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("삭제되었어요");
    setDeleteRowId(null);
    loadSnaps();
  };

  const updateSnapshotDate = async () => {
    if (!user || !editDateTarget) return;
    const newDate = format(editDateNew, "yyyy-MM-dd");
    if (newDate === editDateTarget) { setEditDateTarget(null); return; }
    setDateOpsLoading(true);
    const { error } = await supabase
      .from("portfolio_snapshots")
      .update({ snapshot_date: newDate })
      .eq("user_id", user.id)
      .eq("snapshot_date", editDateTarget);
    setDateOpsLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`${editDateTarget} → ${newDate} 로 변경되었어요`);
    if (selectedDate === editDateTarget) setSelectedDate(newDate);
    setEditDateTarget(null);
    loadSnaps();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">포트폴리오 분석</h2>
        <p className="text-muted-foreground text-sm mt-1">
          월별 자산 기록을 기록하고, 비중·수익률·시계열 변동을 분석하세요.
        </p>
      </div>

      <Card className="p-4 shadow-elev-sm animate-fade-in">
        <DateFilterBar value={range} onChange={setRange} />
      </Card>

      <Tabs defaultValue="point" className="space-y-4">
        <TabsList>
          <TabsTrigger value="point">특정 시점 분석</TabsTrigger>
          <TabsTrigger value="series">시계열 변동 분석</TabsTrigger>
          <TabsTrigger value="trend">종목별 추이 보기</TabsTrigger>
          <TabsTrigger value="manage">기록 관리</TabsTrigger>
        </TabsList>

        {/* ===== View 1 ===== */}
        <TabsContent value="point" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">기준 기록 날짜</span>
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
            {selectedDate && (
              <Button variant="ghost" size="sm" onClick={() => setDeleteDateTarget(selectedDate)}>
                <Trash2 className="h-4 w-4 mr-1 text-destructive" /> 이 날짜 삭제
              </Button>
            )}
          </div>

          {loading ? (
            <Card className="p-10 text-center text-muted-foreground">불러오는 중…</Card>
          ) : view1Rows.length === 0 ? (
            <Card className="p-10 text-center text-muted-foreground">
              저장된 기록이 없어요. 위에서 스크린샷을 업로드해 보세요.
            </Card>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">투자 원금 합계</p>
                  <p className="text-xl font-bold mt-1">{formatKRW(Math.round(view1Totals.principal))}</p>
                </Card>
                <Card className="p-4">
                  <p className="text-xs text-muted-foreground">평가 금액 합계</p>
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
                  <h3 className="font-semibold mb-3">현재 비중 (평가금액 기준)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={view1Rows.map((r) => ({ name: r.asset_name, value: Number(r.value.toFixed(0)) }))}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={100}
                          label={(e: any) => `${e.name} ${e.percent ? (e.percent * 100).toFixed(1) : 0}%`}
                        >
                          {view1Rows.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                        </Pie>
                        <Tooltip formatter={(v: number) => formatKRW(v)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </Card>

                <Card className="p-5">
                  <h3 className="font-semibold mb-3">목표 비중 vs 현재 비중 (%)</h3>
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={weightCompareData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} unit="%" />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="목표 비중" fill="hsl(var(--muted-foreground))" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="현재 비중" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </Card>
              </div>

              <Card className="p-0 overflow-hidden">
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>종목명</TableHead>
                        <TableHead className="text-right">수량</TableHead>
                        <TableHead className="text-right">매수단가</TableHead>
                        <TableHead className="text-right">현재단가</TableHead>
                        <TableHead className="text-right">투자원금</TableHead>
                        <TableHead className="text-right">평가금액</TableHead>
                        <TableHead className="text-right">손익</TableHead>
                        <TableHead className="text-right">수익률</TableHead>
                        <TableHead className="text-right">목표 비중</TableHead>
                        <TableHead className="text-right">현재 비중</TableHead>
                        <TableHead className="text-right w-[120px]">관리</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {view1Rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.asset_name}</TableCell>
                          <TableCell className="text-right">{r.quantity.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{r.avg_purchase_price.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{r.current_price.toLocaleString()}</TableCell>
                          <TableCell className="text-right">{formatKRW(Math.round(r.principal))}</TableCell>
                          <TableCell className="text-right">{formatKRW(Math.round(r.value))}</TableCell>
                          <TableCell className={cn("text-right font-medium", r.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>
                            {r.pnl >= 0 ? "+" : ""}{formatKRW(Math.round(r.pnl))}
                          </TableCell>
                          <TableCell className={cn("text-right font-medium", r.yieldPct >= 0 ? "text-emerald-500" : "text-destructive")}>
                            {r.yieldPct >= 0 ? "+" : ""}{r.yieldPct.toFixed(2)}%
                          </TableCell>
                          <TableCell className="text-right">{r.target_weight.toFixed(1)}%</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary">{r.currentWeight.toFixed(1)}%</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { setEditHolding(r); setEditHoldingOpen(true); }}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteRowId(r.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>
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

        {/* ===== View 2 ===== */}
        <TabsContent value="series" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">기간</span>
            <Select value={String(periodMonths)} onValueChange={(v) => setPeriodMonths(Number(v))}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="3">최근 3개월</SelectItem>
                <SelectItem value="6">최근 6개월</SelectItem>
                <SelectItem value="12">최근 1년</SelectItem>
                <SelectItem value="24">최근 2년</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="p-5">
            <h3 className="font-semibold mb-3">총 투자원금 vs 평가금액 추이</h3>
            <div className="h-[320px]">
              {seriesData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  해당 기간에 저장된 기록이 없어요.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={seriesData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                    <Tooltip formatter={(v: number) => formatKRW(Math.round(v))} />
                    <Legend />
                    <Line type="monotone" dataKey="principal" name="투자원금" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                    <Line type="monotone" dataKey="value" name="평가금액" stroke="hsl(var(--primary))" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <h3 className="font-semibold">종목별 변동량</h3>
              <Select value={focusAsset} onValueChange={setFocusAsset}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="종목 선택" />
                </SelectTrigger>
                <SelectContent>
                  {allAssets.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {!focusAsset ? (
              <p className="text-sm text-muted-foreground">종목을 선택하면 기록 간 수량·투자원금 변동을 보여드려요.</p>
            ) : !assetDiffs || assetDiffs.length === 0 ? (
              <p className="text-sm text-muted-foreground">해당 종목의 기록이 없어요.</p>
            ) : (
              <>
                <div className="h-[260px] mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={assetDiffs}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                      <Tooltip />
                      <Legend />
                      <Bar yAxisId="left" dataKey="qtyDiff" name="수량 변동(주)" fill="hsl(var(--accent-foreground))" radius={[6, 6, 0, 0]} />
                      <Bar yAxisId="right" dataKey="principalDiff" name="투자금 변동(KRW)" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>날짜</TableHead>
                      <TableHead className="text-right">수량</TableHead>
                      <TableHead className="text-right">수량 변동</TableHead>
                      <TableHead className="text-right">투자원금</TableHead>
                      <TableHead className="text-right">투자금 변동</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assetDiffs.map((d) => (
                      <TableRow key={d.date}>
                        <TableCell>{d.date}</TableCell>
                        <TableCell className="text-right">{d.quantity.toLocaleString()}</TableCell>
                        <TableCell className={cn("text-right", d.qtyDiff > 0 ? "text-emerald-500" : d.qtyDiff < 0 ? "text-destructive" : "text-muted-foreground")}>
                          {d.qtyDiff > 0 ? "+" : ""}{d.qtyDiff.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">{formatKRW(Math.round(d.principal))}</TableCell>
                        <TableCell className={cn("text-right", d.principalDiff > 0 ? "text-emerald-500" : d.principalDiff < 0 ? "text-destructive" : "text-muted-foreground")}>
                          {d.principalDiff > 0 ? "+" : ""}{formatKRW(Math.round(d.principalDiff))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ===== View 3: Asset-centric Trend ===== */}
        <TabsContent value="trend" className="space-y-4">
          <Card className="p-5">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className="text-sm font-medium">종목 선택</span>
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
              <p className="text-sm text-muted-foreground">종목을 선택하면 전체 기간의 수량·평가금액·투자원금 추이를 보여드려요.</p>
            ) : trendRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">해당 종목의 기록이 없어요.</p>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <h3 className="font-semibold mb-2">수량 변동 추이</h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="quantity" name="수량(주)" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-2">평가금액 vs 투자원금 추이</h3>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trendRows}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 10000).toFixed(0)}만`} />
                        <Tooltip formatter={(v: number) => formatKRW(Math.round(v))} />
                        <Legend />
                        <Line type="monotone" dataKey="principal" name="투자원금" stroke="hsl(var(--muted-foreground))" strokeWidth={2} />
                        <Line type="monotone" dataKey="value" name="평가금액" stroke="hsl(var(--primary))" strokeWidth={2} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}
          </Card>

          {trendAsset && trendRows.length > 0 && (
            <Card className="p-0 overflow-hidden">
              <div className="flex items-center justify-between p-4">
                <h3 className="font-semibold">{trendAsset} · 기록 히스토리</h3>
                <Button variant="outline" size="sm" onClick={() => setTrendSortAsc((v) => !v)}>
                  날짜 {trendSortAsc ? "오름차순 ↑" : "내림차순 ↓"}
                </Button>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">매수단가</TableHead>
                    <TableHead className="text-right">현재단가</TableHead>
                    <TableHead className="text-right">투자원금</TableHead>
                    <TableHead className="text-right">평가금액</TableHead>
                    <TableHead className="text-right">손익금</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trendTableRows.map((r) => (
                    <TableRow key={r.date}>
                      <TableCell className="font-medium">{r.date}</TableCell>
                      <TableCell className="text-right">{r.quantity.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.avg_purchase_price.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{r.current_price.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{formatKRW(Math.round(r.principal))}</TableCell>
                      <TableCell className="text-right">{formatKRW(Math.round(r.value))}</TableCell>
                      <TableCell className={cn("text-right font-medium", r.pnl >= 0 ? "text-emerald-500" : "text-destructive")}>
                        {r.pnl >= 0 ? "+" : ""}{formatKRW(Math.round(r.pnl))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </TabsContent>

        {/* ===== Snapshot Manager ===== */}
        <TabsContent value="manage" className="space-y-4">
          <Card className="p-0 overflow-hidden">
            {distinctDates.length === 0 ? (
              <div className="p-10 text-center text-muted-foreground">저장된 기록이 없어요.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>기록 날짜</TableHead>
                    <TableHead className="text-right">종목 수</TableHead>
                    <TableHead className="text-right">평가금액 합계</TableHead>
                    <TableHead className="text-right w-[260px]">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distinctDates.map((d) => {
                    const rows = filteredSnaps.filter((s) => s.snapshot_date === d);
                    const value = rows.reduce((a, b) => a + b.quantity * b.current_price, 0);
                    return (
                      <TableRow key={d}>
                        <TableCell className="font-medium">{d}</TableCell>
                        <TableCell className="text-right">{rows.length}</TableCell>
                        <TableCell className="text-right">{formatKRW(Math.round(value))}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => { setSelectedDate(d); }}>
                              조회
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => {
                              setEditDateTarget(d);
                              setEditDateNew(new Date(d));
                            }}>
                              <Pencil className="h-4 w-4 mr-1" /> 날짜 수정
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => setDeleteDateTarget(d)}>
                              <Trash2 className="h-4 w-4 mr-1 text-destructive" /> 삭제
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <EditHoldingDialog
        open={editHoldingOpen}
        onOpenChange={setEditHoldingOpen}
        holding={editHolding}
        onSaved={loadSnaps}
      />

      {/* Delete single row */}
      <AlertDialog open={!!deleteRowId} onOpenChange={(o) => !o && setDeleteRowId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이 종목 기록을 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>해당 기록에서 이 종목 행이 삭제됩니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteRowId && deleteHoldingRow(deleteRowId)}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete entire date */}
      <AlertDialog open={!!deleteDateTarget} onOpenChange={(o) => !o && setDeleteDateTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>해당 날짜의 모든 자산 기록을 삭제하시겠습니까?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDateTarget} 기록에 속한 모든 종목 행이 영구적으로 삭제됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDateTarget && deleteSnapshotDate(deleteDateTarget)}>
              {dateOpsLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit snapshot date (bulk) */}
      <Dialog open={!!editDateTarget} onOpenChange={(o) => !o && setEditDateTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>기록 날짜 일괄 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{editDateTarget}</span> 의 모든 종목 기록 날짜를 아래 날짜로 변경합니다.
            </p>
            <div className="grid gap-1.5">
              <Label>새 기준 날짜</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {format(editDateNew, "yyyy.MM.dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={editDateNew} onSelect={(d) => d && setEditDateNew(d)} initialFocus className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDateTarget(null)}>취소</Button>
            <Button onClick={updateSnapshotDate} disabled={dateOpsLoading}>
              {dateOpsLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PortfolioAnalysis;
