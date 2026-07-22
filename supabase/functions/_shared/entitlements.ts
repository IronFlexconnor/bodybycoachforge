// Shared entitlement helper for edge functions. Returns the user's plan tier
// using the `subscriptions` table (env-aware). Free users hit usage caps.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type PlanTier = "free" | "pro" | "elite";

export const PRO_PRICE_IDS = ["pro_coach_monthly", "elite_ai_coach_monthly"];
export const ELITE_PRICE_IDS = ["elite_ai_coach_monthly"];

export const FREE_LIMITS = {
  chat_per_day: 5,
  video_per_month: 3,
  nutrition_deep_per_month: 1,
  meal_photo_per_day: 2,
};

export function adminClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );
}

export async function getPlanTier(userId: string): Promise<PlanTier> {
  const admin = adminClient();
  // Try sandbox + live; whichever has an active row wins.
  const { data } = await admin
    .from("subscriptions")
    .select("status, price_id, current_period_end")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  for (const row of data ?? []) {
    const active =
      ["active", "trialing", "past_due"].includes(row.status) ||
      (row.status === "canceled" && row.current_period_end && new Date(row.current_period_end) > new Date());
    if (!active) continue;
    if (ELITE_PRICE_IDS.includes(row.price_id)) return "elite";
    if (PRO_PRICE_IDS.includes(row.price_id)) return "pro";
  }
  return "free";
}

export async function countUsage(userId: string, kind: string, since: Date): Promise<number> {
  const admin = adminClient();
  const { count } = await admin
    .from("ai_usage")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("kind", kind)
    .gte("used_at", since.toISOString());
  return count ?? 0;
}

export async function logUsage(userId: string, kind: string) {
  const admin = adminClient();
  await admin.from("ai_usage").insert({ user_id: userId, kind });
}
