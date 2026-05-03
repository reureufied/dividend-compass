import { useMemo, useState } from "react";
import { AlertTriangle, Loader2, Sparkles, Trash2 } from "lucide-react";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { findSimilarAsset } from "@/lib/assetMatch";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { AssetCombobox } from "@/components/AssetCombobox";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { CATEGORIES, Category, Currency } from "@/lib/dividends";

export interface DraftRow {
  date: string; // YYYY-MM-DD
  asset_name: string;
  category: Category;
  amount: string; // string for editable input
  currency: Currency;
  auto_mapped?: boolean;
  original_name?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: DraftRow[];
  setRows: (rows: DraftRow[]) => void;
  fxRate: number;
  onSaved: () => void;
}

export const BulkReviewDialog = ({ open, onOpenChange, rows, setRows, fxRate, onSaved }: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const knownNames = useKnownAssetNames();

  const update = (idx: number, patch: Partial<DraftRow>) => {
    setRows(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const remove = (idx: number) => setRows(rows.filter((_, i) => i !== idx));

  const validCount = useMemo(
    () =>
      rows.filter(
        (r) => r.date && r.asset_name.trim() && parseFloat(r.amount) > 0 && (r.currency === "USD" || r.currency === "KRW")
      ).length,
    [rows]
  );

  const [dupOpen, setDupOpen] = useState(false);
  const [dupCount, setDupCount] = useState(0);
  const [pendingPayload, setPendingPayload] = useState<any[]>([]);

  const buildPayload = (rs: DraftRow[]) =>
    rs
      .filter((r) => r.date && r.asset_name.trim() && parseFloat(r.amount) > 0)
      .map((r) => {
        const amt = parseFloat(r.amount);
        const amount_krw = r.currency === "USD" ? amt * fxRate : amt;
        return {
          user_id: user!.id,
          date: r.date,
          asset_name: r.asset_name.trim(),
          category: r.category,
          amount: amt,
          currency: r.currency,
          amount_krw,
        };
      });

  const insertRows = async (payload: any[]) => {
    const { error } = await supabase.from("dividends").insert(payload);
    if (error) throw error;
    toast.success(`${payload.length}건이 저장되었습니다 🎉`);
    onOpenChange(false);
    setRows([]);
    onSaved();
  };

  const handleSave = async () => {
    if (!user) return;
    const payload = buildPayload(rows);
    if (payload.length === 0) {
      toast.error("저장할 유효한 내역이 없어요");
      return;
    }
    setSaving(true);
    try {
      // Fetch existing rows that match any of the (date, asset_name) combos
      const dates = Array.from(new Set(payload.map((p) => p.date)));
      const names = Array.from(new Set(payload.map((p) => p.asset_name)));
      const { data: existing, error: qErr } = await supabase
        .from("dividends")
        .select("date, asset_name, amount")
        .in("date", dates)
        .in("asset_name", names);
      if (qErr) throw qErr;

      const existingKeys = new Set(
        (existing ?? []).map((e: any) => `${e.date}|${e.asset_name}|${Number(e.amount)}`)
      );
      const dups = payload.filter((p) => existingKeys.has(`${p.date}|${p.asset_name}|${Number(p.amount)}`));
      const fresh = payload.filter((p) => !existingKeys.has(`${p.date}|${p.asset_name}|${Number(p.amount)}`));

      if (dups.length === 0) {
        await insertRows(payload);
        return;
      }

      if (fresh.length === 0) {
        toast.info("모든 기록이 이미 저장되어 있습니다.");
        onOpenChange(false);
        setRows([]);
        return;
      }

      // Mixed → confirm
      setDupCount(dups.length);
      setPendingPayload(fresh);
      setDupOpen(true);
    } catch (err: any) {
      toast.error(err?.message ?? "저장 중 오류가 발생했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>추출된 내역 검토</DialogTitle>
          <DialogDescription>
            저장 전 오타를 수정하거나 잘못 인식된 행을 삭제하세요. 확인 후 일괄 저장됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[140px]">날짜</TableHead>
                <TableHead>종목명</TableHead>
                <TableHead className="w-[140px]">분류</TableHead>
                <TableHead className="w-[130px]">금액</TableHead>
                <TableHead className="w-[90px]">통화</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    검토할 내역이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Input
                      type="date"
                      value={r.date}
                      onChange={(e) => update(i, { date: e.target.value })}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <AssetCombobox
                        value={r.asset_name}
                        onChange={(v) => update(i, { asset_name: v, auto_mapped: false })}
                        options={knownNames}
                        placeholder="종목 선택 또는 입력"
                      />
                      {r.auto_mapped && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="shrink-0 inline-flex items-center justify-center h-7 w-7 text-primary" aria-label="자동 매치됨">
                                <Sparkles className="h-4 w-4" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              기존 포트폴리오 종목과 자동 매치되었습니다
                              {r.original_name ? ` (원본: "${r.original_name}")` : ""}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {(() => {
                        const sug = findSimilarAsset(r.asset_name, knownNames);
                        if (!sug) return null;
                        return (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  onClick={() => update(i, { asset_name: sug })}
                                  className="shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md hover:bg-accent text-amber-500"
                                  aria-label="유사 종목으로 교정"
                                >
                                  <AlertTriangle className="h-4 w-4" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>
                                기존 종목 <span className="font-semibold">"{sug}"</span>과(와) 일치하나요? (클릭하여 교정)
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select value={r.category} onValueChange={(v) => update(i, { category: v as Category })}>
                      <SelectTrigger className="h-9">
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
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      step="0.01"
                      value={r.amount}
                      onChange={(e) => update(i, { amount: e.target.value })}
                      className="h-9"
                    />
                  </TableCell>
                  <TableCell>
                    <Select value={r.currency} onValueChange={(v) => update(i, { currency: v as Currency })}>
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="KRW">KRW</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(i)}
                      aria-label="행 삭제"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground self-center">
            총 {rows.length}건 · 유효 {validCount}건
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || validCount === 0}
              className="bg-gradient-primary hover:opacity-90"
            >
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {validCount}건 일괄 저장하기
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <AlertDialog open={dupOpen} onOpenChange={setDupOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>중복된 기록이 발견되었어요</AlertDialogTitle>
          <AlertDialogDescription>
            이미 저장된 동일한 배당 기록이 {dupCount}건 발견되었습니다. 중복된 기록을 제외하고 새로운 기록만 저장하시겠습니까?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>취소</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={async (e) => {
              e.preventDefault();
              setSaving(true);
              try {
                await insertRows(pendingPayload);
                setDupOpen(false);
              } catch (err: any) {
                toast.error(err?.message ?? "저장 중 오류가 발생했어요");
              } finally {
                setSaving(false);
              }
            }}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            중복 제외하고 저장 ({pendingPayload.length}건)
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
};

// helper to build a draft row from AI result
export const toDraftRow = (r: any): DraftRow => {
  let date = "";
  if (r?.date) {
    const d = new Date(r.date);
    if (!isNaN(d.getTime())) date = format(d, "yyyy-MM-dd");
  }
  if (!date) date = format(new Date(), "yyyy-MM-dd");
  const cat = (CATEGORIES as readonly string[]).includes(r?.category) ? (r.category as Category) : "미국 ETF";
  const currency: Currency = r?.currency === "KRW" ? "KRW" : "USD";
  return {
    date,
    asset_name: typeof r?.asset_name === "string" ? r.asset_name : "",
    category: cat,
    amount: typeof r?.amount === "number" && r.amount > 0 ? String(r.amount) : "",
    currency,
  };
};
