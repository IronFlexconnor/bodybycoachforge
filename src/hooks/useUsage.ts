import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useSubscription } from "./useSubscription";

const FREE_LIMITS = {
  chat_per_day: 5,
  video_per_month: 3,
  nutrition_deep_per_month: 1,
} as const;

type Window = "day" | "month";

/** Counts AI usage for the current period. Returns remaining count for free users. */
export function useUsage(kind: "chat" | "video" | "nutrition_deep") {
  const { user } = useAuth();
  const { tier, loading: subLoading } = useSubscription();
  const [used, setUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    const win: Window = kind === "chat" ? "day" : "month";
    const since = new Date();
    if (win === "day") since.setHours(0, 0, 0, 0);
    else since.setDate(1), since.setHours(0, 0, 0, 0);
    const { count } = await supabase
      .from("ai_usage")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("kind", kind)
      .gte("used_at", since.toISOString());
    setUsed(count ?? 0);
    setLoading(false);
  }, [user, kind]);

  useEffect(() => { refetch(); }, [refetch]);

  const limit =
    kind === "chat" ? FREE_LIMITS.chat_per_day
    : kind === "video" ? FREE_LIMITS.video_per_month
    : FREE_LIMITS.nutrition_deep_per_month;

  const isFree = tier === "free";
  const remaining = isFree ? Math.max(0, limit - used) : Infinity;

  return {
    loading: loading || subLoading,
    isFree,
    used,
    limit,
    remaining,
    showWarning: isFree && remaining === 1,
    refetch,
  };
}
