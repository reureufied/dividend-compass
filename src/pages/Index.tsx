import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { Wallet, Target, TrendingUp, PieChart as PieIcon, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { DateFilterBar, DateRange, computeRange } from "@/components/DateFilterBar";
import { Dividend } from "@/lib/dividends";
import { filterByRange, groupByCategory, groupForChart, sumKRW, topAssets } from "@/lib/analytics";
import { formatKRW } from "@/lib/fx";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

interface Profile {
  monthly_goal: number;
  yearly_goal: number;
}

const Index = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [range, setRange] = useState<DateRange>(computeRange("3m"));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    document.title = "대시보드 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [divs, prof] = await Promise.all([
        supabase.from("dividends").select("*").order("date", { ascending: true }),
        supabase.from("profiles").select("monthly_goal, yearly_goal").eq("id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      setItems((divs.data ?? []) as Dividend[]);
      setProfile((prof.data as Profile) ?? { monthly_goal: 0, yearly_goal: 0 });
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  const filtered = useMemo(() => filterByRange(items, range.from, range.to), [items, range]);
  const total = useMemo(() => sumKRW(filtered), [filtered]);
  const series = useMemo(() => groupForChart(filtered, range.from, range.to), [filtered, range]);
  const byCategory = useMemo(() => groupByCategory(filtered), [filtered]);
  const top5 = useMemo(() => topAssets(filtered, 5), [filtered]);
  const top5Max = top5[0]?.total ?? 0;

  // Goal calc — derive a target proportional to range length
  const monthsInRange = Math.max(
    1,
    (range.to.getFullYear() - range.from.getFullYear()) * 12 +
      (range.to.getMonth() - range.from.getMonth()) + 1
  );
  const monthlyGoal = profile?.monthly_goal ?? 0;
  const targetForRange = monthlyGoal * monthsInRange;
  const achievement = targetForRange > 0 ? Math.min(100, (total / targetForRange) * 100) : 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">대시보드</h1>
        <p className="text-muted-foreground mt-1">선택한 기간의 배당 성과를 한눈에 확인하세요</p>
      </header>

      <Card className="p-4 shadow-elev-sm animate-fade-in">
        <DateFilterBar value={range} onChange={setRange} />
      </Card>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">총 배당금 (선택 기간)</span>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold tabular-nums">{formatKRW(total)}</div>
          <p className="text-xs text-muted-foreground mt-2">
            {filtered.length}건 · 원화 환산 기준
          </p>
        </Card>

        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">목표 달성률</span>
            <Target className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold tabular-nums">{achievement.toFixed(1)}%</div>
          <Progress value={achievement} className="mt-3 h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {monthlyGoal > 0
              ? `목표 ${formatKRW(targetForRange)} (${monthsInRange}개월 환산)`
              : "마이페이지에서 월간 목표를 설정해보세요"}
          </p>
        </Card>

        <Card className="p-6 shadow-elev-sm hover:shadow-elev-md transition-smooth sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-muted-foreground">평균 월 배당</span>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold tabular-nums">
            {formatKRW(Math.round(total / monthsInRange))}
          </div>
          <p className="text-xs text-muted-foreground mt-2">선택 기간 평균</p>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="p-6 lg:col-span-2 shadow-elev-sm">
          <h3 className="font-semibold mb-1">배당 추이</h3>
          <p className="text-xs text-muted-foreground mb-4">
            기간에 따라 월별 또는 연도별로 자동 그룹화
          </p>
          <div className="h-72">
            {series.length === 0 ? (
              <EmptyChart message={loading ? "불러오는 중…" : "데이터가 없습니다"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="hsl(var(--primary-glow))" stopOpacity={0.7} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
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
                    formatter={(v: number) => [formatKRW(v), "배당금"]}
                  />
                  <Bar dataKey="amount" fill="url(#barFill)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card className="p-6 shadow-elev-sm">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-semibold">시장 비중</h3>
            <PieIcon className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground mb-4">카테고리별 분포</p>
          <div className="h-72">
            {byCategory.length === 0 ? (
              <EmptyChart message={loading ? "불러오는 중…" : "데이터가 없습니다"} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={byCategory}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                    stroke="hsl(var(--card))"
                    strokeWidth={2}
                  >
                    {byCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 12,
                      fontSize: 12,
                    }}
                    formatter={(v: number, n) => [formatKRW(v), n as string]}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 12 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Top 5 */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-4">
          <Trophy className="h-4 w-4 text-warning" />
          <h3 className="font-semibold">효자 종목 Top 5</h3>
        </div>
        {top5.length === 0 ? (
          <p className="text-sm text-muted-foreground">선택 기간에 기록된 종목이 없습니다.</p>
        ) : (
          <ul className="space-y-3">
            {top5.map((a, i) => (
              <li key={a.name} className="flex items-center gap-4">
                <span className="w-6 text-sm font-bold text-muted-foreground tabular-nums">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-medium truncate">{a.name}</span>
                    <span className="font-semibold tabular-nums text-sm">{formatKRW(a.total)}</span>
                  </div>
                  <div className="h-2 bg-secondary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-primary rounded-full transition-all duration-500"
                      style={{ width: `${top5Max ? (a.total / top5Max) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};

const EmptyChart = ({ message }: { message: string }) => (
  <div className="h-full rounded-xl bg-gradient-subtle border border-dashed border-border flex items-center justify-center text-sm text-muted-foreground">
    {message}
  </div>
);

const compactKRW = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return `${v}`;
};

export default Index;
