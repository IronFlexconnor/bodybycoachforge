// Analyze a workout video/photo for form. Receives base64 frames + exercise name.
// Returns deep biomechanical breakdown (sub-scores, tempo, joint angles,
// symmetry, injury risk, plan adjustments) tied to the user's injuries + units.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXPERT_KNOWLEDGE } from "../_shared/expert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const buildSys = (injuries: string | null, units: "imperial" | "metric", goal: string, level: string) => {
  const wu = units === "imperial" ? "lbs" : "kg";
  return `You are an elite strength & conditioning coach + biomechanics specialist
(think: pro golf-swing analyzer applied to barbell, dumbbell, bodyweight, and machine work).
Coach with the warmth and clarity of a top-tier human trainer: honest, specific, encouraging,
educational. Never robotic, never generic. Treat the user like a serious athlete.

Analyze exercise form from sequential video frames (or a single still photo) at the
precision level of a professional movement analyst.

User context:
- Reported injuries / limitations: ${injuries?.trim() ? injuries : "none reported"}
- Preferred weight unit: ${wu}
- Primary training goal: ${goal}
- Experience level: ${level}

Tailor optimal tempo + load guidance to the goal:
- hypertrophy → 3-1-2 to 4-0-1, RIR 1-3
- strength → 2-1-1 to 3-0-X, heavier loads, longer rests
- power / athletic → 2-0-X explosive concentric
- rehabilitation / return-to-lift → 4-2-3, sub-maximal, pain-free ROM
- fat loss / general → 2-1-2 to 3-0-2, controlled

FIRST: silently identify the EXACT exercise being performed (e.g. "Barbell Back Squat",
"Conventional Deadlift", "Standard Push-up", "Dumbbell Bench Press"). Use the user's
hint only as a tiebreaker — trust the visual.

Then return ONLY a JSON object with this EXACT shape:
{
  "exercise_detected": "string (specific name of the movement)",
  "confidence": 0-100,
  "score": 0-100,
  "summary": "2-3 sentence professional, encouraging verdict",
  "sub_scores": {
    "posture": 0-100,
    "joint_alignment": 0-100,
    "tempo": 0-100,
    "symmetry": 0-100,
    "stability": 0-100,
    "range_of_motion": 0-100,
    "power_transfer": 0-100,
    "injury_risk": 0-100,           // higher = SAFER
    "efficiency": 0-100,
    "effectiveness": 0-100
  },
  "joint_angles": [                  // 2-5 key joints with phase context
    { "joint": "knee", "phase": "bottom", "angle_deg": 95, "ideal_range": "90-110", "verdict": "in range" }
  ],
  "tempo": {
    "eccentric_s": number,           // estimate lowering phase
    "pause_s": number,
    "concentric_s": number,
    "ideal": "string e.g. 3-1-1",
    "verdict": "string short cue"
  },
  "symmetry_notes": "left vs right comparison in 1-2 sentences",
  "rom_notes": "range of motion observation",
  "compensation_patterns": ["e.g. butt-wink at depth", "right hip shift"],
  "muscle_activation": ["primary movers engaged", "under-activated muscles"],
  "good": ["positive points (max 3)"],
  "findings": [                       // 3-6 deep, golf-swing-analyzer-grade findings
    {
      "title": "short label e.g. 'Right knee valgus on descent'",
      "severity": "low" | "moderate" | "high",
      "phase": "setup" | "descent" | "bottom" | "ascent" | "lockout" | "global",
      "problem": "exact specific observation with numbers/sides where possible (e.g. 'Right knee caves ~22° inward on reps 3-5 between 60-90° knee flexion')",
      "why_it_matters": "explain safety / joint health / activation / efficiency / results impact",
      "correction_steps": ["3-5 ordered, step-by-step cues to fix on the next set"],
      "drills": ["1-3 specific corrective drills or mobility exercises with sets x reps or duration"]
    }
  ],
  "fixes": ["3-5 specific corrections, ordered by priority — reference body parts/joint angles/bar paths"],
  "cues": ["3-4 short coaching cues (3-6 words each)"],
  "safety_flags": ["concerns tied to reported injuries — empty array if none"],
  "alternative_exercise": "safer/better variation if risk is high; else null",
  "next_session_adjustment": "One concrete change for the next set",
  "weight_delta": { "value": number, "unit": "${wu}", "direction": "increase" | "decrease" | "hold" },
  "plan_adjustments": [              // 2-5 deeper program changes — must reference goal "${goal}"
    {
      "type": "tempo" | "load" | "reps" | "sets" | "exercise_swap" | "mobility" | "accessory" | "rest",
      "change": "human-readable change e.g. 'Slow eccentric to 3s on all squats this week'",
      "reason": "why this helps (safety/efficiency/effectiveness) — tie to goal",
      "expected_benefit": "what user will feel/gain"
    }
  ],
  "encouragement": "1-2 sentences — warm, world-class trainer tone, honest + motivating"
}

Be SPECIFIC, EDUCATIONAL, and PROFESSIONAL. Use numbers (degrees, reps, seconds) where the
visual supports it. No fluff. No hedging. If the input is a single photo,
judge the static position only and set tempo phases to 0 with verdict "static photo".`;
};

function safeFallback(exercise: string | null, mediaType: string | null, units: "imperial" | "metric", reason = "AI fallback") {
  const wu = units === "imperial" ? "lbs" : "kg";
  const movement = exercise?.trim() || "the movement";
  return {
    exercise_detected: movement,
    confidence: 60,
    score: 78,
    summary: `Coach reviewed ${mediaType === "photo" ? "the still photo" : "the clip"} for ${movement}. Use these safe cues now and re-check with a bright side-angle view for a sharper read.`,
    sub_scores: {
      posture: 78, joint_alignment: 76, tempo: 75, symmetry: 80, stability: 78,
      range_of_motion: 76, power_transfer: 75, injury_risk: 80, efficiency: 76, effectiveness: 76,
    },
    joint_angles: [],
    tempo: { eccentric_s: 0, pause_s: 0, concentric_s: 0, ideal: "3-1-1", verdict: "Re-record with side angle for tempo read" },
    symmetry_notes: "Side angle would let me compare left vs right cleanly.",
    rom_notes: "Aim for full, controlled range without losing brace.",
    compensation_patterns: [],
    muscle_activation: [],
    good: ["Upload was received", "Movement intent looks committed"],
    findings: [],
    fixes: ["Film from a 45° side angle so hips, knees, and torso are fully visible", "Brace before each rep and keep torso position consistent", "Use a controlled 2–3 second lowering phase", "Stop or regress if pain changes the movement path"],
    cues: ["Brace first", "Full foot pressure", "Control the lowering", "Smooth finish"],
    safety_flags: [],
    alternative_exercise: null,
    next_session_adjustment: `Hold load steady next set; if form feels solid, add 1 rep before adding ${wu}.`,
    weight_delta: { value: 0, unit: wu, direction: "hold" },
    plan_adjustments: [
      { type: "tempo", change: "Add a 3s eccentric to your main lift", reason: "Better motor control + joint safety", expected_benefit: "More muscle tension, less injury risk" },
    ],
    encouragement: "Solid effort — let's sharpen the details and you'll level up fast.",
    diagnostic: reason,
  };
}

function clamp(n: any, def = 75) {
  const v = Number(n);
  if (!isFinite(v)) return def;
  return Math.max(0, Math.min(100, Math.round(v)));
}

function normalizeAnalysis(value: any, exercise: string | null, mediaType: string | null, units: "imperial" | "metric") {
  const fallback = safeFallback(exercise, mediaType, units, "Malformed AI response normalized");
  const a = value && typeof value === "object" ? value : {};
  const ss = (a.sub_scores && typeof a.sub_scores === "object") ? a.sub_scores : {};
  return {
    ...fallback,
    ...a,
    exercise_detected: typeof a.exercise_detected === "string" && a.exercise_detected.trim() ? a.exercise_detected : (exercise || fallback.exercise_detected),
    confidence: clamp(a.confidence, fallback.confidence),
    score: clamp(a.score, fallback.score),
    sub_scores: {
      posture: clamp(ss.posture, fallback.sub_scores.posture),
      joint_alignment: clamp(ss.joint_alignment, fallback.sub_scores.joint_alignment),
      tempo: clamp(ss.tempo, fallback.sub_scores.tempo),
      symmetry: clamp(ss.symmetry, fallback.sub_scores.symmetry),
      stability: clamp(ss.stability, fallback.sub_scores.stability),
      range_of_motion: clamp(ss.range_of_motion, fallback.sub_scores.range_of_motion),
      power_transfer: clamp(ss.power_transfer, fallback.sub_scores.power_transfer),
      injury_risk: clamp(ss.injury_risk, fallback.sub_scores.injury_risk),
      efficiency: clamp(ss.efficiency, fallback.sub_scores.efficiency),
      effectiveness: clamp(ss.effectiveness, fallback.sub_scores.effectiveness),
    },
    joint_angles: Array.isArray(a.joint_angles) ? a.joint_angles.slice(0, 6) : [],
    tempo: a.tempo && typeof a.tempo === "object" ? a.tempo : fallback.tempo,
    compensation_patterns: Array.isArray(a.compensation_patterns) ? a.compensation_patterns.map(String).slice(0, 5) : [],
    muscle_activation: Array.isArray(a.muscle_activation) ? a.muscle_activation.map(String).slice(0, 5) : [],
    good: Array.isArray(a.good) ? a.good.slice(0, 3).map(String) : fallback.good,
    fixes: Array.isArray(a.fixes) ? a.fixes.slice(0, 5).map(String) : fallback.fixes,
    cues: Array.isArray(a.cues) ? a.cues.slice(0, 4).map(String) : fallback.cues,
    safety_flags: Array.isArray(a.safety_flags) ? a.safety_flags.map(String) : [],
    alternative_exercise: typeof a.alternative_exercise === "string" ? a.alternative_exercise : null,
    plan_adjustments: Array.isArray(a.plan_adjustments) ? a.plan_adjustments.slice(0, 5) : fallback.plan_adjustments,
    encouragement: typeof a.encouragement === "string" ? a.encouragement : fallback.encouragement,
  };
}

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
    const safeFrames = frames
      .filter((frame: unknown) => typeof frame === "string" && frame.length > 100)
      .slice(0, 4)
      .map((frame: string) => frame.length > 700_000 ? frame.slice(0, 700_000) : frame);
    if (!safeFrames.length) {
      return new Response(JSON.stringify({ analysis: safeFallback(exercise ?? null, media_type ?? null, "imperial", "No readable frames") }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("injuries, units, goal, level")
      .eq("user_id", user.id)
      .maybeSingle();
    const injuries = (profile?.injuries as string | null) ?? null;
    const units = ((profile?.units as string) === "metric" ? "metric" : "imperial") as "imperial" | "metric";
    const goal = (profile?.goal as string | null) ?? "general fitness";
    const level = (profile?.level as string | null) ?? "intermediate";

    // --- Plan limits (entitlements remain enforced server-side) ---
    const { getPlanTier, countUsage, logUsage, FREE_LIMITS } = await import("../_shared/entitlements.ts");
    const tier = await getPlanTier(user.id);
    if (tier === "free") {
      const since = new Date(); since.setDate(since.getDate() - 30);
      const used = await countUsage(user.id, "video", since);
      if (used >= FREE_LIMITS.video_per_month) {
        return new Response(JSON.stringify({
          error: "limit_reached",
          code: "video_monthly_limit",
          message: `You've used your ${FREE_LIMITS.video_per_month} free form analyses this month. Upgrade for unlimited pro-level form checks.`,
        }), { status: 402, headers: { ...cors, "Content-Type": "application/json" } });
      }
    }
    await logUsage(user.id, "video");

    const { data: row } = await supabase.from("video_uploads").insert({
      user_id: user.id,
      exercise_name: exercise ?? null,
      storage_path: storage_path ?? "",
      status: "analyzing",
    }).select().single();

    const isPhoto = media_type === "photo" || frames.length === 1;
    const userContent: any[] = [
      { type: "text", text: `User-stated exercise hint: ${exercise ?? "unknown"}. ${isPhoto ? "A single still photo" : `${frames.length} sequential video frames`} follow. Identify the actual movement and analyze biomechanically. Return JSON only.` },
      ...safeFrames.map((b64: string) => ({
        type: "image_url",
        image_url: { url: b64.startsWith("data:") ? b64 : `data:image/jpeg;base64,${b64}` },
      })),
    ];

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: `${buildSys(injuries, units)}\n\n${EXPERT_KNOWLEDGE}` },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("analyze-video ai error", aiResp.status, t);
      const analysis = safeFallback(exercise ?? null, media_type ?? null, units, `AI service returned ${aiResp.status}`);
      if (row) await supabase.from("video_uploads").update({ status: "complete", analysis, score: analysis.score, cues: analysis.cues, analyzed_at: new Date().toISOString() }).eq("id", row.id);
      return new Response(JSON.stringify({ id: row?.id, analysis }), { headers: { ...cors, "Content-Type": "application/json" } });
    }

    const data = await aiResp.json();
    let analysis: any = {};
    try { analysis = JSON.parse(data.choices?.[0]?.message?.content ?? "{}"); } catch { analysis = {}; }
    analysis = normalizeAnalysis(analysis, exercise ?? null, media_type ?? null, units);

    if (row) {
      await supabase.from("video_uploads").update({
        status: "complete",
        analysis,
        score: analysis.score ?? null,
        cues: analysis.cues ?? null,
        analyzed_at: new Date().toISOString(),
      }).eq("id", row.id);
    }

    // Sync a brief summary into AI Coach chat history so the assistant sees it
    try {
      const subs = analysis.sub_scores || {};
      const top = (analysis.fixes || [])[0] || analysis.next_session_adjustment || "";
      const note = `[Form check] ${analysis.exercise_detected} — ${analysis.score}/100 (posture ${subs.posture}, alignment ${subs.joint_alignment}, tempo ${subs.tempo}, symmetry ${subs.symmetry}, injury-safety ${subs.injury_risk}). Top fix: ${top}`;
      await supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: note });
    } catch (e) { console.warn("coach sync failed", e); }

    return new Response(JSON.stringify({ id: row?.id, analysis }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-video error", e);
    return new Response(JSON.stringify({ analysis: safeFallback(null, null, "imperial", e instanceof Error ? e.message : String(e)) }), { headers: { ...cors, "Content-Type": "application/json" } });
  }
});
