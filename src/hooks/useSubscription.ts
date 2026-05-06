import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getStripeEnvironment,
  PLAN_BY_PRICE,
  type PlanTier,
} from "@/lib/stripe";

export type SubscriptionRow = {
  id: string;
  status: string;
  price_id: string | null;
  product_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  trial_end: string | null;
  stripe_customer_id: string | null;
};

const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

function deriveActive(sub: SubscriptionRow | null): boolean {
  if (!sub) return false;
  if (ACTIVE_STATUSES.has(sub.status)) return true;
  if (
    sub.status === "canceled" &&
    sub.current_period_end &&
    new Date(sub.current_period_end) > new Date()
  ) {
    return true;
  }
  return false;
}

export function useSubscription() {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setSub(null);
      setLoading(false);
      return;
    }
    const env = getStripeEnvironment();
    const { data } = await supabase
      .from("subscriptions")
      .select("id, status, price_id, product_id, current_period_end, cancel_at_period_end, trial_end, stripe_customer_id")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSub((data as SubscriptionRow | null) ?? null);
    setLoading(false);
  }, [user]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (!user) return;
    // Unique channel name per mount avoids Supabase's "cannot add callbacks
    // after subscribe()" error in React StrictMode (double-invoke) and HMR.
    const channelName = `subs-${user.id}-${Math.random().toString(36).slice(2, 10)}`;
    const channel = supabase
      .channel(channelName)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, () => {
        refetch();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, refetch]);

  const isActive = deriveActive(sub);
  const tier: PlanTier = isActive && sub?.price_id ? (PLAN_BY_PRICE[sub.price_id] ?? "free") : "free";
  const isPro = isActive && (tier === "pro" || tier === "elite");
  const isElite = isActive && tier === "elite";
  const isTrialing = sub?.status === "trialing";

  return { sub, loading, isActive, tier, isPro, isElite, isTrialing, refetch };
}
