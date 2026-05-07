// Body Composition Photo Analysis: takes front/side/rear photo paths in the
// `body-photos` bucket, signs them, sends to Lovable AI with full user context,
// returns structured analysis and persists it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are a professional physique coach and sports scientist. Given 3 photos (front, side, rear) of the same person, return a thoughtful, encouraging, evidence-based body composition assessment.

Always be respectful and motivational. Never shame. Never give medical advice. Always remind that body-fat estimates from photos are approximate (±3-5%).

Tailor feedback to the user's training program, nutrition prefs, injuries, and goals. Compare to the user's previous analysis if provided.

Return JSON only matching the schema.`;

const SCHEMA = `{
  "bodyfat_estimate": number, // approximate %, single value
  "bodyfat_range": [number, number],
  "muscle_notes": "2-3 sentence muscle development summary (which areas are well-developed, which are lagging)",
  "posture_notes": "1-2 sentence posture observations from front/side/rear",
  "feedback": "3-5 sentence actionable feedback tied to their program and goals — bullet style with newlines is fine",
  "comparison": "If previous photos exist, compare progress in 2-3 sentences. Otherwise return ''.",
  "wins": ["short bullet", "short bullet"],
  "focus_next": ["short bullet", "short bullet"]
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

    const { front_path, side_path, rear_path, weight } = await req.json();
    if (!front_path || !side_path || !rear_path) {
      return new Response(JSON.stringify({ error: "All 3 photos required" }), { status: 400, headers: cors });
    }

    // Plan gate
    const { getPlanTier } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      return new Response(JSON.stringify({
        error: "limit_reached",
        code: "body_pro_only",
        message: "Body Composition Analysis is part of Pro Coach. Start your 7-day free trial to unlock detailed physique assessments and progress comparisons.",
      }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
    }

    // Sign URLs (short-lived) so Gemini can fetch them
    const sign = async (p: string) => {
      const { data, error } = await supabase.storage.from("body-photos").createSignedUrl(p, 600);
      if (error || !data?.signedUrl) throw new Error("Could not sign photo URL");
      return data.signedUrl;
    };
    const [frontUrl, sideUrl, rearUrl] = await Promise.all([sign(front_path), sign(side_path), sign(rear_path)]);

    // Fetch context
    const [{ data: profile }, { data: program }, { data: lastAnalysis }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("programs").select("name, style, current_week").eq("user_id", user.id).eq("is_active", true).maybeSingle(),
      supabase.from("body_analyses").select("bodyfat_estimate, muscle_notes, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const ctx = {
      goal: profile?.goal,
      level: profile?.level,
      injuries: profile?.injuries,
      nutrition_preferences: (profile as any)?.nutrition_preferences,
      weight_logged: weight ?? profile?.weight,
      units: profile?.units,
      program,
      previous: lastAnalysis,
    };

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
              { type: "text", text: `Analyze these 3 photos and return JSON: ${SCHEMA}\n\nUser context:\n${JSON.stringify(ctx)}\n\nPhotos:\nFront: ${frontUrl}\nSide: ${sideUrl}\nRear: ${rearUrl}` },
              { type: "image_url", image_url: { url: frontUrl } },
              { type: "image_url", image_url: { url: sideUrl } },
              { type: "image_url", image_url: { url: rearUrl } },
            ],
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: cors });
      const t = await aiResp.text(); console.error("analyze-body error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const aiJson = await aiResp.json();
    let result: any = {};
    try { result = JSON.parse(aiJson.choices?.[0]?.message?.content ?? "{}"); } catch { result = {}; }

    const { data: saved, error: saveErr } = await supabase.from("body_analyses").insert({
      user_id: user.id,
      front_path, side_path, rear_path,
      bodyfat_estimate: result.bodyfat_estimate ?? null,
      muscle_notes: result.muscle_notes ?? null,
      posture_notes: result.posture_notes ?? null,
      feedback: result.feedback ?? null,
      comparison: result.comparison ?? null,
      weight: weight ?? null,
      raw: result,
    }).select().single();
    if (saveErr) console.error("save body analysis", saveErr);

    return new Response(JSON.stringify({ analysis: result, record: saved }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("analyze-body error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
