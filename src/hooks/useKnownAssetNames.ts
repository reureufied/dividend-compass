import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const useKnownAssetNames = (): string[] => {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [a, b] = await Promise.all([
        supabase.from("dividends").select("asset_name"),
        supabase.from("portfolio_snapshots").select("asset_name"),
      ]);
      const set = new Set<string>();
      (a.data ?? []).forEach((r: any) => r.asset_name && set.add(r.asset_name));
      (b.data ?? []).forEach((r: any) => r.asset_name && set.add(r.asset_name));
      if (!cancelled) setNames(Array.from(set).sort());
    })();
    return () => { cancelled = true; };
  }, []);
  return names;
};
