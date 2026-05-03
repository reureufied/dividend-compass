import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

interface Holding {
  id: string;
  asset_name: string;
  quantity: number;
  avg_purchase_price: number;
  current_price: number;
  target_weight: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  holding: Holding | null;
  onSaved: () => void;
}

export const EditHoldingDialog = ({ open, onOpenChange, holding, onSaved }: Props) => {
  const [form, setForm] = useState<Holding | null>(holding);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setForm(holding); }, [holding]);

  if (!form) return null;

  const update = (k: keyof Holding, v: string) => {
    setForm({ ...form, [k]: k === "asset_name" ? v : Number(v) });
  };

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("portfolio_snapshots")
      .update({
        asset_name: form.asset_name,
        quantity: form.quantity,
        avg_purchase_price: form.avg_purchase_price,
        current_price: form.current_price,
        target_weight: form.target_weight,
      })
      .eq("id", form.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("수정되었어요");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>종목 수정 · {form.asset_name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1.5">
            <Label>종목명</Label>
            <Input value={form.asset_name} onChange={(e) => update("asset_name", e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>수량</Label>
              <Input type="number" value={form.quantity} onChange={(e) => update("quantity", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>매수단가</Label>
              <Input type="number" value={form.avg_purchase_price} onChange={(e) => update("avg_purchase_price", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>현재단가</Label>
              <Input type="number" value={form.current_price} onChange={(e) => update("current_price", e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>목표 비중 (%)</Label>
              <Input type="number" value={form.target_weight} onChange={(e) => update("target_weight", e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>취소</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
