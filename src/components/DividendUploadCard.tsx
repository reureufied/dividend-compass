import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, ImagePlus, Loader2, Plus, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { DividendBulkReviewDialog, DraftRow } from "@/components/DividendBulkReviewDialog";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { cleanAssetName, normalizeAsset, similarity } from "@/lib/assetMatch";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Label } from "@/components/ui/label";

interface Props {
  fxRate: number;
  onSaved: () => void;
}

export const DividendUploadCard = ({ fxRate, onSaved }: Props) => {
  const knownNames = useKnownAssetNames();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const inFlightRef = useRef(false);
  
  const [scanning, setScanning] = useState<boolean>(false);
  const [reviewOpen, setReviewOpen] = useState<boolean>(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
  const [snapshotDate, setSnapshotDate] = useState<Date>(new Date());
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [scanPreview, setScanPreview] = useState<string | null>(null);
  const [dateOpen, setDateOpen] = useState<boolean>(false);

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
    
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
    if (!apiKey) return toast.error("API 키가 설정되지 않았습니다.");

    inFlightRef.current = true;
    setScanning(true);
    
    try {
      const dataUrl = await fileToDataUrl(file);
      setScanPreview(dataUrl);

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-lite" });
      const base64Data = dataUrl.split(",")[1];

      // 🌟 레이아웃 패턴 인식 및 명칭 정제 규칙이 강화된 프롬프트
      const prompt = `
        이 이미지는 증권사 계좌의 입출금 내역 스크린샷이야.
        이미지에서 오직 "배당금", "분배금", "배당", "분배"라는 단어가 포함된 내역만 추출해줘.
        
        [배당 내역을 찾는 시각적 규칙]
        내역은 보통 한 줄(Row) 또는 한 블록(Block)으로 구성되어 있어.
        1. 종목명 찾기: "배당", "분배", "삼성전자", "SCHD" 같은 단어를 먼저 찾아.
        2. 금액 찾기:
           - 패턴 A (가로형): 종목명과 같은 줄의 '오른쪽 끝'에 크게 써있는 숫자를 찾아. 종종 다른 색(빨간색 등)으로 써있기도 해.
           - 패턴 B (세로형): 종목명 바로 '아래 줄'에 크게 써있는 숫자를 찾아.
        3. 🚨 제외: '잔액', '수수료', '세금', '배당소득세'는 금액으로 가져오지 마. 무조건 "실제 입금된 금액(실수령액)"만 가져와.
        4. 날짜에 년도가 따로 나와있지 않다면 현자 연도로 입력해줘. 
        
        [📋 추출 규칙]
        1. asset_name: 배당을 지급한 종목명.
        2. amount: 쉼표나 기호($ , 원)를 제거한 순수 "숫자"만 추출. (예: "1,200원" -> 1200)
        3. currency: 금액이 원화면 "KRW", 달러면 "USD"로 정확히 구분해.
        4. date: 지급일 (YYYY-MM-DD).

        응답 형식: {"results": [{"asset_name": "종목명", "amount": 1234, "currency": "KRW", "date": "2026-05-05"}]}
        배당 내역이 전혀 없으면 {"results": []} 라고 응답해. 오직 JSON만 출력해.
      `;

      const result = await model.generateContent([
        prompt,
        { inlineData: { data: base64Data, mimeType: file.type } },
      ]);

      const responseText = result.response.text();
      const cleanedJson = responseText.replace(/```json/gi, "").replace(/```/g, "").trim();
      const payload = JSON.parse(cleanedJson);

      const results = payload?.results;
      if (Array.isArray(results) && results.length > 0) {
        const drafts: DraftRow[] = results.map((item: any) => {
          let rawName = item.asset_name || "알 수 없는 종목";
          const target = "상장지수투자신탁";
          let refinedName = rawName;

          // 1. 먼저 정확히 일치하는지 확인 (빠른 처리)
          const windowSize = 8;
          if (refinedName.includes(target)) {
            refinedName = refinedName.replace(new RegExp(target, 'g'), " ETF");
          } 
          // 2. 정확히 일치하지 않아도 4글자씩 끊어서 유사도(50% 이상) 검사
          else if (refinedName.length >= target.length) {
            const windowSize = 4;
            for (let i = 0; i <= refinedName.length - target.length; i++) {
              const subChunk = refinedName.substring(i, i + target.length);
              // 이미 정의된 similarity 함수 활용 (0.7 = 70%)
              if (similarity(subChunk, target) >= 0.7) {
                refinedName = refinedName.replace(subChunk, " ETF");
                break; // 하나 찾으면 중단
              }
            }
          }
          // 🌟 2. 'ETF' 단어 뒤의 모든 글자 지우기
        const etfIndex = refinedName.indexOf("ETF");
        if (etfIndex !== -1) {
          // ETF 문자의 시작 인덱스에 3(E, T, F 세 글자)을 더한 위치까지만 남기고 자름
          refinedName = refinedName.substring(0, etfIndex + 3).trim();
        }

          let parsedAmount = item.amount;
          if (typeof parsedAmount === "string") {
            parsedAmount = parseFloat(parsedAmount.replace(/[^0-9.]/g, "")) || 0;
          }

          const baseRow: DraftRow = {
            asset_name: refinedName,
            amount: parsedAmount || 0,
            date: item.date || format(new Date(), "yyyy-MM-dd"),
            currency: item.currency === "USD" ? "USD" : "KRW",
          };

          // 🌟 2. 추천 및 자동 매핑 로직 (복구 및 강화)
          const original = refinedName.trim(); // AI가 읽어온 이름
          const cleaned = cleanAssetName(original);    // 특수문자 제거 등 정제
          const ncleaned = normalizeAsset(cleaned);    // 대소문자/공백 정규화

          // [Step 1] 정확히 일치하는 종목이 있는지 확인
          const exact = knownNames.find((k) => normalizeAsset(k) === ncleaned);
          if (exact) {
            return { 
              ...baseRow, 
              asset_name: exact, 
              auto_mapped: true, 
              original_name: original // 👈 AI가 읽은 원본 이름을 보관해서 추천임을 표시
            };
          }

          // [Step 2] 유사도 검사 (추천 기능의 핵심)
          let best = { name: "", score: 0 };
          for (const k of knownNames) {
            const s = similarity(cleaned, k);
            if (s > best.score) best = { name: k, score: s };
          }

          // 유사도가 70%(0.70) 이상이면 "이 종목인 것 같아요!"라고 추천 매핑
          if (best.score >= 0.70) {
            return { 
              ...baseRow, 
              asset_name: best.name, 
              auto_mapped: true, 
              original_name: original // 👈 '파란 별' 아이콘이 뜨게 만드는 핵심 데이터
            };
          }

          // 추천할 만큼 비슷한 게 없으면 AI가 읽은 그대로 반환
          return { ...baseRow, asset_name: cleaned };
        });

        setDraftRows(drafts);
        setReviewOpen(true);
        toast.success(`${drafts.length}건의 배당 내역을 인식했습니다.`);
      } else {
        toast.error("인식된 배당 내역이 없습니다.");
      }
    } catch (err: any) {
      console.error("분석 에러:", err);
      toast.error("AI 분석 중 오류가 발생했습니다.");
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
          if (file) { e.preventDefault(); handleScreenshot(file); return; }
        }
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [knownNames]);

  return (
    <>
      <Card className="p-6 shadow-elev-sm border-none bg-card/60 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-bold text-muted-foreground whitespace-nowrap">지급일 기준</Label>
            <Popover open={dateOpen} onOpenChange={setDateOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-[180px] justify-start font-normal h-9 bg-background">
                  <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                  {format(snapshotDate, "yyyy.MM.dd")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={snapshotDate}
                  onSelect={(d) => { if (d) { setSnapshotDate(d); setDateOpen(false); } }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <div
          className={cn(
            "rounded-2xl border-2 border-dashed p-8 transition-all duration-300",
            dragActive ? "border-primary bg-primary/5 scale-[1.01]" : "border-border bg-secondary/20",
            scanning && "opacity-50 pointer-events-none"
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
          {/* 🔙 왼쪽 정렬 레이아웃으로 수정 */}
          <div className="flex items-start gap-5">
            <div className="h-14 w-14 rounded-2xl bg-gradient-primary flex items-center justify-center shadow-lg shrink-0">
              {scanning ? <Loader2 className="h-7 w-7 text-white animate-spin" /> : <Sparkles className="h-7 w-7 text-white" />}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <h3 className="text-lg font-bold">배당금 내역 자동 인식</h3>
              <p className="text-sm text-muted-foreground mt-1">
                입출금 내역을 캡쳐하여 붙여넣으세요 (Ctrl+V)
              </p>
              
              {scanPreview && (
                <div className="mt-4 relative inline-block group">
                  <img src={scanPreview} alt="Preview" className="max-h-32 rounded-xl border-2 border-white shadow-md" />
                  <button 
                    onClick={() => setScanPreview(null)} 
                    className="absolute -top-2 -right-2 bg-destructive text-white rounded-full p-1 shadow-lg group-hover:scale-110 transition-transform"
                  >
                    <X className="h-3 w-3"/>
                  </button>
                </div>
              )}

              <div className="mt-6 flex flex-wrap gap-3">
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleScreenshot(f);
                  e.target.value = '';
                }} />
                <Button size="sm" onClick={() => fileInputRef.current?.click()} className="bg-gradient-primary border-none shadow-md">
                  <ImagePlus className="mr-2 h-4 w-4" /> 이미지 선택
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setDraftRows([]); setReviewOpen(true); }} className="bg-background">
                  <Plus className="mr-2 h-4 w-4" /> 직접 입력
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <DividendBulkReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        rows={draftRows}
        setRows={setDraftRows}
        fxRate={fxRate}
        onSaved={onSaved}
      />
    </>
  );
};