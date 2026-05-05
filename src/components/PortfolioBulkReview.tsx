import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, Calculator, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useKnownAssetNames } from "@/hooks/useKnownAssetNames";
import { findSimilarAsset } from "@/lib/assetMatch";
import { AssetCombobox } from "@/components/AssetCombobox";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface HoldingDraft {
  asset_name: string;
  quantity: string;
  avg_purchase_price: string;
  current_price: string;
  target_weight: string;
  auto_mapped?: boolean;
  original_name?: string;
  computed_fields?: string[];
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rows: HoldingDraft[];
  setRows: (rows: HoldingDraft[]) => void;
  snapshotDate: Date;
  setSnapshotDate: (d: Date) => void;
  onSaved: () => void;
}

export const PortfolioBulkReview = ({
  open, onOpenChange, rows, setRows, snapshotDate, setSnapshotDate, onSaved,
}: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false); // 덮어쓰기 팝업 상태
  const knownNames = useKnownAssetNames();

  const update = (i: number, patch: Partial<HoldingDraft>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const validCount = useMemo(
    () => rows.filter((r) => r.asset_name.trim() && parseFloat(r.quantity) > 0).length,
    [rows]
  );

  // 🌟 [핵심] 실제 DB 저장을 수행하는 함수 (기존 날짜 데이터 삭제 후 삽입)
  const executeSave = async () => {
    if (!user) return;
    const dateStr = format(snapshotDate, "yyyy-MM-dd");
    const payload = rows
      .filter((r) => r.asset_name.trim() && parseFloat(r.quantity) > 0)
      .map((r) => ({
        user_id: user.id,
        snapshot_date: dateStr, // 모든 항목이 선택된 하나의 날짜로 통일됩니다.
        asset_name: r.asset_name.trim(),
        quantity: parseFloat(r.quantity) || 0,
        avg_purchase_price: parseFloat(r.avg_purchase_price) || 0,
        current_price: parseFloat(r.current_price) || 0,
        target_weight: parseFloat(r.target_weight) || 0,
      }));

    setSaving(true);
    try {
      // 1. 해당 날짜의 기존 기록을 모두 삭제 (찌꺼기 방지 및 깔끔한 덮어쓰기)
      await supabase
        .from("portfolio_snapshots")
        .delete()
        .eq("user_id", user.id)
        .eq("snapshot_date", dateStr);

      // 2. 새로운 기록 삽입
      const { error } = await supabase.from("portfolio_snapshots").insert(payload);
      if (error) throw error;

      toast.success(`${dateStr} 자산 현황이 저장되었습니다 🎉`);
      onOpenChange(false);
      setRows([]);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "저장 중 오류가 발생했어요");
    } finally {
      setSaving(false);
      setShowOverwriteConfirm(false);
    }
  };

  // 🌟 [핵심] 저장 버튼 클릭 시 날짜 중복 여부를 먼저 체크
  const handleSaveAttempt = async () => {
    if (!user) return;
    const dateStr = format(snapshotDate, "yyyy-MM-dd");
    
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("portfolio_snapshots")
        .select("id")
        .eq("user_id", user.id)
        .eq("snapshot_date", dateStr)
        .limit(1);

      if (existing && existing.length > 0) {
        setShowOverwriteConfirm(true); // 중복이면 덮어쓰기 물어보기
      } else {
        await executeSave(); // 중복 없으면 바로 저장
      }
    } catch (err) {
      toast.error("데이터 확인 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>보유 종목 검토 & 기록 저장</DialogTitle>
            <DialogDescription>
              {format(snapshotDate, "yyyy년 MM월 dd일")} 시점의 자산 상태를 저장합니다. 이미 기록이 있다면 현재 내용으로 교체됩니다.
            </DialogDescription>
          </DialogHeader>

          {/* 상단 통합 날짜 선택 UI */}
          <div className="flex items-center gap-3 mb-2">
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

          {/* AI 자동 계산 안내 문구 (생략 가능) */}
          {(() => {
            const computedRows = rows.filter((r) => (r.computed_fields?.length ?? 0) > 0);
            if (computedRows.length === 0) return null;
            return (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm flex gap-2 items-start">
                <Calculator className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-foreground">{computedRows.length}건의 단가가 자동 계산되었습니다.</p>
                </div>
              </div>
            );
          })()}

          <div className="max-h-[55vh] overflow-auto rounded-lg border border-border mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>종목명</TableHead>
                  <TableHead className="w-[110px]">수량</TableHead>
                  <TableHead className="w-[140px]">매수단가</TableHead>
                  <TableHead className="w-[140px]">현재단가</TableHead>
                  <TableHead className="w-[120px]">목표 비중(%)</TableHead>
                  <TableHead className="w-[50px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8">항목이 없습니다.</TableCell></TableRow>
                )}
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    {/* 종목명 (AssetCombobox) */}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AssetCombobox
                          value={r.asset_name}
                          onChange={(v) => update(i, { asset_name: v, auto_mapped: false })}
                          options={knownNames}
                        />
                        {r.auto_mapped && <Sparkles className="h-4 w-4 text-primary shrink-0" />}
                      </div>
                    </TableCell>
                    {/* 수량 */}
                    <TableCell>
                      <Input type="number" step="any" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="h-9" />
                    </TableCell>
                    {/* 매수단가 */}
                    <TableCell>
                      <Input type="number" step="any" value={r.avg_purchase_price} onChange={(e) => update(i, { avg_purchase_price: e.target.value })} className="h-9" />
                    </TableCell>
                    {/* 현재단가 */}
                    <TableCell>
                      <Input type="number" step="any" value={r.current_price} onChange={(e) => update(i, { current_price: e.target.value })} className="h-9" />
                    </TableCell>
                    {/* 목표 비중 */}
                    <TableCell>
                      <Input type="number" step="any" value={r.target_weight} onChange={(e) => update(i, { target_weight: e.target.value })} className="h-9" />
                    </TableCell>
                    {/* 삭제 */}
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => remove(i)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <p className="text-sm text-muted-foreground self-center">유효 항목: {validCount}건</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
              <Button onClick={handleSaveAttempt} disabled={saving || validCount === 0} className="bg-gradient-primary">
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                기록 저장하기
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 🌟 중복 날짜 확인을 위한 AlertDialog */}
      <AlertDialog open={showOverwriteConfirm} onOpenChange={setShowOverwriteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>이미 기록이 존재합니다.</AlertDialogTitle>
            <AlertDialogDescription>
              {format(snapshotDate, "yyyy년 MM월 dd일")}에 저장된 자산 기록이 이미 있습니다. 
              기존 기록을 모두 삭제하고 현재 데이터로 덮어씌울까요?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>기존 기록 유지</AlertDialogCancel>
            <AlertDialogAction 
              disabled={saving}
              className="bg-destructive hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                executeSave();
              }}
            >
              덮어쓰기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};