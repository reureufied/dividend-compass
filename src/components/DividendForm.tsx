import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { format } from "date-fns";
import { CalendarIcon, Check, ChevronsUpDown, ImagePlus, Loader2, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { CATEGORIES, Category, Currency, Dividend } from "@/lib/dividends";
import { getUsdKrwRate, formatKRW } from "@/lib/fx";

const schema = z.object({
  date: z.date(),
  asset_name: z.string().trim().min(1, "종목명을 입력해주세요").max(100),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  amount: z.number().positive("0보다 큰 금액을 입력해주세요"),
  currency: z.enum(["USD", "KRW"]),
});

interface Props {
  editing?: Dividend | null;
  onSaved: () => void;
  onCancelEdit?: () => void;
}

export const DividendForm = ({ editing, onSaved, onCancelEdit }: Props) => {
  const { user } = useAuth();
  const [date, setDate] = useState<Date>(new Date());
  const [assetName, setAssetName] = useState("");
  const [category, setCategory] = useState<Category>("미국 ETF");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("USD");
  const [submitting, setSubmitting] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [rateFallback, setRateFallback] = useState(false);
  const [assetOptions, setAssetOptions] = useState<string[]>([]);
  const [assetOpen, setAssetOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);

  useEffect(() => {
    getUsdKrwRate().then(({ rate, fallback }) => {
      setRate(rate);
      setRateFallback(fallback);
    });
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("dividends")
      .select("asset_name")
      .then(({ data }) => {
        const set = new Set<string>();
        (data ?? []).forEach((r: any) => r.asset_name && set.add(r.asset_name));
        setAssetOptions(Array.from(set).sort((a, b) => a.localeCompare(b, "ko")));
      });
  }, [user]);

  useEffect(() => {
    if (editing) {
      setDate(new Date(editing.date));
      setAssetName(editing.asset_name);
      setCategory(editing.category as Category);
      setAmount(String(editing.amount));
      setCurrency((editing.currency as Currency) ?? "KRW");
    }
  }, [editing]);

  const reset = () => {
    setDate(new Date());
    setAssetName("");
    setCategory("미국 ETF");
    setAmount("");
    setCurrency("USD");
  };

  const numericAmount = parseFloat(amount);
  const showKrwPreview =
    currency === "USD" && !isNaN(numericAmount) && numericAmount > 0 && rate !== null;
  const krwPreview = showKrwPreview ? numericAmount * (rate as number) : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = schema.safeParse({
      date,
      asset_name: assetName,
      category,
      amount: parseFloat(amount),
      currency,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const fxRate = rate ?? 1350;
      const amountKrw =
        parsed.data.currency === "USD" ? parsed.data.amount * fxRate : parsed.data.amount;

      const payload = {
        user_id: user.id,
        date: format(parsed.data.date, "yyyy-MM-dd"),
        asset_name: parsed.data.asset_name,
        category: parsed.data.category,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        amount_krw: amountKrw,
      };

      if (editing) {
        const { error } = await supabase.from("dividends").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("수정되었습니다");
        onCancelEdit?.();
      } else {
        const { error } = await supabase.from("dividends").insert(payload);
        if (error) throw error;
        toast.success("배당 내역이 저장되었습니다");
        reset();
      }
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "저장 중 오류가 발생했습니다");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-6 shadow-elev-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold">{editing ? "내역 수정" : "배당 내역 입력"}</h2>
        {editing && (
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            취소
          </Button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
        {/* Date */}
        <div className="space-y-2">
          <Label>날짜</Label>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !date && "text-muted-foreground")}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {date ? format(date, "yyyy.MM.dd") : "날짜 선택"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => {
                  if (d) {
                    setDate(d);
                    setDateOpen(false);
                  }
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* Asset name with autocomplete */}
        <div className="space-y-2">
          <Label htmlFor="asset">종목명</Label>
          <Popover open={assetOpen} onOpenChange={setAssetOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={assetOpen}
                className={cn(
                  "w-full justify-between font-normal",
                  !assetName && "text-muted-foreground"
                )}
              >
                <span className="truncate">{assetName || "종목 선택 또는 입력"}</span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0 bg-popover" align="start">
              <Command>
                <CommandInput
                  placeholder="검색하거나 새 종목 입력"
                  value={assetName}
                  onValueChange={setAssetName}
                />
                <CommandList>
                  <CommandEmpty>
                    {assetName ? (
                      <button
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md"
                        onClick={() => setAssetOpen(false)}
                      >
                        새 종목 추가: <span className="font-semibold">{assetName}</span>
                      </button>
                    ) : (
                      <span className="text-sm text-muted-foreground">등록된 종목이 없습니다</span>
                    )}
                  </CommandEmpty>
                  {assetOptions.length > 0 && (
                    <CommandGroup heading="기존 종목">
                      {assetOptions.map((opt) => (
                        <CommandItem
                          key={opt}
                          value={opt}
                          onSelect={(v) => {
                            setAssetName(v);
                            setAssetOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              assetName === opt ? "opacity-100" : "opacity-0"
                            )}
                          />
                          {opt}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        {/* Category */}
        <div className="space-y-2">
          <Label>시장 분류</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Currency toggle */}
        <div className="space-y-2">
          <Label>통화</Label>
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-secondary">
            {(["USD", "KRW"] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setCurrency(c)}
                className={cn(
                  "py-2 rounded-lg text-sm font-semibold transition-smooth",
                  currency === c
                    ? "bg-card shadow-elev-sm text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="amount">금액 ({currency})</Label>
          <Input
            id="amount"
            type="number"
            step="0.01"
            inputMode="decimal"
            placeholder="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {showKrwPreview && (
            <p className="text-sm text-accent-foreground bg-accent rounded-lg px-3 py-2">
              예상 원화 금액: <span className="font-semibold">{formatKRW(Math.round(krwPreview))}</span>
              <span className="text-xs text-muted-foreground ml-2">
                (1 USD ≈ {rate?.toFixed(2)} KRW{rateFallback ? " · 고정값" : ""})
              </span>
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <Button
            type="submit"
            disabled={submitting}
            className="w-full bg-gradient-primary hover:opacity-90 transition-opacity h-11 text-base font-semibold shadow-elev-md"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editing ? "수정 완료" : "내역 저장"}
          </Button>
        </div>
      </form>
    </Card>
  );
};
