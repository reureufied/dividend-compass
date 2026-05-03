import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DividendForm } from "@/components/DividendForm";
import { DividendHistory } from "@/components/DividendHistory";
import { DividendUploadCard } from "@/components/DividendUploadCard";
import { PortfolioUploadCard } from "@/components/PortfolioUploadCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Dividend } from "@/lib/dividends";
import { getUsdKrwRate } from "@/lib/fx";
import { toast } from "sonner";

const AddDividend = () => {
  const { user } = useAuth();
  const [items, setItems] = useState<Dividend[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Dividend | null>(null);
  const [fxRate, setFxRate] = useState<number>(1350);
  const [manualValue, setManualValue] = useState<string>("");

  useEffect(() => {
    document.title = "기록 추가 · Portfolio Lab";
    getUsdKrwRate().then(({ rate }) => setFxRate(rate));
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

  // Auto-open manual section when editing
  useEffect(() => {
    if (editing) setManualValue("manual");
  }, [editing]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">기록 추가</h1>
        <p className="text-muted-foreground mt-1">배당금과 보유 자산을 한 곳에서 기록하세요</p>
      </header>

      <Tabs defaultValue="dividend" className="space-y-6">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="dividend">배당금 기록</TabsTrigger>
          <TabsTrigger value="portfolio">자산 보유 현황 기록</TabsTrigger>
        </TabsList>

        <TabsContent value="dividend" className="space-y-6">
          <DividendUploadCard
            fxRate={fxRate}
            onSaved={load}
            manualOpen={manualValue === "manual"}
            onToggleManual={() => setManualValue((v) => (v === "manual" ? "" : "manual"))}
          />

          <Accordion
            type="single"
            collapsible
            value={manualValue}
            onValueChange={(v) => {
              setManualValue(v);
              if (!v) setEditing(null);
            }}
          >
            <AccordionItem value="manual" className="border rounded-xl bg-card">
              <AccordionTrigger className="px-5 hover:no-underline">
                <span className="text-base font-semibold">{editing ? "내역 수정" : "수동으로 직접 입력"}</span>
              </AccordionTrigger>
              <AccordionContent className="px-5 pb-5">
                <DividendForm
                  editing={editing}
                  onSaved={() => {
                    load();
                    setEditing(null);
                  }}
                  onCancelEdit={() => setEditing(null)}
                />
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <DividendHistory
            items={items}
            loading={loading}
            onEdit={(d) => {
              setEditing(d);
              setManualValue("manual");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            onChanged={load}
          />
        </TabsContent>

        <TabsContent value="portfolio" className="space-y-6">
          <PortfolioUploadCard onSaved={() => toast.success("기록이 저장되었어요")} />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AddDividend;
