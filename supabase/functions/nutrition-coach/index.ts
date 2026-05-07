// Nutrition coach: actions = "calc_macros" | "suggest_meals" | "review_day" | "meal_plan" | "meal_prep"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are a certified sports nutritionist and personal trainer. Voice: warm, professional, evidence-based, never robotic, never preachy. Use simple language. Always tailor to goal, weight, training volume, dietary preferences, allergies, and the user's CURRENT TRAINING PROGRAM. Higher carbs on heavy training days, higher protein during muscle-building phases, lighter recovery-focused meals on deload/rest days. Strictly avoid every allergen the user lists. Never give medical advice — refer to a registered dietitian or doctor for medical conditions.

Respond in JSON only, matching the requested action's schema.`;

const SCHEMAS: Record<string, string> = {
  calc_macros: `{"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "rationale": "1-2 sentence explanation in coach voice"}`,
  suggest_meals: `{"meals": [{"name": "Breakfast", "title": "...", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "ingredients": ["..."], "prep": "1-2 sentence prep"}]}`,
  review_day: `{"summary": "Warm coach review of the day's intake (2-3 sentences)", "score": 0-100, "wins": ["..."], "fixes": ["..."]}`,
  meal_plan: `{"summary": "1-2 sentence overview tying meals to this week's training", "days": [{"day": "Mon", "training_focus": "Push (heavy)", "calorie_target": 0, "meals": [{"slot": "Breakfast", "title": "...", "search_query": "short YouTube search query for a meal-prep demo video, e.g. 'overnight oats meal prep'", "calories": 0, "protein_g": 0, "carbs_g": 0, "fat_g": 0, "ingredients_with_units": ["6 oz chicken (170 g)", "..."], "instructions": ["step 1", "step 2"], "training_rationale": "why this meal supports today's session", "meal_prep": {"batch_cook": "how to batch cook for the week", "store": "fridge/freezer storage", "reheat": "best reheat method", "make_ahead": "what can be prepped on Sunday", "substitutions": ["alt for any allergen/restriction"], "portion_scaling": "how to scale up/down"}}]}], "shopping_list": [{"category": "Protein", "items": ["..."]}]}`,
  meal_prep: `{"meal_title": "...", "batch_cook": "...", "store": "...", "reheat": "...", "make_ahead": "...", "substitutions": ["..."], "portion_scaling": "...", "shopping_list": ["..."]}`,
};

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

    const { action, prompt: userExtraPrompt } = await req.json();
    if (!SCHEMAS[action]) return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });

    // --- Plan limits ---
    const { getPlanTier } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    const proOnly = ["suggest_meals", "review_day", "meal_plan", "meal_prep"];
    if (tier === "free" && proOnly.includes(action)) {
      return new Response(JSON.stringify({
        error: "limit_reached",
        code: "nutrition_pro_only",
        message: "Personalized meal plans, recipes, and meal-prep guides are part of Pro Coach. Start your 7-day free trial to unlock the full nutrition planner synced with your training.",
      }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Complete your profile first" }), { status: 400, headers: cors });

    // Pull active training program & upcoming workouts so meals sync with training
    const { data: program } = await supabase.from("programs").select("name, style, current_week, weeks, structure").eq("user_id", user.id).eq("is_active", true).maybeSingle();
    const since = new Date(); since.setDate(since.getDate() - 1);
    const until = new Date(); until.setDate(until.getDate() + 7);
    const { data: upcoming } = await supabase.from("workouts").select("title, focus, scheduled_date, day, week").eq("user_id", user.id).gte("scheduled_date", since.toISOString().slice(0, 10)).lte("scheduled_date", until.toISOString().slice(0, 10)).order("scheduled_date");

    const np = (profile as any).nutrition_preferences ?? {};
    const trainingContext = { program, upcoming };

    let userPrompt = "";
    if (action === "calc_macros") {
      userPrompt = `Calculate daily calorie & macro targets, accounting for training load.\nProfile: ${JSON.stringify(profile)}\nNutrition prefs: ${JSON.stringify(np)}\nTraining: ${JSON.stringify(trainingContext)}\nReturn JSON: ${SCHEMAS.calc_macros}`;
    } else if (action === "suggest_meals") {
      userPrompt = `Suggest 4 simple meals (Breakfast, Lunch, Dinner, Snack) totaling roughly the user's daily macros. Match diet preferences and STRICTLY avoid all allergens.\nProfile: ${JSON.stringify(profile)}\nNutrition prefs: ${JSON.stringify(np)}\nMacros target: ${JSON.stringify(profile.macro_targets)}\nReturn JSON: ${SCHEMAS.suggest_meals}`;
    } else if (action === "review_day") {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const { data: meals } = await supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", start.toISOString());
      userPrompt = `Review today's intake vs targets. Be specific and warm.\nProfile: ${JSON.stringify(profile)}\nMacros target: ${JSON.stringify(profile.macro_targets)}\nMeals today: ${JSON.stringify(meals)}\nReturn JSON: ${SCHEMAS.review_day}`;
    } else if (action === "meal_plan") {
      userPrompt = `Build a 7-day personalized meal plan that perfectly mirrors the user's training schedule. Higher carbs on heavy lifting days, higher protein during muscle-building blocks, lighter recovery meals on rest/deload days. Respect allergies and dietary restrictions ABSOLUTELY. Match the user's preferred meals/day count. For every meal include a meal_prep block with batch cooking, storage, reheating, make-ahead, substitutions for the user's allergies, and portion scaling. Use the user's preferred weight unit (${profile.units}) for ingredient weights — show both metric and imperial when sensible.\nProfile: ${JSON.stringify(profile)}\nNutrition prefs: ${JSON.stringify(np)}\nMacros target: ${JSON.stringify(profile.macro_targets)}\nTraining: ${JSON.stringify(trainingContext)}\nUser request (optional): ${userExtraPrompt ?? ""}\nReturn JSON: ${SCHEMAS.meal_plan}`;
    } else if (action === "meal_prep") {
      userPrompt = `Generate a detailed meal-prep guide for this meal: ${userExtraPrompt}\nNutrition prefs: ${JSON.stringify(np)}\nReturn JSON: ${SCHEMAS.meal_prep}`;
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
