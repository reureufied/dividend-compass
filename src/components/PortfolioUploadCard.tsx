import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Plus, Sparkles, X, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { PortfolioBulkReview, HoldingDraft } from "@/components/PortfolioBulkReview";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { cleanAssetName } from "@/lib/assetMatch";
import { GoogleGenerativeAI } from "@google/generative-ai";

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

  // 🔥 강화된 금액 파싱: 쉼표, 통화 기호, 공백, 한글 단위 모두 제거
  const parseAmount = (val: unknown): number => {
    if (val === null || val === undefined) return 0;
    if (typeof val === "number") return isNaN(val) ? 0 : val;
    if (typeof val === "string") {
      const t = val.trim();
      if (t === "" || t === "-" || /n\/a|없음|–|null|undefined/i.test(t)) return 0;

      const cleaned = t
        .replace(/[,$￦₩\s\\원usdUSD]/g, "") // 통화기호/단위/공백/쉼표 제거
        .replace(/[^0-9.\-]/g, "")           // 숫자, 점, 마이너스만 허용
        .replace(/\.(?=.*\.)/g, "");          // 소수점 중복 제거

      const num = parseFloat(cleaned);
      return isNaN(num) ? 0 : num;
    }
    return 0;
  };

  const handleScreenshot = async (file: File) => {
    if (inFlightRef.current) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 가능해요");
      return;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      toast.error("Gemini API 키를 확인해주세요.");
      return;
    }

    inFlightRef.current = true;
    setScanning(true);

    try {
      const dataUrl = await fileToDataUrl(file);
      setScanPreview(dataUrl);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const base64Data = dataUrl.split(",")[1];

      const prompt = `
이 이미지는 주식/ETF 보유 현황 스크린샷입니다.

아래 규칙을 반드시 따르세요:
1. 이미지에 보이는 보유 종목 표(table)의 모든 행(row)을 빠짐없이 읽어야 합니다.
2. 각 행에서 다음 4개 값을 추출합니다:
   - asset_name: 종목명 (정확한 텍스트)
   - quantity: 보유수량 (숫자만)
   - avg_purchase_price: 매수단가/매수평균가 (숫자만)
   - current_price: 현재가 (숫자만)
3. 가격 필드(avg_purchase_price, current_price)에 쉼표(,), 통화 기호(￦, ₩, $), 공백, "원"이 붙어있어도 모두 무시하고 반드시 숫자(Number)만 반환하세요.
   예: "1,234원" → 1234, "$150.50" → 150.5, "12,500" → 12500
4. 만약 매수단가가 보이지 않지만 '평가금액'과 '보유수량'이 보인다면, (평가금액 ÷ 보유수량)을 avg_purchase_price에 넣으세요.
5. 만약 현재가가 보이지 않지만 '시가총액'과 '보유수량'이 보인다면, (시가총액 ÷ 보유수량)을 current_price에 넣으세요.
6. 아래 JSON 형식의 순수 JSON 텍스트만 출력하세요. 마크다운 코드블록( triple backtick )은 절대 사용하지 마세요.

형식:
{"results": [{"asset_name": "삼성전자", "quantity": 10, "avg_purchase_price": 55000, "current_price": 60000}]}
`;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: file.type } },
      ]);

      const responseText = result.response.text();

      // 마크다운 코드블록 제거 (정규식 안전 처리)
      let cleanedJson = responseText
        .replace(/```json/gi, "")
        .replace(/```/g, "")
        .trim();

      if (cleanedJson.startsWith("`")) cleanedJson = cleanedJson.replace(/^`+/, "");
      if (cleanedJson.endsWith("`")) cleanedJson = cleanedJson.replace(/`+$/, "");

      const payload = JSON.parse(cleanedJson);
      const results = payload?.results;

      if (!Array.isArray(results) || results.length === 0) {
        toast.error("이미지에서 보유 종목을 찾지 못했어요. 다른 스크린샷을 시도해 보세요.");
        return;
      }

      // 🔥 toHoldingDraft를 거치지 않고 직접 숫자로 깨끗이 변환
      const drafts: HoldingDraft[] = results.map((item: any) => {
        const original = String(item.asset_name ?? "").trim();
        const cleaned = cleanAssetName(original);

        const quantity = parseAmount(item.quantity);
        const avgPrice = parseAmount(item.avg_purchase_price);
        const curPrice = parseAmount(item.current_price);

        // 자동 계산 표시 (AI가 직접 읽은 값이 아닌 추론된 경우)
        const computed: string[] = [];
        if (!parseAmount(item.avg_purchase_price) && quantity > 0) {
          computed.push("avg_purchase_price");
        }
        if (!parseAmount(item.current_price) && quantity > 0) {
          computed.push("current_price");
        }

        return {
          asset_name: cleaned,
          quantity: quantity > 0 ? String(quantity) : "",
          avg_purchase_price: avgPrice > 0 ? String(avgPrice) : "",
          current_price: curPrice > 0 ? String(curPrice) : "",
          target_weight: "",
          auto_mapped: false,
          original_name: original !== cleaned ? original : undefined,
          computed_fields: computed,
        };
      });

      // 0건이면 에러 처리
      const validDrafts = drafts.filter(
        (d) => d.asset_name.trim() && d.quantity && parseFloat(d.quantity) > 0
      );

      if (validDrafts.length === 0) {
        toast.error("인식된 종목 중 유효한 항목이 없어요. 이미지가 더 선명한지 확인해주세요.");
        return;
      }

      setDraftRows(validDrafts);
      setReviewOpen(true);
      toast.success(`${validDrafts.length}개 종목을 인식했어요. 내용을 검토해주세요!`);
    } catch (err: any) {
      console.error("AI 분석 실패:", err);
      toast.error("AI 분석에 실패했어요. 이미지가 흐리거나 API 키를 확인해주세요.");
    } finally {
      setScanning(false);
      inFlightRef.current = false;
    }
  };

  // Ctrl+V 붙여넣기 지원
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (reviewOpen) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith("image/")) {
          const file = items[i].getAsFile();
          if (file) handleScreenshot(file);
          break;
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [reviewOpen]);

  return (
    <>
      <Card className="p-6 shadow-none border-none">
        {/* 기준 날짜 */}
        <div className="flex items-center gap-4 mb-4">
          <span className="text-sm font-medium">기준 날짜</span>
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-[180px] justify-start font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(snapshotDate, "yyyy.MM.dd")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={snapshotDate}
                onSelect={(d) => {
                  if (d) {
                    setSnapshotDate(d);
                    setDateOpen(false);
                  }
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* 드래그 & 드롭 / 업로드 영역 */}
        <div
          className={cn(
            "rounded-xl border-2 border-dashed p-6 transition-all duration-200 relative overflow-hidden",
            dragActive ? "border-primary bg-primary/5" : "border-border bg-secondary/40",
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
          {/* ✅ 업로드된 이미지 미리보기 */}
          {scanPreview && !reviewOpen && (
            <div className="mb-4 relative rounded-lg overflow-hidden border border-border bg-white">
              <img
                src={scanPreview}
                alt="업로드된 스크린샷 미리보기"
                className="w-full max-h-48 object-contain"
              />
              {!scanning && (
                <button
                  onClick={() => setScanPreview(null)}
                  className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
                  aria-label="미리보기 닫기"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          )}

          {/* ✅ 분석 중 로딩 오버레이 */}
          {scanning && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-background/60 backdrop-blur-sm rounded-xl">
              <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
              <p className="text-sm font-medium text-primary">AI가 이미지를 분석 중이에요...</p>
            </div>
          )}

          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-semibold">스크린샷 자동 입력</p>
              <p className="text-sm text-muted-foreground mt-1">
                파일 업로드 또는 붙여넣기(Ctrl+V)로 주식 보유현황을 자동으로 채워보세요.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleScreenshot(f);
                    e.target.value = ""; // 동일 파일 재선택 가능
                  }}
                />
                <Button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={scanning}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  {scanning ? "분석 중..." : "이미지 업로드"}
                </Button>
                <Button
                  variant="outline"
                  disabled={scanning}
                  onClick={() => {
                    setDraftRows([]);
                    setReviewOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  직접 입력
                </Button>
              </div>

              {!scanning && scanPreview && (
                <p className="text-xs text-muted-foreground mt-2">
                  이미지가 준비되었어요. 다시 업로드하려면 X를 눌러주세요.
                </p>
              )}
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
        onSaved={() => {
          setScanPreview(null);
          onSaved();
        }}
      />
    </>
  );
};
