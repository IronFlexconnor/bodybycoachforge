// Analyze a workout video/photo for form. Receives base64 frames + exercise name.
// Returns score + cues, tied to user's injuries and preferred units.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const buildSys = (injuries: string | null, units: "imperial" | "metric") => {
  const wu = units === "imperial" ? "lbs" : "kg";
  return `You are an elite strength & conditioning coach analyzing exercise form from sequential video frames or a single static photo.

User context:
- Reported injuries / limitations: ${injuries?.trim() ? injuries : "none reported"}
- Preferred weight unit: ${wu} (use this in any weight suggestion)

Return ONLY a JSON object with this exact shape:
{
  "score": 0-100,
  "summary": "1-2 sentence professional verdict",
  "good": ["positive points (max 3)"],
  "fixes": ["3-4 specific corrections, ordered by priority — actionable, reference body parts/joint angles/bar paths"],
  "cues": ["3-4 short coaching cues (3-6 words each)"],
  "next_session_adjustment": "One concrete change for the next set: 'Drop load 10 ${wu}', 'Add 1 rep', 'Slow eccentric to 3s', etc.",
  "weight_delta": { "value": number, "unit": "${wu}", "direction": "increase" | "decrease" | "hold" },
  "safety_flags": ["concerns tied to reported injuries — empty array if none"],
  "alternative_exercise": "If form/injury risk is high, suggest a safer variation; else null"
}

Be specific, professional, no fluff. If the input is a single still image, judge the position only.`;
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

    const { exercise, frames, storage_path, media_type } = await req.json();
    if (!Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "No frames provided" }), { status: 400, headers: cors });
    }

    // Fetch user profile for injury-aware analysis + units
    const { data: profile } = await supabase
      .from("profiles")
      .select("injuries, units")
      .eq("user_id", user.id)
      .maybeSingle();
    const injuries = (profile?.injuries as string | null) ?? null;
    const units = ((profile?.units as string) === "metric" ? "metric" : "imperial") as "imperial" | "metric";

    // --- Plan limits ---
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const used = await countUsage(user.id, "video", since);
      if (used >= FREE_LIMITS.video_per_month) {
        return new Response(JSON.stringify({
          error: "limit_reached",
          code: "video_monthly_limit",
          message: `You've used your ${FREE_LIMITS.video_per_month} free form analyses this month. Upgrade for unlimited form checks.`,
        }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }
    await logUsage(user.id, "video");

    // Insert pending row
    const { data: row } = await supabase.from("video_uploads").insert({
      user_id: user.id,
      exercise_name: exercise ?? null,
      storage_path: storage_path ?? "",
      status: "analyzing",
    }).select().single();

    const isPhoto = media_type === "photo" || frames.length === 1;
    const userContent: any[] = [
      { type: "text", text: `Exercise: ${exercise ?? "unknown movement"}. ${isPhoto ? "A single still photo" : `${frames.length} sequential video frames`} follow. Analyze form and return JSON only.` },
      ...frames.map((b64: string) => ({
        type: "image_url",
        image_url: { url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        // Fastest multimodal model on the gateway
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: buildSys(injuries, units) },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit — try again shortly." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted." }), { status: 402, headers: cors });
      const t = await aiResp.text();
      console.error("analyze-video ai error", aiResp.status, t);
      if (row) await supabase.from("video_uploads").update({ status: "failed" }).eq("id", row.id);
      return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: cors });
    }

    const data = await aiResp.json();
    let analysis: any = {};
    try { analysis = JSON.parse(data.choices?.[0]?.message?.content ?? "{}"); } catch { analysis = {}; }

    if (row) {
      await supabase.from("video_uploads").update({
        status: "complete",
        analysis,
        score: analysis.score ?? null,
        cues: analysis.cues ?? null,
        analyzed_at: new Date().toISOString(),
      }).eq("id", row.id);
    }

    return new Response(JSON.stringify({ id: row?.id, analysis }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
