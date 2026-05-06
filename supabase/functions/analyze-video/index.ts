// Analyze a workout video for form. Receives base64 frames + exercise name, returns score + cues.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYS = `You are an elite strength coach analyzing exercise form from sequential video frames.

Return ONLY a JSON object:
{
  "score": 0-100,
  "summary": "1-2 sentence professional verdict",
  "good": ["positive points"],
  "fixes": ["specific corrections, ordered by priority"],
  "cues": ["3-5 short coaching cues to use next time"],
  "next_session_adjustment": "Concrete adjustment for the next workout (load/tempo/range)",
  "safety_flags": ["any injury risk concerns, empty array if none"]
}

Be specific. Reference body parts, joint angles, bar paths. No fluff.`;

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

    const { exercise, frames, storage_path } = await req.json();
    if (!Array.isArray(frames) || frames.length === 0) {
      return new Response(JSON.stringify({ error: "No frames provided" }), { status: 400, headers: cors });
    }

    // Insert pending row
    const { data: row } = await supabase.from("video_uploads").insert({
      user_id: user.id,
      exercise_name: exercise ?? null,
      storage_path: storage_path ?? "",
      status: "analyzing",
    }).select().single();

    const userContent: any[] = [
      { type: "text", text: `Exercise: ${exercise ?? "unknown"}. ${frames.length} sequential frames follow. Analyze form and return JSON.` },
      ...frames.map((b64: string) => ({
        type: "image_url",
        image_url: { url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYS },
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
