// Auto-adjust the next workout based on a triggering event (workout_complete | video_analysis | checkin)
// Runs after every logged session/video so the program evolves in real-time.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are an elite, evidence-based strength & conditioning coach making a real-time program adjustment.

You will receive: the user's profile (goal, level, injuries, equipment), the trigger event, the most recent workout sets (weights, reps, RPE), the very next scheduled workout, and recent video form analyses.

Decide whether and HOW to adjust the next workout. Apply progressive overload (small load/rep bumps when sets were comfortable, RPE <= prescribed), maintain or back off on hard sessions (RPE >= 9 across the board), substitute exercises if injuries/equipment changed or video flagged a movement issue, and trigger a deload if the last 3 sessions show declining performance.

Return ONLY valid JSON:
{
  "should_adjust": true|false,
  "summary": "1-2 sentence plain-English explanation the user will see",
  "next_workout_exercises": [ {"name":"...", "sets": 4, "reps":"6-8", "rest_sec":150, "rpe":8, "notes":"..."} ],
  "changes": ["bullet of every change made"],
  "coach_note": "Short personal message from coach to user (warm, professional, specific)."
}

Rules: Keep total volume sane. Never exceed user's session_length. Respect injuries absolutely. Only change exercises that need changing — keep the rest. If no change needed, return should_adjust=false and skip next_workout_exercises.`;

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

    const { trigger, workout_log_id } = await req.json();

    const today = new Date().toISOString().slice(0, 10);
    const [{ data: profile }, { data: program }, { data: nextWorkout }, { data: recentLogs }, { data: recentVideos }, { data: checkin }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("programs").select("*").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("workouts").select("*").eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed").order("scheduled_date").limit(1).maybeSingle(),
      supabase.from("workout_logs").select("*, set_logs(*)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(3),
      supabase.from("video_uploads").select("exercise_name, score, analysis").eq("user_id", user.id).order("created_at", { ascending: false }).limit(2),
      supabase.from("daily_checkins").select("*").eq("user_id", user.id).order("checkin_date", { ascending: false }).limit(1).maybeSingle(),
    ]);

    if (!nextWorkout) return new Response(JSON.stringify({ should_adjust: false, summary: "No upcoming workout to adjust." }), { headers: { ...cors, "Content-Type": "application/json" } });

    const ctx = {
      trigger,
      profile,
      program: program ? { name: program.name, style: program.style, current_week: program.current_week } : null,
      next_workout: nextWorkout,
      recent_workouts: recentLogs ?? [],
      recent_videos: recentVideos ?? [],
      todays_checkin: checkin ?? null,
    };

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `Adjust the next session.\n\nCONTEXT:\n${JSON.stringify(ctx, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("auto-adjust ai error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const aiJson = await aiResp.json();
    let plan: any = {};
    try { plan = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch { plan = {}; }

    if (plan.should_adjust && Array.isArray(plan.next_workout_exercises) && plan.next_workout_exercises.length) {
      await supabase.from("workouts").update({ exercises: plan.next_workout_exercises }).eq("id", nextWorkout.id);
    }

    if (plan.summary) {
      await supabase.from("program_adjustments").insert({
        user_id: user.id,
        program_id: program?.id ?? null,
        workout_id: nextWorkout.id,
        trigger: trigger ?? "manual",
        summary: plan.summary,
        changes: plan.changes ?? [],
      });
    }

    if (plan.coach_note) {
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "assistant",
        content: `🛠 **Program updated** — ${plan.summary}\n\n${plan.coach_note}\n\n${(plan.changes ?? []).map((c: string) => `• ${c}`).join("\n")}`,
      });
    }

    return new Response(JSON.stringify(plan), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("auto-adjust error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
