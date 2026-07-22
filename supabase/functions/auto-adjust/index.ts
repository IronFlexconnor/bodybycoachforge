// Autonomous Coach: makes positive, evidence-based adjustments to BOTH training and nutrition.
// Triggered after workouts, video analyses, check-ins, chat requests, or manually.
// Stores each adjustment as `pending` (with full diff) so the user can Approve / Tweak / Reject.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXPERT_KNOWLEDGE } from "../_shared/expert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are Coach Forge — an elite strength & conditioning coach AND certified sports nutritionist with full autonomy to make POSITIVE, evidence-based adjustments to the user's program and nutrition plan.

YOU MAY FREELY ADJUST (when it benefits the user):
TRAINING — exercises, sets, reps, weight (% or kg/lb), tempo, rest, RPE, progression speed, volume up/down, swap movements, deload timing, add sport-specific drills, rebuild a session.
NUTRITION — swap any meal/recipe (use provided recipe_library: pick by id), tweak macros, change portions, add/remove snacks, adjust daily calorie target, suggest replacement recipes that match diet/allergens.

DECISION RULES
- Apply progressive overload when last sets were comfortable (RPE ≤ prescribed). Hold or back off when RPE ≥ 9 across the board. Trigger a deload after 3 declining sessions.
- Respect injuries ABSOLUTELY: never recommend movements that aggravate them; substitute with a safer variant from exercise_library and explain why.
- Sync nutrition with training day: more carbs/cal on heavy days, more protein in build blocks, lighter on rest/deload.
- Honor every dietary restriction & allergen in profile.nutrition_preferences. NO exceptions.
- Each adjustment must be small, positive, and clearly reasoned. If nothing should change, say so.

OUTPUT — return ONLY valid JSON, no prose:
{
  "should_adjust": true|false,
  "scope": "training" | "nutrition" | "both",
  "summary": "one warm sentence the user will see (e.g. 'Your squat is moving fast — bumping load 5% and adding a high-protein recovery meal.')",
  "coach_note": "2-4 sentence personal explanation, warm + specific. Reference the data ('Last bench was 80kg×6 at RPE 7…').",
  "training": {
    "next_workout_exercises": [{"name":"...","sets":4,"reps":"6-8","rest_sec":150,"rpe":8,"notes":"..."}] | null,
    "changes": ["bullet of every training change"]
  },
  "nutrition": {
    "macro_changes": {"calories": 2400, "protein_g": 180, "carbs_g": 260, "fat_g": 75} | {},
    "meal_swaps": [{"slot":"lunch","old":"...","new_recipe_id":"<uuid from recipe_library>","new_title":"...","reason":"..."}],
    "changes": ["bullet of every nutrition change"]
  }
}

If a section has no changes, set it to null/empty arrays. Always pick recipe ids ONLY from the provided recipe_library.`;

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

    const { trigger, workout_log_id, user_request, auto_apply } = await req.json().catch(() => ({}));

    // Free tier: auto-adjust runs an LLM on every trigger, so cap it monthly.
    // Past the cap we no-op silently — the UI only reacts when should_adjust
    // is true, so free users simply see fewer automatic plan changes.
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const used = await countUsage(user.id, "auto_adjust", monthStart);
      if (used >= FREE_LIMITS.auto_adjust_per_month) {
        return new Response(JSON.stringify({ should_adjust: false, skipped: "free_tier_cap" }), {
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }
    }
    try { await logUsage(user.id, "auto_adjust"); } catch { /* non-fatal */ }

    const today = new Date().toISOString().slice(0, 10);
    const [
      { data: profile },
      { data: program },
      { data: nextWorkout },
      { data: recentLogs },
      { data: recentVideos },
      { data: checkins },
      { data: meals },
      { data: pastAdjustments },
      { data: exerciseLib },
      { data: recipeLib },
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("programs").select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("workouts").select("*").eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed").order("scheduled_date").limit(1).maybeSingle(),
      supabase.from("workout_logs").select("*, set_logs(*)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(3),
      supabase.from("video_uploads").select("exercise_name, score, cues, analysis").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2),
      supabase.from("daily_checkins").select("*").eq("user_id", user.id).order("checkin_date", { ascending: false }).limit(3),
      supabase.from("meal_logs").select("name, calories, protein_g, carbs_g, fat_g, eaten_at").eq("user_id", user.id).order("eaten_at", { ascending: false }).limit(20),
      supabase.from("program_adjustments").select("trigger, summary, scope, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(5),
      supabase.from("exercises").select("id, name, category, primary_muscles, equipment").limit(400),
      supabase.from("recipes").select("id, title, meal_type, cuisine, calories, protein_g, carbs_g, fat_g, dietary_tags, allergens").limit(300),
    ]);

    const ctx = {
      trigger,
      user_request: user_request ?? null,
      profile,
      program: program ? { id: program.id, name: program.name, style: program.style, current_week: program.current_week, weeks: program.weeks } : null,
      next_workout: nextWorkout,
      recent_workouts: recentLogs ?? [],
      recent_videos: recentVideos ?? [],
      recent_checkins: checkins ?? [],
      recent_meals: meals ?? [],
      past_adjustments: pastAdjustments ?? [],
      exercise_library: exerciseLib ?? [],
      recipe_library: recipeLib ?? [],
    };

    let plan: any = null;
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${SYS}\n\n${EXPERT_KNOWLEDGE}` },
            { role: "user", content: `Make the best positive adjustment(s) right now.\n\nCONTEXT:\n${JSON.stringify(ctx).slice(0, 60000)}` },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (aiResp.ok) {
        const aiJson = await aiResp.json();
        try { plan = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch { plan = null; }
      } else {
        console.warn("auto-adjust ai non-ok", aiResp.status);
      }
    } catch (err) {
      console.warn("auto-adjust ai threw", err);
    }

    // Deterministic fallback so "Tune Now" always returns a useful tweak
    if (!plan || typeof plan !== "object" || !("should_adjust" in plan)) {
      plan = buildFallbackAdjustment(ctx);
    }

    if (!plan.should_adjust) {
      return new Response(JSON.stringify({ should_adjust: false, summary: plan.summary || "Plan is on track — no changes needed." }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const training = plan.training ?? {};
    const nutrition = plan.nutrition ?? {};
    const trainingChanges: string[] = Array.isArray(training.changes) ? training.changes : [];
    const nutritionChanges: string[] = Array.isArray(nutrition.changes) ? nutrition.changes : [];
    const allChanges = [...trainingChanges, ...nutritionChanges];

    // Snapshot previous state so user can Undo
    const previous_state = {
      workout_exercises: nextWorkout?.exercises ?? null,
      workout_id: nextWorkout?.id ?? null,
      macro_targets: profile?.macro_targets ?? null,
    };

    const { data: adjustment } = await supabase.from("program_adjustments").insert({
      user_id: user.id,
      program_id: program?.id ?? null,
      workout_id: nextWorkout?.id ?? null,
      trigger: trigger ?? "manual",
      scope: plan.scope || "training",
      status: auto_apply ? "approved" : "pending",
      summary: plan.summary || "Plan tuned.",
      coach_note: plan.coach_note || null,
      changes: allChanges,
      meal_changes: nutrition.meal_swaps ?? [],
      macro_changes: nutrition.macro_changes ?? {},
      previous_state,
    }).select().single();

    // If auto-apply, apply immediately to training + nutrition
    if (auto_apply && adjustment) {
      if (Array.isArray(training.next_workout_exercises) && training.next_workout_exercises.length && nextWorkout?.id) {
        await supabase.from("workouts").update({ exercises: training.next_workout_exercises }).eq("id", nextWorkout.id);
      }
      if (nutrition.macro_changes && Object.keys(nutrition.macro_changes).length && profile) {
        await supabase.from("profiles").update({ macro_targets: { ...(profile.macro_targets ?? {}), ...nutrition.macro_changes } }).eq("user_id", user.id);
      }
    }

    // Send to chat as a coach update
    if (plan.summary) {
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: `✨ **Plan upgrade ready** — ${plan.summary}\n\n${plan.coach_note ?? ""}\n\n${allChanges.map((c) => `• ${c}`).join("\n")}\n\n_Open the dashboard to Approve, Tweak, or Reject._`,
      });
    }

    return new Response(JSON.stringify({ ...plan, adjustment_id: adjustment?.id }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auto-adjust error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});

function buildFallbackAdjustment(ctx: any) {
  const profile = ctx.profile ?? {};
  const goal = (profile.goal ?? "").toString().toLowerCase();
  const next = ctx.next_workout;
  const exercises = Array.isArray(next?.exercises) ? next.exercises : [];
  const recentLog = (ctx.recent_workouts ?? [])[0];
  const setLogs: any[] = recentLog?.set_logs ?? [];
  const avgRpe = setLogs.length ? setLogs.reduce((a, s) => a + (s.rpe ?? 7), 0) / setLogs.length : 7;
  const macros = profile.macro_targets ?? {};
  const cals = Number(macros.calories ?? 2200);
  const protein = Number(macros.protein_g ?? 150);

  const bumpUp = avgRpe < 8;
  const tunedExercises = exercises.map((e: any, i: number) => {
    const sets = Math.min(5, (e.sets ?? 3) + (bumpUp && i < 2 ? 1 : 0));
    return {
      ...e,
      sets,
      rpe: bumpUp ? Math.min(9, (e.rpe ?? 7) + 1) : Math.max(6, (e.rpe ?? 8) - 1),
      notes: bumpUp
        ? `Bumping intensity — last session felt strong (RPE ${avgRpe.toFixed(1)}). Add 2.5–5% load.`
        : `Backing off slightly to bank recovery — quality over grind.`,
    };
  });

  const trainingChanges = bumpUp
    ? [
        `Added a top set to your first 1–2 lifts`,
        `Nudged target RPE up by 1 — last session averaged RPE ${avgRpe.toFixed(1)}`,
        `Add 2.5–5% load where the bar still moves fast`,
      ]
    : [
        `Pulled volume back ~10% on main lifts`,
        `Lowered target RPE by 1 to prioritize recovery`,
        `Keep technique crisp — we'll re-load next week`,
      ];

  const macroDelta = bumpUp ? { calories: cals + 150, protein_g: protein + 10 } : { calories: cals - 100 };
  const nutritionChanges = bumpUp
    ? [`+150 kcal on training days for recovery`, `+10g protein to support the added volume`]
    : [`-100 kcal on rest days to match lower output`, `Keep protein steady to protect lean mass`];

  const focus = goal.includes("glute") ? "glute volume" : goal.includes("strength") ? "top-set strength" : goal.includes("fat") ? "calorie precision" : "progressive overload";

  return {
    should_adjust: true,
    scope: "both",
    summary: bumpUp
      ? `Last session felt strong — pushing ${focus} up a notch and adding fuel.`
      : `Pulling back slightly to lock in recovery and keep momentum.`,
    coach_note: bumpUp
      ? `You averaged RPE ${avgRpe.toFixed(1)} last session — that's room to grow. I added a top set, nudged load, and bumped calories on training days so you actually recover from it.`
      : `Three hard sessions stacked up. A small back-off week now means a bigger jump next week. Trust the process.`,
    training: { next_workout_exercises: tunedExercises.length ? tunedExercises : null, changes: trainingChanges },
    nutrition: { macro_changes: macroDelta, meal_swaps: [], changes: nutritionChanges },
  };
}
