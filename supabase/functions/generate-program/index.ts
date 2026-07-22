// Generate a personalized 4-12 week training program from the user's profile
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXPERT_KNOWLEDGE } from "../_shared/expert.ts";
import { buildTemplateProgram, summarizeChanges } from "./templates.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are an elite strength & conditioning coach. Design a complete, progressive training program tailored to the user.

Return ONLY a JSON object that EXACTLY matches this schema, no prose:
{
  "name": "Catchy program name",
  "style": "Hypertrophy | Strength | HIIT | Mobility | Sport-specific | Hybrid | etc.",
  "weeks": 4-12,
  "summary": "1-2 sentence overview",
  "weekly_split": ["Mon: Upper Push", "Tue: Lower Power", ...],
  "sessions": [
    {
      "week": 1,
      "day": 1,
      "title": "Upper Push",
      "focus": "Chest, shoulders, triceps",
      "duration_min": 45,
      "exercises": [
        { "name": "Barbell Bench Press", "sets": 4, "reps": "6-8", "rest_sec": 150, "rpe": 8, "notes": "Pause at chest" }
      ]
    }
  ],
  "progression_notes": "How load/volume increases week over week",
  "deload_week": 4
}

RULES:
- Match user's days_per_week, session_length, equipment, level, goal.
- INJURY HANDLING (NON-NEGOTIABLE): Read profile.injuries carefully. You are an expert at building programs that work AROUND injuries and progress them safely.
  • Modify or swap any movement that commonly aggravates the listed injuries (e.g. shoulder issues → swap barbell bench for dumbbell floor press or landmine press; lower back → no conventional deadlift, use trap bar or hip hinge regressions; knee pain → reduce ROM, avoid deep loaded knee flexion, prefer split squats over heavy back squat).
  • Provide scaled / alternative movements as the primary prescription — do NOT just add a note.
  • Include a 5–10 min warm-up + targeted mobility addressing the listed injuries each session.
  • For "progressing" injuries, include a gradual loading plan (start at low intensity, slow weekly progression, deload more often).
  • NEVER recommend movements that commonly aggravate the listed injuries. If unsure, pick the safer alternative.
  • Mention the injury accommodation explicitly in exercise notes (e.g. "Floor press to protect shoulder ROM").
- Use exercises only from the user's available equipment.
- Use the user's chosen weight unit (profile.units: "imperial" → lbs, "metric" → kg) for all weight prescriptions and notes. Never mix units.
- Provide sessions for ALL weeks (weeks * days_per_week).
- Progressive overload week-to-week with appropriate deload.
- For mobility/recovery/HIIT goals, adapt structure accordingly.`;

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

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Complete your profile first" }), { status: 400, headers: cors });

    // Free tier: cap full program rebuilds (each one is an LLM call).
    // The first-ever build (onboarding) always fits inside the cap.
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const monthStart = new Date();
      monthStart.setDate(1);
      monthStart.setHours(0, 0, 0, 0);
      const used = await countUsage(user.id, "program_build", monthStart);
      if (used >= FREE_LIMITS.program_builds_per_month) {
        return new Response(
          JSON.stringify({
            error: "limit_reached",
            code: "program_monthly_limit",
            message: `You've used your ${FREE_LIMITS.program_builds_per_month} free program rebuilds this month. Upgrade to Pro Coach for unlimited program changes — start a 7-day free trial.`,
          }),
          { headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
    }

    let body: any = {};
    try { body = await req.json(); } catch {}
    const goalOverride: string | undefined = body?.goal_override;
    const goalLabel: string | undefined = body?.goal_label;
    const effectiveGoal = goalOverride || profile.goal;

    const userMsg = `Build my program. Profile:\n${JSON.stringify({ ...profile, goal: goalLabel ?? profile.goal }, null, 2)}\n\nPRIMARY GOAL FOCUS (build the entire program around this — include dedicated specialty days where appropriate, e.g. a true Glute Day for glute growth):\n${effectiveGoal}`;

    let plan: any = null;
    try {
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: `${SYS}\n\n${EXPERT_KNOWLEDGE}` },
            { role: "user", content: userMsg },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (aiResp.ok) {
        const aiJson = await aiResp.json();
        const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
        try { plan = JSON.parse(raw); } catch { plan = null; }
      } else {
        console.warn("gen-program ai non-ok", aiResp.status);
      }
    } catch (err) {
      console.warn("gen-program ai threw", err);
    }

    // Fallback / safety net: ensure we always return a goal-specific program
    if (!plan || !Array.isArray(plan.sessions) || plan.sessions.length === 0) {
      plan = buildTemplateProgram({
        goalLabel: goalLabel ?? profile.goal,
        goalPrompt: effectiveGoal,
        daysPerWeek: profile.days_per_week ?? 4,
        weeks: 8,
      });
    }

    // Deactivate old programs and clear future scheduled workouts so the new
    // goal's exercises immediately replace the old ones in every screen.
    await supabase.from("programs").update({ is_active: false }).eq("user_id", user.id);
    const todayIso = new Date().toISOString().slice(0, 10);
    await supabase.from("workouts").delete()
      .eq("user_id", user.id).eq("status", "scheduled").gte("scheduled_date", todayIso);

    const { data: program, error: progErr } = await supabase.from("programs").insert({
      user_id: user.id,
      name: plan.name ?? "My Program",
      style: plan.style ?? "Hybrid",
      weeks: plan.weeks ?? 8,
      current_week: 1,
      structure: plan,
      notes: plan.summary ?? null,
      is_active: true,
    }).select().single();
    if (progErr) throw progErr;

    const today = new Date();
    const sessions = Array.isArray(plan.sessions) ? plan.sessions : [];
    const rows = sessions.map((s: any) => {
      const d = new Date(today);
      const offset = ((s.week ?? 1) - 1) * 7 + ((s.day ?? 1) - 1);
      d.setDate(d.getDate() + offset);
      return {
        user_id: user.id,
        program_id: program.id,
        week: s.week ?? 1,
        day: s.day ?? 1,
        title: s.title ?? "Session",
        focus: s.focus ?? null,
        exercises: s.exercises ?? [],
        scheduled_date: d.toISOString().slice(0, 10),
        status: "scheduled",
      };
    });
    if (rows.length) await supabase.from("workouts").insert(rows);

    await supabase.from("profiles").update({ onboarded: true }).eq("user_id", user.id);

    // Count this build against the free-tier monthly cap
    try { await logUsage(user.id, "program_build"); } catch { /* non-fatal */ }

    const summary = summarizeChanges(plan);
    return new Response(JSON.stringify({ program, sessions: rows.length, summary }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-program error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
