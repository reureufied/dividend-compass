import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatKRW } from "@/lib/fx";

interface Row {
  id: string;
  asset_name: string;
  principal: number;
}

export const PortfolioEditor = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [principal, setPrincipal] = useState("");

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("portfolio")
      .select("id, asset_name, principal")
      .order("asset_name", { ascending: true });
    setRows((data ?? []) as Row[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const trimmed = name.trim();
    const value = parseFloat(principal);
    if (!trimmed) return toast.error("종목명을 입력해주세요");
    if (!isFinite(value) || value < 0) return toast.error("올바른 금액을 입력해주세요");

    setSaving(true);
    const { error } = await supabase
      .from("portfolio")
      .upsert(
        { user_id: user.id, asset_name: trimmed, principal: value },
        { onConflict: "user_id,asset_name" }
      );
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("저장되었습니다");
    setName("");
    setPrincipal("");
    load();
  };

  const updateRow = async (row: Row, newPrincipal: number) => {
    const { error } = await supabase
      .from("portfolio")
      .update({ principal: newPrincipal })
      .eq("id", row.id);
    if (error) toast.error(error.message);
    else {
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, principal: newPrincipal } : r)));
    }
  };

  const removeRow = async (row: Row) => {
    const { error } = await supabase.from("portfolio").delete().eq("id", row.id);
    if (error) return toast.error(error.message);
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    toast.success("삭제되었습니다");
  };

  const total = rows.reduce((s, r) => s + Number(r.principal || 0), 0);

  return (
    <Card className="p-6 shadow-elev-sm">
      <div className="flex items-center gap-2 mb-2">
        <Wallet className="h-4 w-4 text-muted-foreground" />
        <h2 className="font-semibold">투자 원금</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        종목별 총 투자 금액을 입력하면 수익률 분석에 사용됩니다.
      </p>

      <form onSubmit={handleAdd} className="grid gap-3 sm:grid-cols-[1fr,1fr,auto] items-end mb-5">
        <div className="space-y-2">
          <Label htmlFor="pf-name">종목명</Label>
          <Input
            id="pf-name"
            placeholder="예: SCHD"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pf-amount">투자 원금 (KRW)</Label>
          <Input
            id="pf-amount"
            type="number"
            min="0"
            step="10000"
            inputMode="numeric"
            placeholder="예: 10000000"
            value={principal}
            onChange={(e) => setPrincipal(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={saving} className="h-10">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          <span className="ml-1">추가/수정</span>
        </Button>
      </form>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">등록된 종목이 없습니다.</p>
      ) : (
        <>
          <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
            {rows.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <span className="font-medium flex-1 truncate">{r.asset_name}</span>
                <Input
                  type="number"
                  min="0"
                  step="10000"
                  defaultValue={r.principal}
                  onBlur={(e) => {
                    const v = parseFloat(e.target.value);
                    if (isFinite(v) && v >= 0 && v !== Number(r.principal)) updateRow(r, v);
                  }}
                  className="w-40 text-right tabular-nums"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => removeRow(r)}
                  className="text-destructive hover:text-destructive"
                  aria-label="삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground mt-3 text-right tabular-nums">
            총 원금: <span className="font-semibold text-foreground">{formatKRW(total)}</span>
          </p>
        </>
      )}
    </Card>
  );
};
