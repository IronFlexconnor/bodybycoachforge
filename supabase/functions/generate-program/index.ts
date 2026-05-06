// Generate a personalized 4-12 week training program from the user's profile
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
- Match user's days_per_week, session_length, equipment, level, goal, and respect injuries.
- Provide sessions for ALL weeks (weeks * days_per_week). Be exhaustive.
- Use exercises only from the user's available equipment.
- Progressive overload week-to-week (small load/volume increases, deload at appropriate week).
- For mobility/recovery/HIIT goals, adapt structure accordingly — don't force a strength template.`;

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

    const { data: profile } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
    if (!profile) return new Response(JSON.stringify({ error: "Complete your profile first" }), { status: 400, headers: cors });

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: `Build my program. Profile:\n${JSON.stringify(profile, null, 2)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: cors });
      const t = await aiResp.text();
      console.error("gen-program ai error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const aiJson = await aiResp.json();
    const raw = aiJson.choices?.[0]?.message?.content ?? "{}";
    let plan: any;
    try { plan = JSON.parse(raw); } catch { plan = { name: "My Program", style: "Hybrid", weeks: 8, sessions: [] }; }

    // Deactivate old programs
    await supabase.from("programs").update({ is_active: false }).eq("user_id", user.id);

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

    // Persist sessions as workouts (start of program week 1, scheduled across the week from today)
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

    return new Response(JSON.stringify({ program, sessions: rows.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-program error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
