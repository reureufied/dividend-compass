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
import { ChevronLeft, ChevronRight, Coffee, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

const CalendarPage = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

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

  // Group dividends by date string (yyyy-MM-dd)
  const byDate = useMemo(() => {
    const map = new Map<string, Dividend[]>();
    for (const d of items) {
      const arr = map.get(d.date) ?? [];
      arr.push(d);
      map.set(d.date, arr);
    }
    return map;
  }, [items]);

  // Days in calendar grid (full weeks)
  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  // Monthly total
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
    () =>
      items.filter((d) => isSameMonth(parseISO(d.date), cursor)).length,
    [items, cursor]
  );

  const selectedItems = selectedDate
    ? byDate.get(format(selectedDate, "yyyy-MM-dd")) ?? []
    : [];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">배당 캘린더</h1>
        <p className="text-muted-foreground mt-1">월별로 받은 배당을 한눈에 확인하세요</p>
      </header>

      {/* Monthly summary + nav */}
      <Card className="p-5 shadow-elev-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor((c) => addMonths(c, -1))}
              aria-label="이전 달"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-xl font-bold tabular-nums min-w-[7rem] text-center">
              {format(cursor, "yyyy년 M월")}
            </h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setCursor((c) => addMonths(c, 1))}
              aria-label="다음 달"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="ml-2"
              onClick={() => setCursor(startOfMonth(new Date()))}
            >
              오늘
            </Button>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">이번 달 총 배당금</p>
            <p className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent tabular-nums">
              {formatKRW(monthTotal)}
            </p>
            <p className="text-xs text-muted-foreground">{monthCount}건</p>
          </div>
        </div>
      </Card>

      {/* Calendar grid */}
      <Card className="shadow-elev-sm overflow-hidden">
        {/* Weekday header */}
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

        {/* Day cells */}
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
                  "min-h-[5.5rem] md:min-h-[7rem] p-1.5 md:p-2 text-left border-r border-b border-border align-top transition-smooth",
                  (idx + 1) % 7 === 0 && "border-r-0",
                  !inMonth && "bg-muted/30",
                  dayItems.length > 0 && "hover:bg-accent/40 cursor-pointer",
                  dayItems.length === 0 && "cursor-default"
                )}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center text-xs font-semibold tabular-nums w-6 h-6 rounded-full",
                      !inMonth && "text-muted-foreground/60",
                      inMonth && dow === 0 && "text-destructive",
                      inMonth && dow === 6 && "text-primary",
                      isToday && "bg-gradient-primary text-primary-foreground"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                </div>

                <div className="space-y-1">
                  {dayItems.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      className={cn(
                        "px-1.5 py-0.5 rounded-md text-[10px] md:text-xs leading-tight truncate flex items-center gap-1",
                        d.currency === "USD"
                          ? "bg-accent text-accent-foreground"
                          : "bg-success/15 text-success"
                      )}
                      title={`${d.asset_name} · ${
                        d.currency === "USD"
                          ? formatUSD(Number(d.amount))
                          : formatKRW(Number(d.amount))
                      }`}
                    >
                      {d.currency === "USD" && (
                        <DollarSign className="h-2.5 w-2.5 shrink-0" />
                      )}
                      <span className="truncate font-medium">{d.asset_name}</span>
                    </div>
                  ))}
                  {dayItems.length > 3 && (
                    <div className="text-[10px] text-muted-foreground pl-1">
                      +{dayItems.length - 3}건
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {monthCount === 0 && (
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
            {selectedItems.map((d) => (
              <div
                key={d.id}
                className="p-3 rounded-xl border border-border bg-card flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{d.asset_name}</span>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {d.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    기록 {format(parseISO(d.created_at), "HH:mm")}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-bold tabular-nums">
                    {d.currency === "USD"
                      ? formatUSD(Number(d.amount))
                      : formatKRW(Number(d.amount))}
                  </p>
                  {d.currency === "USD" && d.amount_krw != null && (
                    <p className="text-xs text-muted-foreground tabular-nums">
                      ≈ {formatKRW(Math.round(Number(d.amount_krw)))}
                    </p>
                  )}
                </div>
              </div>
            ))}
            <div className="pt-2 border-t border-border flex items-center justify-between">
              <span className="text-sm text-muted-foreground">합계</span>
              <span className="font-bold tabular-nums">
                {formatKRW(selectedItems.reduce((s, d) => s + krwOf(d), 0))}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarPage;
