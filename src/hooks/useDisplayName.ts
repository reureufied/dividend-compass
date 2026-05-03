import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const useDisplayName = () => {
  const { user } = useAuth();
  const [name, setName] = useState<string>("");

  useEffect(() => {
    if (!user) { setName(""); return; }
    const meta = (user.user_metadata ?? {}) as Record<string, any>;
    const fromMeta = meta.full_name || meta.display_name || meta.username;
    if (fromMeta) { setName(String(fromMeta)); return; }
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setName(data?.display_name || user.email?.split("@")[0] || "");
      });
  }, [user]);

  return name;
};
