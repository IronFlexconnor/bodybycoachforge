// Nutrition coach: actions = "calc_macros" | "suggest_meals" | "review_day" | "meal_plan" | "meal_prep"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildMealPlan, calculateMacroTargets, reviewLoggedMeals } from "./planner.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const ACTIONS = new Set(["calc_macros", "suggest_meals", "review_day", "meal_plan", "meal_prep"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { action, prompt: userExtraPrompt } = await req.json();
    if (!ACTIONS.has(action)) return new Response(JSON.stringify({ error: "Unknown action" }), { status: 400, headers: cors });

    const { getPlanTier } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    const proOnly = ["suggest_meals", "review_day", "meal_plan", "meal_prep"];
    if (tier === "free" && proOnly.includes(action)) {
      return new Response(JSON.stringify({
        error: "limit_reached",
        code: "nutrition_pro_only",
        message: "Personalized meal plans, recipes, and meal-prep videos are part of Pro Coach. Start your 7-day free trial to unlock the full nutrition planner synced with your training.",
      }), { status: 402, headers: cors });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Complete your profile first" }), { status: 400, headers: cors });

    const [{ data: program }, { data: upcoming }] = await Promise.all([
      supabase.from("programs").select("name, style, current_week, weeks, structure").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("workouts").select("title, focus, scheduled_date, day, week").eq("user_id", user.id).gte("scheduled_date", new Date(Date.now() - 86400000).toISOString().slice(0, 10)).lte("scheduled_date", new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)).order("scheduled_date"),
    ]);

    const nutritionPrefs = (profile as any).nutrition_preferences ?? {};
    const targets = calculateMacroTargets(profile, nutritionPrefs, program, upcoming ?? []);

    if (action === "calc_macros") {
      await supabase.from("profiles").update({ macro_targets: targets }).eq("user_id", user.id);
      return new Response(JSON.stringify(targets), { headers: cors });
    }

    if (action === "meal_plan") {
      await supabase.from("profiles").update({ macro_targets: targets }).eq("user_id", user.id);
      const result = buildMealPlan({ profile: { ...profile, macro_targets: targets }, nutritionPrefs, program, upcoming: upcoming ?? [], prompt: userExtraPrompt }, targets);
      return new Response(JSON.stringify(result), { headers: cors });
    }

    if (action === "suggest_meals") {
      const plan = buildMealPlan({ profile, nutritionPrefs, program, upcoming: upcoming ?? [], prompt: userExtraPrompt }, targets);
      const meals = plan.days?.[0]?.meals?.map((meal: any) => ({
        name: meal.slot,
        title: meal.title,
        calories: meal.calories,
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        ingredients: meal.ingredients_with_units,
        prep: meal.instructions?.join(" "),
        prep_video: meal.prep_video,
      })) ?? [];
      return new Response(JSON.stringify({ meals }), { headers: cors });
    }

    if (action === "review_day") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data: meals } = await supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", start.toISOString());
      return new Response(JSON.stringify(reviewLoggedMeals(meals ?? [], targets)), { headers: cors });
    }

    return new Response(JSON.stringify({
      meal_title: String(userExtraPrompt || "Selected meal"),
      batch_cook: "Cook the protein and carb base in 3-4 portions, then keep fresh toppings separate.",
      store: "Refrigerate up to 4 days in sealed containers; freeze cooked protein/carbs up to 2 months.",
      reheat: "Warm protein and carbs gently, then add fresh produce and fats after reheating.",
      make_ahead: "Pre-weigh portions, wash/chop produce, and stage sauces separately.",
      substitutions: ["Use pea protein for dairy-free", "Use quinoa/rice/potato for gluten-free", "Use olive oil or avocado for nut-free fats"],
      portion_scaling: "Adjust protein first, carbs second, and fats last to preserve the macro target.",
      shopping_list: ["Protein", "Training-matched carb", "Vegetables", "Healthy fat", "Seasonings"],
    }), { headers: cors });
  } catch (e) {
    console.error("nutrition-coach error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
