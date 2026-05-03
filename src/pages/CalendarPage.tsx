import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { ChevronLeft, ChevronRight, Coffee, DollarSign, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Dividend } from "@/lib/dividends";
import { krwOf } from "@/lib/analytics";
import { formatKRW, formatUSD } from "@/lib/fx";
import { predictionsForMonth, PredictedDividend } from "@/lib/predictions";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CalendarItem = (Dividend & { predicted?: false }) | PredictedDividend;

const CalendarPage = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPredictions, setShowPredictions] = useState(true);

  useEffect(() => {
    document.title = "캘린더 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: true })
      .then(({ data }) => setItems((data ?? []) as Dividend[]));
  }, [user]);

  // Predictions for the visible month
  const predictions = useMemo(
    () => (showPredictions ? predictionsForMonth(items, cursor) : []),
    [items, cursor, showPredictions]
  );

  // Group all (real + predicted) by date
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const d of items) {
      const arr = map.get(d.date) ?? [];
      arr.push(d as CalendarItem);
      map.set(d.date, arr);
    }
    for (const p of predictions) {
      // Skip predictions on dates that already have real data for the same asset
      const existing = map.get(p.date) ?? [];
      const dup = existing.some(
        (e) => !("predicted" in e && e.predicted) && (e as Dividend).asset_name === p.asset_name
      );
      if (dup) continue;
      existing.push(p);
      map.set(p.date, existing);
    }
    return map;
  }, [items, predictions]);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const monthTotal = useMemo(() => {
    const monthStart = startOfMonth(cursor);
    const monthEnd = endOfMonth(cursor);
    return items
      .filter((d) => {
        const dt = parseISO(d.date);
        return dt >= monthStart && dt <= monthEnd;
      })
      .reduce((s, d) => s + krwOf(d), 0);
  }, [items, cursor]);

  const monthCount = useMemo(
    () => items.filter((d) => isSameMonth(parseISO(d.date), cursor)).length,
    [items, cursor]
  );

  const predictedTotal = useMemo(
    () =>
      predictions.reduce(
        (s, p) =>
          s + Number(p.amount_krw ?? (p.currency === "USD" ? Number(p.amount) * 1350 : Number(p.amount))),
        0
      ),
    [predictions]
  );

  const selectedItems = selectedDate
    ? byDate.get(format(selectedDate, "yyyy-MM-dd")) ?? []
    : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">배당 캘린더</h1>
        <p className="text-muted-foreground mt-1">월별로 받은 배당과 예정 배당을 한눈에 확인하세요</p>
      </header>

      {/* Monthly summary + nav */}
      <Card className="p-5 shadow-elev-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, -1))} aria-label="이전 달">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold tabular-nums min-w-[7rem] text-center">
              {format(cursor, "yyyy년 M월")}
            </h2>
            <Button variant="ghost" size="icon" onClick={() => setCursor((c) => addMonths(c, 1))} aria-label="다음 달">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-2" onClick={() => setCursor(startOfMonth(new Date()))}>
              오늘
            </Button>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch id="show-pred" checked={showPredictions} onCheckedChange={setShowPredictions} />
              <Label htmlFor="show-pred" className="text-xs flex items-center gap-1 cursor-pointer">
                <Sparkles className="h-3 w-3" />
                예측 표시
              </Label>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">이번 달 총 배당금</p>
              <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent tabular-nums">
                {formatKRW(monthTotal)}
              </p>
              <p className="text-xs text-muted-foreground">
                {monthCount}건
                {showPredictions && predictedTotal > 0 && (
                  <span className="ml-2 text-primary">+ 예상 {formatKRW(Math.round(predictedTotal))}</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </Card>

      {/* Calendar grid */}
      <Card className="shadow-elev-sm overflow-hidden">
        <div className="grid grid-cols-7 border-b border-border bg-secondary/50">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              className={cn(
                "py-2 text-center text-xs font-semibold",
                i === 0 && "text-destructive",
                i === 6 && "text-primary",
                i !== 0 && i !== 6 && "text-muted-foreground"
              )}
            >
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 auto-rows-fr">
          {days.map((day, idx) => {
            const dStr = format(day, "yyyy-MM-dd");
            const dayItems = byDate.get(dStr) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const dow = day.getDay();

            return (
              <button
                type="button"
                key={dStr}
                onClick={() => dayItems.length > 0 && setSelectedDate(day)}
                className={cn(
                  "min-h-[6.5rem] md:min-h-[8.5rem] p-1.5 md:p-2 text-left border-r border-b border-border align-top transition-smooth flex flex-col",
                  (idx + 1) % 7 === 0 && "border-r-0",
                  !inMonth && "bg-muted/30",
                  dayItems.length > 0 && "hover:bg-accent/40 cursor-pointer",
                  dayItems.length === 0 && "cursor-default"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center text-sm font-semibold tabular-nums w-7 h-7 rounded-full",
                      !inMonth && "text-muted-foreground/60",
                      inMonth && dow === 0 && "text-destructive",
                      inMonth && dow === 6 && "text-primary",
                      isToday && "bg-gradient-primary text-primary-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="space-y-1 flex-1">
                  {dayItems.slice(0, 3).map((d) => {
                    const isPred = "predicted" in d && d.predicted;
                    const amountText =
                      d.currency === "USD"
                        ? formatUSD(Number(d.amount))
                        : formatKRW(Number(d.amount));
                    return (
                      <div
                        key={d.id}
                        className={cn(
                          "w-full px-1.5 py-1 rounded-md text-xs leading-tight flex items-center gap-1",
                          d.currency === "USD"
                            ? "bg-accent text-accent-foreground"
                            : "bg-success/15 text-success",
                          isPred && "opacity-60 border border-dashed border-current bg-transparent"
                        )}
                        title={`${isPred ? "[예상] " : ""}${d.asset_name} · ${amountText}`}
                      >
                        {d.currency === "USD" && <DollarSign className="h-3 w-3 shrink-0" />}
                        {isPred && <Sparkles className="h-3 w-3 shrink-0" />}
                        <span className="truncate font-semibold flex-1">{d.asset_name}</span>
                        <span className="tabular-nums hidden sm:inline text-[11px] font-medium opacity-80">
                          {amountText}
                        </span>
                      </div>
                    );
                  })}
                  {dayItems.length > 3 && (
                    <div className="text-[11px] text-muted-foreground pl-1 font-medium">
                      +{dayItems.length - 3}건
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {monthCount === 0 && predictions.length === 0 && (
        <Card className="p-10 shadow-elev-sm text-center animate-fade-in">
          <Coffee className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">이번 달은 배당 소식이 없어요. ☕</p>
        </Card>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(o) => !o && setSelectedDate(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "yyyy년 M월 d일 (EEE)")}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {selectedItems.map((d) => {
              const isPred = "predicted" in d && d.predicted;
              return (
                <div
                  key={d.id}
                  className={cn(
                    "p-3 rounded-xl border flex items-start justify-between gap-3",
                    isPred ? "border-dashed border-primary/40 bg-primary/5" : "border-border bg-card"
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{d.asset_name}</span>
                      <Badge variant="secondary" className="font-normal text-xs">
                        {d.category}
                      </Badge>
                      {isPred && (
                        <Badge className="font-normal text-xs bg-primary/15 text-primary hover:bg-primary/20">
                          <Sparkles className="h-3 w-3 mr-1" />
                          예상
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {isPred
                        ? "과거 배당 주기 기반 예측"
                        : `기록 ${format(parseISO((d as Dividend).created_at), "HH:mm")}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-bold tabular-nums">
                      {d.currency === "USD" ? formatUSD(Number(d.amount)) : formatKRW(Number(d.amount))}
                    </p>
                    {d.currency === "USD" && d.amount_krw != null && (
                      <p className="text-xs text-muted-foreground tabular-nums">
                        ≈ {formatKRW(Math.round(Number(d.amount_krw)))}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">합계</span>
              <span className="font-bold tabular-nums">
                {formatKRW(
                  selectedItems.reduce(
                    (s, d) =>
                      s +
                      Number(
                        d.amount_krw ??
                          (d.currency === "USD" ? Number(d.amount) * 1350 : Number(d.amount))
                      ),
                    0
                  )
                )}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarPage;
