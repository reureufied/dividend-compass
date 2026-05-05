import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ImagePlus, Loader2, Plus, Sparkles, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { HoldingDraft, PortfolioBulkReview, toHoldingDraft } from "@/components/PortfolioBulkReview";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { cleanAssetName, normalizeAsset, similarity } from "@/lib/assetMatch";

interface Props {
  onSaved: () => void;
}

export const PortfolioUploadCard = ({ onSaved }: Props) => {
  const knownNames = useKnownAssetNames();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);
  const [scanning, setScanning] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [draftRows, setDraftRows] = useState<HoldingDraft[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<Date>(new Date());
  const [dragActive, setDragActive] = useState(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState(false);

  const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

  const handleScreenshot = async (file: File) => {
    if (inFlightRef.current) return;
    if (!file.type.startsWith("image/")) return toast.error("이미지 파일만 업로드할 수 있어요");
    if (file.size > 8 * 1024 * 1024) return toast.error("이미지는 8MB 이하만 가능해요");
    inFlightRef.current = true;
    setScanning(true);
    try {
      const dataUrl = await fileToDataUrl(file);
      setScanPreview(dataUrl);
      const { data, error } = await supabase.functions.invoke("parse-portfolio-screenshot", {
        body: { imageDataUrl: dataUrl, knownAssetNames: knownNames },
      });
      let payload: any = data;
      if (error) {
        const ctx: Response | undefined = (error as any)?.context;
        if (ctx && typeof ctx.json === "function") {
          try { payload = await ctx.json(); } catch { payload = null; }
        }
        console.error("parse-portfolio-screenshot error", error, payload);
      }
      console.log("[Gemini가 실제로 보낸 답변 내용 - portfolio]", payload);
      const results = payload?.results;
      if (Array.isArray(results) && results.length > 0) {
        const drafts: HoldingDraft[] = results.map(toHoldingDraft).map((d) => {
          const raw = d.asset_name?.trim();
          if (!raw) return d;
          const nraw = normalizeAsset(raw);
          const exact = knownNames.find((k) => normalizeAsset(k) === nraw);
          if (exact && exact !== raw) return { ...d, asset_name: exact, auto_mapped: true, original_name: raw };
          let best: { name: string; score: number } | null = null;
          for (const k of knownNames) {
            const s = similarity(raw, k);
            if (!best || s > best.score) best = { name: k, score: s };
          }
          if (best && best.score >= 0.8 && best.name !== raw) {
            return { ...d, asset_name: best.name, auto_mapped: true, original_name: raw };
          }
          return d;
        });
        setDraftRows(drafts);
        setReviewOpen(true);
        toast.success(`${drafts.length}건의 보유 종목을 찾았어요. 검토 후 저장해 주세요!`);
        return;
      }
      const code = payload?.code;
      if (code === "NO_API_KEY") toast.error("AI API Key가 설정되지 않았습니다.");
      else if (code === "OCR_UNREADABLE") toast.error("이미지에서 글자를 읽을 수 없습니다.");
      else if (code === "NO_HOLDINGS") toast.error("보유 종목 정보를 찾을 수 없어요.");
      else toast.error(payload?.error ?? "분석 실패");
    } catch (err: any) {
      toast.error(err?.message ?? "이미지 분석 중 오류가 발생했어요");
    } finally {
      setScanning(false);
      inFlightRef.current = false;
    }
  };

  useEffect(() => {
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
  }, []);

  const addEmptyRow = () => {
    setDraftRows([{ asset_name: "", quantity: "", avg_purchase_price: "", current_price: "", target_weight: "" }]);
    setReviewOpen(true);
  };

  return (
    <>
      <Card className="p-6 shadow-elev-sm">
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <span className="text-sm font-medium">기준 날짜</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[200px] justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(snapshotDate, "yyyy.MM.dd")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={snapshotDate}
                onSelect={(d) => { if (d) { setSnapshotDate(d); setDateOpen(false); } }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-6 transition-smooth",
            dragActive ? "border-primary bg-accent/40" : "border-border bg-secondary/40",
            scanning && "opacity-90"
          )}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragActive(false);
            const f = e.dataTransfer.files?.[0];
            if (f) handleScreenshot(f);
          }}
        >
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-gradient-primary flex items-center justify-center shrink-0 shadow-elev-sm">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">증권사 자산 화면 스크린샷으로 자동 입력</p>
              <p className="text-sm text-muted-foreground mt-1">
                클릭하여 파일을 선택하거나, 캡처 후 여기에 붙여넣기(Ctrl+V / Cmd+V) 하세요. 보유 종목·수량·매수단가·현재단가를 AI가 추출해 드려요.
              </p>
              {scanPreview && (
                <div className="mt-3 relative inline-block">
                  <img src={scanPreview} alt="미리보기" className="max-h-32 rounded-lg border border-border" />
                  <button
                    type="button"
                    onClick={() => setScanPreview(null)}
                    className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-background border border-border shadow-elev-sm flex items-center justify-center hover:bg-secondary"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                <Button type="button" onClick={() => fileInputRef.current?.click()} disabled={scanning} className="bg-gradient-primary hover:opacity-90 max-w-full whitespace-normal text-left h-auto py-2">
                  {scanning ? <Loader2 className="h-4 w-4 mr-2 animate-spin shrink-0" /> : <ImagePlus className="h-4 w-4 mr-2 shrink-0" />}
                  <span className="truncate">{scanning ? "AI가 자산 내역을 읽고 있어요… 🔍" : "스크린샷 업로드"}</span>
                </Button>
                <Button type="button" variant="outline" onClick={addEmptyRow}>
                  <Plus className="h-4 w-4 mr-2" /> 직접 입력
                </Button>
                <span className="text-xs text-muted-foreground">끌어다 놓기 · 붙여넣기(Ctrl+V) 지원</span>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <PortfolioBulkReview
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        rows={draftRows}
        setRows={setDraftRows}
        snapshotDate={snapshotDate}
        setSnapshotDate={setSnapshotDate}
        onSaved={onSaved}
      />
    </>
  );
};
