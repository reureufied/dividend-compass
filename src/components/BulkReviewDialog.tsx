import { useMemo, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
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

  const handleSave = async () => {
    if (!user) return;
    const valid = rows.filter(
      (r) => r.date && r.asset_name.trim() && parseFloat(r.amount) > 0
    );
    if (valid.length === 0) {
      toast.error("저장할 유효한 내역이 없어요");
      return;
    }
    setSaving(true);
    try {
      const payload = valid.map((r) => {
        const amt = parseFloat(r.amount);
        const amount_krw = r.currency === "USD" ? amt * fxRate : amt;
        return {
          user_id: user.id,
          date: r.date,
          asset_name: r.asset_name.trim(),
          category: r.category,
          amount: amt,
          currency: r.currency,
          amount_krw,
        };
      });
      const { error } = await supabase.from("dividends").insert(payload);
      if (error) throw error;
      toast.success(`${payload.length}건이 저장되었습니다 🎉`);
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
                    <Input
                      value={r.asset_name}
                      onChange={(e) => update(i, { asset_name: e.target.value })}
                      className="h-9"
                    />
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
