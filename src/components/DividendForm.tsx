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
import { BulkReviewDialog, DraftRow, toDraftRow } from "@/components/BulkReviewDialog";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { normalizeAsset, similarity } from "@/lib/assetMatch";

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
  const [category, setCategory] = useState<Category>("한국 ETF");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<Currency>("KRW");
  const [submitting, setSubmitting] = useState(false);
  const [rate, setRate] = useState<number | null>(null);
  const [rateFallback, setRateFallback] = useState(false);
  const [assetOptions, setAssetOptions] = useState<string[]>([]);
  const [assetOpen, setAssetOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    getUsdKrwRate().then(({ rate, fallback }) => {
      setRate(rate);
      setRateFallback(fallback);
    });
  }, []);

  useEffect(() => {
    if (editing) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleScreenshot(file);
            return;
          }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

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
    setCategory("한국 ETF");
    setAmount("");
    setCurrency("KRW");
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

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleScreenshot = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("이미지는 8MB 이하만 가능합니다");
      return;
    }
    setScanning(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setScanPreview(dataUrl);
      const { data, error } = await supabase.functions.invoke("parse-dividend-screenshot", {
        body: { imageDataUrl: dataUrl },
      });

      // supabase-js puts non-2xx body inside error.context (a Response object)
      let payload: any = data;
      if (error) {
        const ctx: Response | undefined = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try {
            payload = await ctx.json();
          } catch {
            payload = null;
          }
        }
        console.error("parse-dividend-screenshot error", error, payload);
      }

      const results = payload?.results;
      if (Array.isArray(results) && results.length > 0) {
        const drafts = results.map(toDraftRow);
        setDraftRows(drafts);
        setReviewOpen(true);
        toast.success(`${drafts.length}건의 내역을 찾았어요. 검토 후 저장해 주세요!`);
        return;
      }

      const code = payload?.code;
      const msg = payload?.error;
      if (code === "NO_API_KEY") {
        toast.error("OpenAI API Key가 설정되지 않았습니다.");
      } else if (code === "OCR_UNREADABLE") {
        toast.error("이미지에서 글자를 읽을 수 없습니다.");
      } else if (code === "NO_DIVIDENDS") {
        toast.error("배당 내역을 찾을 수 없습니다. 다시 촬영해 주세요.");
      } else if (code === "RATE_LIMIT") {
        toast.error("AI 사용량이 많아요. 잠시 후 다시 시도해 주세요.");
      } else if (code === "NO_CREDITS") {
        toast.error("AI 크레딧이 부족합니다. 잠시 후 다시 시도해 주세요.");
      } else {
        toast.error(msg ?? "정보를 찾지 못했어요. 다시 시도해 주세요.");
      }
    } catch (err: any) {
      console.error("handleScreenshot fatal", err);
      toast.error(err?.message ?? "이미지 분석 중 오류가 발생했어요");
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
    <Card className="p-6 shadow-elev-sm">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-semibold">{editing ? "내역 수정" : "배당 내역 입력"}</h2>
        {editing && (
          <Button variant="ghost" size="sm" onClick={onCancelEdit}>
            취소
          </Button>
        )}
      </div>

      {!editing && (
        <div
          className={cn(
            "mb-5 rounded-xl border-2 border-dashed p-4 transition-smooth",
            dragActive ? "border-primary bg-accent/40" : "border-border bg-secondary/40",
            scanning && "opacity-90"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleScreenshot(f);
          }}
        >
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0 shadow-elev-sm">
              <Sparkles className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">스크린샷으로 자동 입력</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                증권사 앱 스크린샷을 올리거나 캡처 후 여기에 붙여넣기(Ctrl+V / Cmd+V) 하세요. AI가 날짜·종목·금액·통화를 자동으로 채워드려요.
              </p>

              {scanPreview && (
                <div className="mt-3 relative inline-block">
                  <img
                    src={scanPreview}
                    alt="업로드한 스크린샷 미리보기"
                    className="max-h-32 rounded-lg border border-border"
                  />
                  <button
                    type="button"
                    onClick={() => setScanPreview(null)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border border-border shadow-elev-sm flex items-center justify-center hover:bg-secondary"
                    aria-label="미리보기 제거"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleScreenshot(f);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                >
                  {scanning ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ImagePlus className="h-4 w-4 mr-2" />
                  )}
                  {scanning ? "AI가 배당 내역을 읽고 있어요… 🔍" : "스크린샷 업로드"}
                </Button>
                <span className="text-xs text-muted-foreground">끌어다 놓기 · 붙여넣기(Ctrl+V) 지원</span>
              </div>
            </div>
          </div>
        </div>
      )}

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
              <Command
                filter={(value, search) => {
                  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
                  return norm(value).includes(norm(search)) ? 1 : 0;
                }}
              >
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
    <BulkReviewDialog
      open={reviewOpen}
      onOpenChange={setReviewOpen}
      rows={draftRows}
      setRows={setDraftRows}
      fxRate={rate ?? 1350}
      onSaved={onSaved}
    />
    </>
  );
};
