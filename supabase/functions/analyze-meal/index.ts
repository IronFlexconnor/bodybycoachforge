// Snap-a-Meal: photo → AI calorie & macro estimate.
// Receives a base64 JPEG data URL, returns a structured estimate the client
// confirms before logging to meal_logs (the user always stays in control).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are a professional sports nutritionist with expert-level skill at visually estimating food portions and nutrition from a single photo.

Estimate what's in the photo and its nutrition. Be realistic about portion sizes (use plate/cutlery/hand cues for scale). If multiple items are visible, itemize them. If the photo isn't food, say so via confidence:"none".

Rules:
- calories/macros are for the WHOLE visible serving.
- Round calories to nearest 10, macros to nearest whole gram.
- confidence: "high" (clear, common foods), "medium" (some guessing on portions/ingredients), "low" (hidden ingredients, sauces, mixed dishes), "none" (not food).
- tip: ONE short, non-judgmental coaching note tied to the meal (e.g. protein content, a smart pairing). Never shame.

Return ONLY JSON:
{
  "name": "short meal name for the log (e.g. 'Chicken burrito bowl')",
  "items": [{"food": "...", "portion": "e.g. ~1.5 cups", "calories": 320}],
  "calories": 640,
  "protein_g": 42, "carbs_g": 58, "fat_g": 22,
  "confidence": "high|medium|low|none",
  "tip": "one sentence"
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!apiKey || !authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { image, note } = await req.json();
    if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
      return new Response(JSON.stringify({ error: "A photo is required" }), { status: 400, headers: cors });
    }

    // Free-tier limit (logged only after a successful estimate)
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const used = await countUsage(user.id, "meal_photo", since);
      if (used >= FREE_LIMITS.meal_photo_per_day) {
        return new Response(JSON.stringify({
          error: "limit_reached",
          code: "meal_photo_daily_limit",
          message: `You've used your ${FREE_LIMITS.meal_photo_per_day} free meal scans today. Upgrade to Pro Coach for unlimited scans — snap every meal, track everything.`,
        }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    const { data: profile } = await supabase.from("profiles").select("units, nutrition_preferences, goal").eq("user_id", user.id).maybeSingle();

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Estimate this meal.${note ? ` User note: ${note}` : ""}\nUser context (for the tip only): ${JSON.stringify({ goal: profile?.goal, preferences: profile?.nutrition_preferences ?? null })}`,
              },
              { type: "image_url", image_url: { url: image } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: cors });
      const t = await aiResp.text(); console.error("analyze-meal error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const aiJson = await aiResp.json();
    let result: any = {};
    try { result = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch { result = {}; }

    if (!result?.name || result?.confidence === "none") {
      return new Response(JSON.stringify({ error: "no_food", message: "Couldn't spot food in that photo — try a clearer shot from above." }), { status: 422, headers: { ...cors, "Content-Type": "application/json" } });
    }

    if (tier === "free") await logUsage(user.id, "meal_photo");

    return new Response(JSON.stringify({ estimate: result }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-meal error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
