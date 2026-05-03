import { useMemo, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, CalendarIcon, Loader2, Trash2 } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export interface HoldingDraft {
  asset_name: string;
  quantity: string;
  avg_purchase_price: string;
  current_price: string;
  target_weight: string;
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

export const toHoldingDraft = (r: any): HoldingDraft => ({
  asset_name: typeof r?.asset_name === "string" ? r.asset_name : "",
  quantity: r?.quantity > 0 ? String(r.quantity) : "",
  avg_purchase_price: r?.avg_purchase_price > 0 ? String(r.avg_purchase_price) : "",
  current_price: r?.current_price > 0 ? String(r.current_price) : "",
  target_weight: "",
});

export const PortfolioBulkReview = ({
  open, onOpenChange, rows, setRows, snapshotDate, setSnapshotDate, onSaved,
}: Props) => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const knownNames = useKnownAssetNames();

  const update = (i: number, patch: Partial<HoldingDraft>) =>
    setRows(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => setRows(rows.filter((_, idx) => idx !== i));

  const validCount = useMemo(
    () => rows.filter((r) => r.asset_name.trim() && parseFloat(r.quantity) > 0).length,
    [rows]
  );

  const handleSave = async () => {
    if (!user) return;
    const dateStr = format(snapshotDate, "yyyy-MM-dd");
    const payload = rows
      .filter((r) => r.asset_name.trim() && parseFloat(r.quantity) > 0)
      .map((r) => ({
        user_id: user.id,
        snapshot_date: dateStr,
        asset_name: r.asset_name.trim(),
        quantity: parseFloat(r.quantity) || 0,
        avg_purchase_price: parseFloat(r.avg_purchase_price) || 0,
        current_price: parseFloat(r.current_price) || 0,
        target_weight: parseFloat(r.target_weight) || 0,
      }));
    if (payload.length === 0) {
      toast.error("저장할 유효한 항목이 없어요");
      return;
    }
    setSaving(true);
    try {
      // Upsert by (user_id, snapshot_date, asset_name) → 같은 날짜 동일 종목 덮어쓰기
      const { error } = await supabase
        .from("portfolio_snapshots")
        .upsert(payload, { onConflict: "user_id,snapshot_date,asset_name" });
      if (error) throw error;
      toast.success(`${payload.length}건이 ${dateStr} 스냅샷으로 저장되었어요 🎉`);
      onOpenChange(false);
      setRows([]);
      onSaved();
    } catch (err: any) {
      toast.error(err?.message ?? "저장 중 오류가 발생했어요");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>보유 종목 검토 & 스냅샷 저장</DialogTitle>
          <DialogDescription>
            기준 날짜를 확인하고, 종목·수량·단가·목표 비중(%)을 검토해 주세요. 같은 날짜의 동일 종목은 덮어쓰기 됩니다.
          </DialogDescription>
        </DialogHeader>

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

        <div className="max-h-[55vh] overflow-auto rounded-lg border border-border">
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
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    검토할 항목이 없습니다.
                  </TableCell>
                </TableRow>
              )}
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <AssetCombobox
                        value={r.asset_name}
                        onChange={(v) => update(i, { asset_name: v })}
                        options={knownNames}
                        placeholder="종목 선택 또는 입력"
                      />
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
                    <Input type="number" step="any" value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value })} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="any" value={r.avg_purchase_price} onChange={(e) => update(i, { avg_purchase_price: e.target.value })} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="any" value={r.current_price} onChange={(e) => update(i, { current_price: e.target.value })} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Input type="number" step="any" placeholder="0" value={r.target_weight} onChange={(e) => update(i, { target_weight: e.target.value })} className="h-9" />
                  </TableCell>
                  <TableCell>
                    <Button type="button" variant="ghost" size="icon" onClick={() => remove(i)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <p className="text-sm text-muted-foreground self-center">총 {rows.length}건 · 유효 {validCount}건</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>취소</Button>
            <Button onClick={handleSave} disabled={saving || validCount === 0} className="bg-gradient-primary hover:opacity-90">
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {validCount}건 스냅샷 저장
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
