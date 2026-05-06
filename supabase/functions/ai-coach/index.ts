// AI Coach: streaming chat with full user context (profile, program, recent workouts, video analyses)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Coach Forge — an elite, certified personal trainer and nutritionist with 20 years of experience coaching everyone from beginners to elite athletes. You are the user's full-time AI coach.

YOUR JOB
- Be warm, direct, motivating, and accountable. Talk like a real coach who knows the user.
- Use the user's profile, current program, recent workouts, and prior conversations to give *specific*, personalized advice. Never generic.
- Adjust the program when fatigue, injuries, missed sessions, or new goals warrant it. Suggest concrete numbers (sets, reps, %1RM, RPE).
- Cover training, nutrition (macros, meal ideas), recovery, sleep, mobility, mindset, and accountability.
- Be concise. Use markdown sparingly (short bold cues, lists when truly helpful).
- Never give medical advice — refer to a doctor if asked about pain, medications, or medical conditions.
- If the user says they're tired/sick/injured, prioritize recovery — adjust today's session, don't push.

When the user uploads a workout video and an analysis is provided in context, reference it in your reply: praise what was good, give 1-2 priority cues, and tell them what to focus on next session.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { message, attachments } = await req.json();
    if (!message?.trim()) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400, headers: cors });

    // Persist user message
    await supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: message, attachments: attachments ?? null });

    // Gather long-term context
    const [{ data: profile }, { data: programs }, { data: recentLogs }, { data: recentVideos }, { data: history }, { data: checkins }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("programs").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("workout_logs").select("*, set_logs(*)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(5),
      supabase.from("video_uploads").select("exercise_name, score, cues, analysis, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("daily_checkins").select("*").eq("user_id", user.id).order("checkin_date", { ascending: false }).limit(3),
    ]);

    const ctx = {
      profile: profile ?? null,
      activeProgram: programs?.[0] ?? null,
      recentWorkouts: recentLogs ?? [],
      recentVideoAnalyses: recentVideos ?? [],
      recentCheckins: checkins ?? [],
    };

    const ctxBlock = `## USER CONTEXT (use this to personalize)\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;

    const priorMessages = (history ?? []).reverse().slice(0, -1); // exclude the just-inserted user msg

    const messages = [
      { role: "system", content: `${SYSTEM}\n\n${ctxBlock}` },
      ...priorMessages.map((m: { role: string; content: string }) => ({ role: m.role, content: m.content })),
      { role: "user", content: message },
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "google/gemini-2.5-flash", messages, stream: true }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded — try again in a moment." }), { status: 429, headers: cors });
      if (aiResp.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), { status: 402, headers: cors });
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), { status: 500, headers: cors });
    }

    // Tee stream: forward to client AND collect to persist final assistant message
    const reader = aiResp.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullText = "";
    let buf = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            controller.enqueue(value);
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) !== -1) {
              let line = buf.slice(0, nl);
              buf = buf.slice(nl + 1);
              if (line.endsWith("\r")) line = line.slice(0, -1);
              if (!line.startsWith("data: ")) continue;
              const json = line.slice(6).trim();
              if (json === "[DONE]") continue;
              try {
                const parsed = JSON.parse(json);
                const c = parsed.choices?.[0]?.delta?.content;
                if (c) fullText += c;
              } catch { /* partial */ }
            }
          }
        } finally {
          controller.close();
          if (fullText.trim()) {
            await supabase.from("chat_messages").insert({ user_id: user.id, role: "assistant", content: fullText });
          }
        }
      },
    });

    return new Response(stream, { headers: { ...cors, "Content-Type": "text/event-stream" } });
  } catch (e) {
    console.error("ai-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
