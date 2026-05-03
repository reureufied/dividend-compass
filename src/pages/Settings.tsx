import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { z } from "zod";
import { Download, LogOut, Mail, Target, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Dividend } from "@/lib/dividends";
import { formatKRW } from "@/lib/fx";
import { PortfolioEditor } from "@/components/PortfolioEditor";
import { AssetMergeManager } from "@/components/AssetMergeManager";

const goalSchema = z.object({
  monthly_goal: z.number().min(0, "0 이상 입력해주세요").max(1_000_000_000_000),
  yearly_goal: z.number().min(0, "0 이상 입력해주세요").max(1_000_000_000_000),
});

const csvEscape = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [monthly, setMonthly] = useState("");
  const [yearly, setYearly] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    document.title = "마이페이지 · Dividend Tracker";
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("monthly_goal, yearly_goal")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setMonthly(String(Number(data?.monthly_goal ?? 0)));
        setYearly(String(Number(data?.yearly_goal ?? 0)));
        setLoading(false);
      });
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const parsed = goalSchema.safeParse({
      monthly_goal: parseFloat(monthly) || 0,
      yearly_goal: parseFloat(yearly) || 0,
    });
    if (!parsed.success) {
      toast.error(parsed.error.errors[0].message);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update(parsed.data)
      .eq("id", user.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("목표가 설정되었습니다! 🎯");
  };

  const handleExport = async () => {
    if (!user) return;
    setExporting(true);
    const { data, error } = await supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: false });
    setExporting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const rows = (data ?? []) as Dividend[];
    if (rows.length === 0) {
      toast.error("내보낼 내역이 없습니다");
      return;
    }
    const headers = ["date", "asset_name", "category", "amount", "currency", "amount_krw"];
    const csv = [
      headers.join(","),
      ...rows.map((r) =>
        [r.date, r.asset_name, r.category, r.amount, r.currency, r.amount_krw ?? ""]
          .map(csvEscape)
          .join(",")
      ),
    ].join("\n");
    // BOM for Excel Korean compatibility
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `dividends_${format(new Date(), "yyyyMMdd")}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${rows.length}건의 내역을 CSV로 내려받았습니다`);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">마이페이지</h1>
        <p className="text-muted-foreground mt-1">목표를 설정하고 데이터를 관리하세요</p>
      </header>

      {/* Account */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-4">
          <Mail className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">계정</h2>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">로그인된 아이디</p>
            <p className="font-medium truncate">
              {(user?.user_metadata as any)?.username ?? user?.email?.split("@")[0]}
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            로그아웃
          </Button>
        </div>
      </Card>

      {/* Goals */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-4">
          <Target className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">배당 목표</h2>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="monthly">월간 목표 (KRW)</Label>
              <Input
                id="monthly"
                type="number"
                inputMode="numeric"
                min="0"
                step="10000"
                placeholder="예: 500000"
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
                disabled={loading}
              />
              {parseFloat(monthly) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatKRW(parseFloat(monthly))}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="yearly">연간 목표 (KRW)</Label>
              <Input
                id="yearly"
                type="number"
                inputMode="numeric"
                min="0"
                step="100000"
                placeholder="예: 6000000"
                value={yearly}
                onChange={(e) => setYearly(e.target.value)}
                disabled={loading}
              />
              {parseFloat(yearly) > 0 && (
                <p className="text-xs text-muted-foreground">
                  {formatKRW(parseFloat(yearly))}
                </p>
              )}
            </div>
          </div>
          <Separator />
          <Button
            type="submit"
            disabled={saving || loading}
            className="bg-gradient-primary hover:opacity-90 transition-opacity h-11 font-semibold shadow-elev-md w-full sm:w-auto"
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            목표 저장
          </Button>
        </form>
      </Card>

      <PortfolioEditor />

      {/* Export */}
      <Card className="p-6 shadow-elev-sm">
        <div className="flex items-center gap-2 mb-2">
          <Download className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold">데이터 내보내기</h2>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          입력한 모든 배당 내역을 CSV 파일로 백업하세요. Excel에서 바로 열어볼 수 있습니다.
        </p>
        <Button variant="outline" onClick={handleExport} disabled={exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          CSV로 내보내기
        </Button>
      </Card>
    </div>
  );
};

export default Settings;
