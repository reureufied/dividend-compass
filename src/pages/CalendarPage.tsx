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
import { CalendarPlus, ChevronLeft, ChevronRight, Coffee, DollarSign, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Dividend } from "@/lib/dividends";
import { krwOf } from "@/lib/analytics";
import { formatKRW, formatUSD } from "@/lib/fx";
import { predictionsForMonth, PredictedDividend } from "@/lib/predictions";
import { toast } from "sonner";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

type CalendarItem = (Dividend & { predicted?: false }) | PredictedDividend;

interface CustomEvent {
  id: string;
  event_date: string;
  title: string;
  color: string;
  icon: string | null;
  note: string | null;
}

const EVENT_COLORS = [
  { name: "Blue", value: "#3B82F6" },
  { name: "Green", value: "#10B981" },
  { name: "Red", value: "#EF4444" },
  { name: "Amber", value: "#F59E0B" },
  { name: "Purple", value: "#8B5CF6" },
  { name: "Pink", value: "#EC4899" },
];

const CalendarPage = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [events, setEvents] = useState<CustomEvent[]>([]);
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showPredictions, setShowPredictions] = useState(true);

  // Add event dialog
  const [eventDialogOpen, setEventDialogOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventColor, setEventColor] = useState(EVENT_COLORS[0].value);
  const [eventNote, setEventNote] = useState("");
  const [savingEvent, setSavingEvent] = useState(false);

  useEffect(() => {
    document.title = "캘린더 · Portfolio Lab";
  }, []);

  const loadAll = () => {
    if (!user) return;
    supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: true })
      .then(({ data }) => setItems((data ?? []) as Dividend[]));
    supabase
      .from("calendar_events")
      .select("*")
      .order("event_date", { ascending: true })
      .then(({ data }) => setEvents((data ?? []) as CustomEvent[]));
  };

  useEffect(loadAll, [user]);

  const predictions = useMemo(
    () => (showPredictions ? predictionsForMonth(items, cursor) : []),
    [items, cursor, showPredictions]
  );

  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const d of items) {
      const arr = map.get(d.date) ?? [];
      arr.push(d as CalendarItem);
      map.set(d.date, arr);
    }
    for (const p of predictions) {
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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CustomEvent[]>();
    for (const e of events) {
      const arr = map.get(e.event_date) ?? [];
      arr.push(e);
      map.set(e.event_date, arr);
    }
    return map;
  }, [events]);

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

  const selectedKey = selectedDate ? format(selectedDate, "yyyy-MM-dd") : "";
  const selectedItems = selectedDate ? byDate.get(selectedKey) ?? [] : [];
  const selectedEvents = selectedDate ? eventsByDate.get(selectedKey) ?? [] : [];

  const openAddEvent = () => {
    setEventTitle("");
    setEventColor(EVENT_COLORS[0].value);
    setEventNote("");
    setEventDialogOpen(true);
  };

  const saveEvent = async () => {
    if (!user || !selectedDate) return;
    if (!eventTitle.trim()) {
      toast.error("일정 이름을 입력해 주세요");
      return;
    }
    setSavingEvent(true);
    const { error } = await supabase.from("calendar_events").insert({
      user_id: user.id,
      event_date: selectedKey,
      title: eventTitle.trim(),
      color: eventColor,
      note: eventNote.trim() || null,
    });
    setSavingEvent(false);
    if (error) return toast.error(error.message);
    toast.success("일정이 추가되었어요");
    setEventDialogOpen(false);
    loadAll();
  };

  const deleteEvent = async (id: string) => {
    const { error } = await supabase.from("calendar_events").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("삭제되었어요");
    loadAll();
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">캘린더</h1>
        <p className="text-muted-foreground mt-1">받은 배당, 예정 배당, 그리고 나만의 일정을 한곳에서 확인하세요</p>
      </header>

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
            const dayEvents = eventsByDate.get(dStr) ?? [];
            const inMonth = isSameMonth(day, cursor);
            const isToday = isSameDay(day, new Date());
            const dow = day.getDay();
            const totalCount = dayItems.length + dayEvents.length;

            return (
              <button
                type="button"
                key={dStr}
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "min-h-[6.5rem] md:min-h-[8.5rem] p-1.5 md:p-2 text-left border-r border-b border-border align-top transition-smooth flex flex-col cursor-pointer",
                  (idx + 1) % 7 === 0 && "border-r-0",
                  !inMonth && "bg-muted/30",
                  "hover:bg-accent/40"
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
                  {dayEvents.slice(0, 2).map((e) => (
                    <div
                      key={e.id}
                      className="w-full px-1.5 py-1 rounded-md text-xs leading-tight flex items-center gap-1 text-white"
                      style={{ backgroundColor: e.color }}
                      title={e.title}
                    >
                      <span className="truncate font-semibold flex-1">{e.title}</span>
                    </div>
                  ))}
                  {dayItems.slice(0, Math.max(0, 3 - dayEvents.slice(0, 2).length)).map((d) => {
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
                      </div>
                    );
                  })}
                  {totalCount > 3 && (
                    <div className="text-[11px] text-muted-foreground pl-1 font-medium">
                      +{totalCount - 3}건
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {monthCount === 0 && predictions.length === 0 && events.filter(e => isSameMonth(parseISO(e.event_date), cursor)).length === 0 && (
        <Card className="p-10 shadow-elev-sm text-center animate-fade-in">
          <Coffee className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <p className="text-muted-foreground">이번 달은 일정이 없어요. ☕</p>
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
            {selectedEvents.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">내 일정</p>
                {selectedEvents.map((e) => (
                  <div key={e.id} className="p-3 rounded-xl border border-border bg-card flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: e.color }} />
                      <div className="min-w-0">
                        <p className="font-semibold truncate">{e.title}</p>
                        {e.note && <p className="text-xs text-muted-foreground mt-0.5">{e.note}</p>}
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => deleteEvent(e.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {selectedItems.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">배당 내역</p>
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
                          <Badge variant="secondary" className="font-normal text-xs">{d.category}</Badge>
                          {isPred && (
                            <Badge className="font-normal text-xs bg-primary/15 text-primary hover:bg-primary/20">
                              <Sparkles className="h-3 w-3 mr-1" />
                              예상
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-bold tabular-nums">
                          {d.currency === "USD" ? formatUSD(Number(d.amount)) : formatKRW(Number(d.amount))}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {selectedItems.length === 0 && selectedEvents.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-3">이 날짜에는 기록된 일정이 없어요.</p>
            )}

            <Button onClick={openAddEvent} className="w-full" variant="outline">
              <CalendarPlus className="h-4 w-4 mr-2" />새 일정 추가
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add event dialog */}
      <Dialog open={eventDialogOpen} onOpenChange={setEventDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selectedDate && format(selectedDate, "yyyy년 M월 d일")} · 새 일정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ev-title">일정 이름</Label>
              <Input id="ev-title" value={eventTitle} onChange={(e) => setEventTitle(e.target.value)} placeholder="예: 월급날, 주식 매수일" />
            </div>
            <div className="space-y-2">
              <Label>색상</Label>
              <div className="flex flex-wrap gap-2">
                {EVENT_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setEventColor(c.value)}
                    className={cn(
                      "h-8 w-8 rounded-full border-2 transition-transform",
                      eventColor === c.value ? "border-foreground scale-110" : "border-transparent"
                    )}
                    style={{ backgroundColor: c.value }}
                    aria-label={c.name}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ev-note">메모 (선택)</Label>
              <Input id="ev-note" value={eventNote} onChange={(e) => setEventNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEventDialogOpen(false)}>취소</Button>
            <Button onClick={saveEvent} disabled={savingEvent}>
              {savingEvent ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CalendarPage;
