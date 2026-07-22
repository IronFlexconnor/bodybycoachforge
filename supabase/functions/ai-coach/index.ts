// AI Coach: streaming chat with full user context (profile, program, recent workouts, video analyses)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXPERT_KNOWLEDGE } from "../_shared/expert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Coach Forge — a certified, elite personal trainer and sports nutritionist with two decades coaching beginners to pro athletes. You're the user's full-time coach who genuinely knows them.

VOICE — non-negotiable
- Warm, direct, evidence-based. Encouraging but professional. Never robotic, never preachy, never corporate.
- Talk like a real coach in the gym: short sentences, concrete numbers, occasional dry humor. Use the user's name when natural.
- No emojis spam. Markdown only when it actually helps (a bold cue, a tight bullet list). Never wall-of-text.
- Default to 3-6 sentences unless the question genuinely needs more.

WHAT YOU DO
- Personalize EVERYTHING from the user context (profile, active program, last 5 sessions, video analyses, check-ins, recent meals). Cite specific numbers from their logs ("Last bench you hit 80kg×6 at RPE 8").
- Coach the full athlete: training (sets/reps/%1RM/RPE), nutrition (macros, meal ideas matching their diet), recovery, sleep, mobility, mindset, accountability.
- If the user uploaded a video and analysis is in context: praise one specific thing they did well, give 1-2 priority cues, and tell them exactly what to focus on next session.
- If the user is tired, sore, sick, or injured — prioritize recovery. Modify or skip, don't push. Mention that the program will auto-adjust.
- Hold the user accountable kindly when they miss sessions or under-eat protein. Always offer the next concrete step.
- YOU CAN CHANGE THEIR PLAN. When the user reports pain, fatigue, travel, a dislike, a new goal, or asks for their program or meals to change, the app automatically drafts the concrete adjustment right after your reply. Tell them naturally: "I'm updating your plan now — you'll see the change on your Home screen to approve in a moment." Never say you can't modify their plan.

INJURY-AWARE COACHING (CRITICAL)
- The user's profile.injuries lists current/past injuries and limitations. Treat this as the highest-priority constraint on every recommendation.
- When suggesting any exercise, working weight, or modification, check it against the listed injuries. If a movement commonly aggravates one of them, swap it for a safer alternative and briefly explain why.
- If the user says something like "my shoulder is acting up" or "my back is tight today", instantly adjust today's session: regress load, swap to joint-friendly variants, add targeted mobility, or recommend an active-recovery day. Tell them exactly what to do.
- For "progressing" injuries, push slow, structured loading and stop short of pain. Encourage them, don't downplay.

EXERCISE LIBRARY
- The user's app has a built-in exercise library (in context as exerciseLibrary). When recommending movements, prefer exercises from this list so the user can tap to see a demo video. Mention them by exact name.
- If a user asks "how do I do X" and X is in the library, point them to the Library tab for the demo video.

NUTRITION COACHING (CRITICAL — PERSONALIZED + ALLERGY-SAFE)
- profile.nutrition_preferences contains diets, allergies, allergiesNotes, calorieMode, calorieGoal, mealsPerDay, mealTiming. STRICTLY avoid every listed allergen and respect every dietary restriction in EVERY meal/recipe you suggest. No exceptions.
- Sync nutrition with the user's training schedule: higher carbs and slightly higher calories on heavy lifting / high-volume days, higher protein during muscle-building blocks, lighter recovery-focused meals on rest or deload days.
- When the user asks for meals, recipes, or a meal plan: include macros, ingredients (in their preferred unit), step-by-step cooking, AND a brief meal-prep guide (batch cooking, storage, reheating, make-ahead, allergy substitutions, portion scaling).
- If they say "I'm allergic to X — redo my plan" or "give me high-protein meals for my push-pull-legs program", instantly regenerate the plan with the new constraint and tell them what changed.
- For full week plans or detailed meal-prep libraries, point them to the Nutrition tab where the full planner generates structured plans with shopping lists.

NEVER
- Never give medical advice. Pain, meds, conditions → refer to a physician/PT.
- Never recommend movements that commonly aggravate the user's listed injuries.
- Never invent data. If something isn't in context, say so and ask.
- Never apologize excessively or hedge with "as an AI". You're a coach.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const serverReceivedAt = Date.now();
  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: cors });

    const { message, attachments } = await req.json();
    if (!message?.trim()) return new Response(JSON.stringify({ error: "Empty message" }), { status: 400, headers: cors });

    // --- Plan & free-tier limits ---
    // NOTE: usage is logged only AFTER the AI gateway accepts the request, so
    // a gateway error never burns one of a free user's daily messages.
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const used = await countUsage(user.id, "chat", since);
      if (used >= FREE_LIMITS.chat_per_day) {
        return new Response(JSON.stringify({
          error: "limit_reached",
          code: "chat_daily_limit",
          message: `You've used your ${FREE_LIMITS.chat_per_day} free coach messages today. Upgrade to Pro Coach for unlimited coaching — start a 7-day free trial.`,
        }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }

    // Persist user message
    await supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: message, attachments: attachments ?? null });

    // Gather long-term context
    const { loadMemory, updateMemory } = await import("../_shared/memory.ts");
    const sinceToday = new Date(); sinceToday.setHours(0, 0, 0, 0);
    const [{ data: profile }, { data: programs }, { data: recentLogs }, { data: recentVideos }, { data: history }, { data: checkins }, { data: meals }, { data: adjustments }, { data: exercises }, memory] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("programs").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1),
      supabase.from("workout_logs").select("*, set_logs(*)").eq("user_id", user.id).order("started_at", { ascending: false }).limit(5),
      supabase.from("video_uploads").select("exercise_name, score, cues, analysis, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      supabase.from("chat_messages").select("role, content").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
      supabase.from("daily_checkins").select("*").eq("user_id", user.id).order("checkin_date", { ascending: false }).limit(3),
      supabase.from("meal_logs").select("name, calories, protein_g, carbs_g, fat_g, eaten_at").eq("user_id", user.id).gte("eaten_at", sinceToday.toISOString()),
      supabase.from("program_adjustments").select("trigger, summary, created_at").eq("user_id", user.id).order("created_at", { ascending: false }).limit(3),
      // Slim columns only — this list rides along on EVERY message, so no video URLs/etc.
      supabase.from("exercises").select("name, category, equipment"),
      loadMemory(user.id),
    ]);

    const ctx = {
      profile: profile ?? null,
      activeProgram: programs?.[0] ?? null,
      recentWorkouts: recentLogs ?? [],
      recentVideoAnalyses: recentVideos ?? [],
      recentCheckins: checkins ?? [],
      mealsToday: meals ?? [],
      recentProgramAdjustments: adjustments ?? [],
      exerciseLibrary: exercises ?? [],
    };

    const memoryBlock = memory
      ? `## LONG-TERM MEMORY (durable facts you know about this user from all past conversations — trust and use these)\n${memory}`
      : "";
    const ctxBlock = `## USER CONTEXT (use this to personalize)\n\`\`\`json\n${JSON.stringify(ctx, null, 2)}\n\`\`\``;

    const priorMessages = (history ?? []).reverse().slice(0, -1); // exclude the just-inserted user msg

    const messages = [
      { role: "system", content: `${SYSTEM}\n\n${EXPERT_KNOWLEDGE}\n\n${memoryBlock}\n\n${ctxBlock}` },
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

    // The AI accepted the request — now it's fair to count the free message.
    if (tier === "free") await logUsage(user.id, "chat");

    // Tee stream: forward to client AND collect to persist final assistant message.
    // Also inject `data: {"type":"timing",...}` SSE events so the client can
    // reconcile server-side processing time with client-perceived first-token latency.
    const reader = aiResp.body!.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let fullText = "";
    let buf = "";
    let firstTokenSent = false;

    const stream = new ReadableStream({
      async start(controller) {
        // Emit server_received_at immediately so client knows when handler started
        controller.enqueue(encoder.encode(
          `data: ${JSON.stringify({ type: "timing", server_received_at: serverReceivedAt, server_ready_at: Date.now() })}\n\n`,
        ));
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            let firstContentInChunk = false;
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
                if (c) {
                  fullText += c;
                  if (!firstTokenSent) firstContentInChunk = true;
                }
              } catch { /* partial */ }
            }
            // If this chunk carries the first content delta, emit a timing
            // marker BEFORE forwarding the chunk so the client sees it first.
            if (firstContentInChunk && !firstTokenSent) {
              controller.enqueue(encoder.encode(
                `data: ${JSON.stringify({ type: "timing", server_first_token_at: Date.now() })}\n\n`,
              ));
              firstTokenSent = true;
            }
            controller.enqueue(value);
          }
        } finally {
          controller.close();
          if (fullText.trim()) {
            await supabase.from("chat_messages").insert({ user_id: user.id, role: "assistant", content: fullText });
            // Background work — never blocks the reply:
            // 1) refresh long-term memory  2) draft a plan adjustment if the
            // user said something that warrants one (pain, fatigue, requests).
            const { maybeTriggerAdjustment } = await import("../_shared/chat-actions.ts");
            const bgTask = Promise.allSettled([
              updateMemory(user.id, apiKey, message, fullText),
              maybeTriggerAdjustment({
                apiKey,
                authHeader,
                supabaseUrl: Deno.env.get("SUPABASE_URL")!,
                userMsg: message,
                assistantMsg: fullText,
              }),
            ]);
            // deno-lint-ignore no-explicit-any
            const rt: any = globalThis as any;
            if (typeof rt.EdgeRuntime?.waitUntil === "function") rt.EdgeRuntime.waitUntil(bgTask);
            else await bgTask;
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        ...cors,
        "Content-Type": "text/event-stream",
        "x-server-received-at": String(serverReceivedAt),
        "Access-Control-Expose-Headers": "x-server-received-at",
      },
    });
  } catch (e) {
    console.error("ai-coach error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 500, headers: cors });
  }
});
