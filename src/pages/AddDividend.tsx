import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DividendForm } from "@/components/DividendForm";
import { DividendHistory } from "@/components/DividendHistory";
import { Dividend } from "@/lib/dividends";
import { toast } from "sonner";

const AddDividend = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Dividend | null>(null);

  useEffect(() => {
    document.title = "내역 입력 · Dividend Tracker";
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("dividends")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as Dividend[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">기록 추가</h1>
        <p className="text-muted-foreground mt-1">받은 배당을 기록하고 관리하세요</p>
      </header>

      <DividendForm
        editing={editing}
        onSaved={load}
        onCancelEdit={() => setEditing(null)}
      />

      <DividendHistory
        items={items}
        loading={loading}
        onEdit={(d) => {
          setEditing(d);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        onChanged={load}
      />
    </div>
  );
};

export default AddDividend;
