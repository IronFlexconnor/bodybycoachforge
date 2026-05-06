// Nutrition coach: actions = "calc_macros" | "suggest_meals" | "review_day"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are a certified sports nutritionist and personal trainer. Voice: warm, professional, evidence-based, never robotic, never preachy. Use simple language. Always tailor to goal, weight, training volume, and dietary preferences. Never give medical advice — refer to a registered dietitian or doctor for medical conditions.

Respond in JSON only, matching the requested action's schema.`;

const SCHEMAS: Record<string, string> = {
  calc_macros: `{"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "rationale": "1-2 sentence explanation in coach voice"}`,
  suggest_meals: `{"meals": [{"name": "Breakfast", "title": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "ingredients": ["..."], "prep": "1-2 sentence prep"}]}`,
  review_day: `{"summary": "Warm coach review of the day's intake (2-3 sentences)", "score": 0-100, "wins": ["..."], "fixes": ["..."]}`,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    const authHeader = req.headers.get("Authorization");
    if (!apiKey || !authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { action } = await req.json();
    if (!SCHEMAS[action]) return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Complete your profile first" }), { status: 400, headers: cors });

    let userPrompt = "";
    if (action === "calc_macros") {
      userPrompt = `Calculate daily calorie & macro targets.\nProfile: ${JSON.stringify(profile)}\nReturn JSON: ${SCHEMAS.calc_macros}`;
    } else if (action === "suggest_meals") {
      const macros = profile.macro_targets ?? null;
      userPrompt = `Suggest 4 simple meals (Breakfast, Lunch, Dinner, Snack) totaling roughly the user's daily macros. Use foods that match their diet preference.\nProfile: ${JSON.stringify(profile)}\nMacros: ${JSON.stringify(macros)}\nReturn JSON: ${SCHEMAS.suggest_meals}`;
    } else if (action === "review_day") {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data: meals } = await supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", since.toISOString());
      userPrompt = `Review today's intake vs targets. Be specific and warm.\nProfile: ${JSON.stringify(profile)}\nMacros target: ${JSON.stringify(profile.macro_targets)}\nMeals today: ${JSON.stringify(meals)}\nReturn JSON: ${SCHEMAS.review_day}`;
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "system", content: SYS }, { role: "user", content: userPrompt }],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: cors });
      const t = await aiResp.text();
      console.error("nutrition-coach error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const aiJson = await aiResp.json();
    let result: any = {};
    try { result = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch { result = {}; }

    if (action === "calc_macros" && result.calories) {
      await supabase.from("profiles").update({
        macro_targets: {
          calories: result.calories,
          protein_g: result.protein_g,
          carbs_g: result.carbs_g,
          fat_g: result.fat_g,
        },
      }).eq("user_id", user.id);
    }

    return new Response(JSON.stringify(result), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("nutrition-coach error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
