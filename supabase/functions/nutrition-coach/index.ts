// Nutrition coach: actions = "calc_macros" | "suggest_meals" | "review_day" | "meal_plan" | "meal_prep"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are an elite Registered Dietitian (RD, CSSD) and sports nutritionist with 20+ years coaching elite athletes, bodybuilders, physique competitors, and high-performance clients. You have the precision of a clinical dietitian, the periodization expertise of an Olympic sports nutritionist, and the practical sense of a private chef.

CORE PRINCIPLES (apply EVERY plan):
1. PRECISION MACROS — Calorie targets calculated from Mifflin-St Jeor BMR × activity factor, then adjusted by goal (deficit -15-20% for fat loss, surplus +8-12% for lean gain, maintenance for recomp/performance). Protein 1.6–2.2 g/kg bodyweight (higher end for cutting/older lifters). Fat ≥0.8 g/kg (never below 20% of calories). Carbs fill remaining calories — periodized to training.
2. TRAINING PERIODIZATION — Match each day's calories and carbs to that day's session:
   • Heavy/high-volume days: +10-20% carbs, calories at maintenance or surplus
   • Moderate days: baseline macros
   • Rest/recovery days: carbs reduced 15-25%, protein and fat held
   • Pre-workout meal: moderate carbs + lean protein 2-3 h before
   • Post-workout meal: 30-50 g protein + 60-100 g fast carbs within 90 min
   • Hypertrophy phase: prioritize surplus carbs and leucine-rich protein every 3-4 h
   • Cut/peak phase: lean proteins, fibrous carbs, strategic refeeds
3. NUTRIENT DENSITY — Whole foods first. Each day must hit: ≥30 g fiber, 5+ servings vegetables/fruit, omega-3 source 3×/week, lean protein every meal, micronutrient diversity (leafy greens, berries, cruciferous, colorful veg).
4. ABSOLUTE ALLERGEN SAFETY — NEVER include any allergen the user listed. Cross-check every ingredient. When substituting, match macros within ±5 g protein and ±50 kcal.
5. DIETARY ADHERENCE — Honor diet style strictly (vegan = zero animal products, keto = <30 g net carbs/day, halal/kosher, etc.).
6. PRACTICAL EXECUTION — Realistic prep times, common grocery items, batch-cook friendly, repeats 1-2 staples for adherence. Provide exact measurements in BOTH metric (g/ml) and imperial (oz/cups) where sensible.
7. PROFESSIONAL VOICE — Warm, confident, evidence-based. Brief rationale tied to physiology ("post-leg-day glycogen reload", "leucine threshold for MPS"). Never preachy, never generic.
8. SAFETY — Never give medical nutrition therapy advice. For medical conditions (diabetes, kidney disease, eating disorders, pregnancy), recommend the user work with a clinical RD or physician.

Respond in JSON ONLY, matching the requested action's schema exactly. Numbers must be realistic and macros within 5% of the daily target.`;

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
      // Compute training-day map for the next 7 days so AI periodizes precisely
      const dayMap: Array<{ date: string; weekday: string; focus: string; intensity: "heavy" | "moderate" | "rest" }> = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const ds = d.toISOString().slice(0, 10);
        const w = (upcoming ?? []).find((x: any) => x.scheduled_date === ds);
        const focus = w?.focus || w?.title || "Rest";
        const f = (focus + "").toLowerCase();
        const intensity: "heavy" | "moderate" | "rest" =
          !w ? "rest" :
          /(rest|recovery|mobility|deload)/.test(f) ? "rest" :
          /(heavy|max|strength|leg|squat|deadlift|push|pull)/.test(f) ? "heavy" : "moderate";
        dayMap.push({ date: ds, weekday: d.toLocaleDateString("en-US", { weekday: "short" }), focus, intensity });
      }
      const weightKg = profile.units === "metric" ? Number(profile.weight) : Number(profile.weight) * 0.4536;
      userPrompt = `Build a 7-day, dietitian-grade, fully periodized meal plan.

CLIENT PROFILE: ${JSON.stringify(profile)}
BODYWEIGHT_KG: ${isFinite(weightKg) ? weightKg.toFixed(1) : "unknown"}
NUTRITION PREFERENCES: ${JSON.stringify(np)}
DAILY MACRO TARGETS: ${JSON.stringify(profile.macro_targets) || "calculate from profile using Mifflin-St Jeor + activity + goal"}
TRAINING PROGRAM: ${JSON.stringify(program)}
7-DAY TRAINING SCHEDULE (use these EXACT focuses & intensities to periodize): ${JSON.stringify(dayMap)}
USER REQUEST: ${userExtraPrompt || "(none)"}

REQUIREMENTS:
- One day object per entry in the 7-day schedule above (use the SAME weekday and training_focus).
- calorie_target per day MUST reflect intensity: heavy = +10-20% carbs/calories vs baseline, moderate = baseline, rest = -10-15% carbs.
- Each day's meal macros MUST sum to within 5% of that day's calorie_target and hit protein ≥ 1.6 g/kg bodyweight.
- Honor mealsPerDay = ${np.mealsPerDay ?? 3}. Include a peri-workout meal on training days (label slot e.g. "Pre-Workout" or "Post-Workout").
- ZERO allergens from: ${JSON.stringify(np.allergies ?? [])} ${np.allergiesNotes ? "+ " + np.allergiesNotes : ""}.
- Diet style: ${JSON.stringify(np.diets ?? [])} — strictly enforce.
- Ingredients with units in BOTH metric and imperial where sensible (user prefers ${profile.units}).
- Each meal: realistic title, search_query (concise YouTube query for a meal-prep demo), full macros, ingredient list with weights, numbered instructions, training_rationale (1 sentence linking the meal to that day's session physiology), and a complete meal_prep block (batch_cook, store, reheat, make_ahead, substitutions for the user's allergies, portion_scaling).
- Provide a categorized weekly shopping_list (Protein, Produce, Grains/Carbs, Dairy/Alt, Pantry/Fats, Other) with consolidated quantities for the week.
- summary: 2-3 sentence professional overview describing the periodization strategy used.

Return JSON exactly matching: ${SCHEMAS.meal_plan}`;
    } else if (action === "meal_prep") {
      userPrompt = `Generate a detailed dietitian-grade meal-prep guide for this meal: ${userExtraPrompt}\nNutrition prefs: ${JSON.stringify(np)}\nReturn JSON: ${SCHEMAS.meal_prep}`;
    }

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: action === "meal_plan" ? "google/gemini-2.5-pro" : "google/gemini-2.5-flash",
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
