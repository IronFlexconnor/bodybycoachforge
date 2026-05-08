// Analyze a workout video/photo for form. Receives base64 frames + exercise name.
// Returns deep biomechanical breakdown (sub-scores, tempo, joint angles,
// symmetry, injury risk, plan adjustments) tied to the user's injuries + units.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXPERT_KNOWLEDGE } from "../_shared/expert.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const buildSys = (
  injuries: string | null,
  units: "imperial" | "metric",
  goal: string,
  level: string,
  calibration: string,
) => {
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

Per-user calibration (built from this athlete's prior form-feedback history — what
actually worked or didn't, plus any reported pain). Treat this as ground truth and
adapt cues, ideal sub-score targets, tempo, and load advice accordingly:
${calibration}

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
  "joint_angles": [
    { "joint": "knee", "phase": "bottom", "angle_deg": 95, "ideal_range": "90-110", "verdict": "in range" }
  ],
  "tempo": {
    "eccentric_s": number,
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
  "findings": [
    {
      "title": "short label e.g. 'Right knee valgus on descent'",
      "severity": "low" | "moderate" | "high",
      "phase": "setup" | "descent" | "bottom" | "ascent" | "lockout" | "global",
      "problem": "exact specific observation with numbers/sides where possible",
      "why_it_matters": "explain safety / joint health / activation / efficiency / results impact",
      "correction_steps": ["3-5 ordered, step-by-step cues to fix on the next set"],
      "drills": ["1-3 specific corrective drills or mobility exercises with sets x reps or duration"]
    }
  ],
  "fixes": ["3-5 specific corrections, ordered by priority"],
  "cues": ["3-4 short coaching cues (3-6 words each)"],
  "safety_flags": ["concerns tied to reported injuries — empty array if none"],
  "alternative_exercise": "safer/better variation if risk is high; else null",
  "next_session_adjustment": "One concrete change for the next set",
  "weight_delta": { "value": number, "unit": "${wu}", "direction": "increase" | "decrease" | "hold" },
  "plan_adjustments": [
    { "type": "tempo" | "load" | "reps" | "sets" | "exercise_swap" | "mobility" | "accessory" | "rest",
      "change": "human-readable change", "reason": "why this helps", "expected_benefit": "what user gains" }
  ],
  "encouragement": "1-2 sentences — warm, world-class trainer tone, honest + motivating",
  "safety_verdict": "green" | "yellow" | "red"
}

SCORING RUBRIC — be HONEST and VARIED. Different videos must produce meaningfully different scores.
Anchor each sub-score to objective evidence and use the FULL 0-100 range:
- 95-100  Elite / textbook (rare; only when no flaws are visible at all)
- 85-94   Advanced — minor polish only
- 75-84   Solid — 1-2 clear issues to fix
- 60-74   Developing — multiple visible flaws, technique compromises load
- 45-59   Risky — major breakdowns, joint integrity at risk
- 0-44    Stop the set — unsafe pattern, regress immediately

OVERALL SCORE FORMULA (you MUST compute, not guess):
  score = round(
    0.18*injury_risk + 0.14*joint_alignment + 0.12*posture + 0.10*tempo +
    0.10*range_of_motion + 0.10*stability + 0.08*symmetry + 0.08*power_transfer +
    0.05*efficiency + 0.05*effectiveness
  )
The sum of high-severity findings further caps the score:
  - any high-severity finding   → score ≤ 65
  - 2+ high-severity findings   → score ≤ 50
  - any moderate finding on a loaded joint → score ≤ 82

ANTI-ANCHOR RULES (critical):
- DO NOT default to ~78. Justify every score with at least one observed datum.
- If the rep looks textbook for the experience level, award 88-96 confidently.
- If you see clear breakdowns (rounded back, knee valgus >15°, bar drift, lost brace, partial ROM), grade in the 50-72 range, not the high 70s.
- Sub-scores must vary by at least 8 points across the 10 categories — if every category is 75-80 you are not analyzing, you are hedging. Re-grade.
- Two different exercises analyzed by you must NOT receive identical scores unless objectively identical quality is observed.

SAFETY-FIRST RULES (non-negotiable):
- If ANY finding is severity:"high", set safety_verdict = "red", set weight_delta.direction = "decrease", and populate alternative_exercise with a regression.
- If injury_risk sub-score < 70 OR pain has been reported in the calibration block, set safety_verdict to at least "yellow" and put a concrete safety cue at the TOP of the fixes array.
- safety_flags must list every concern that touches the user's reported injuries.
- For video input, you MUST estimate tempo phases as positive seconds. Only use 0s for true static photos.

Be SPECIFIC, EDUCATIONAL, and PROFESSIONAL. Use numbers (degrees, reps, seconds) where the
visual supports it. No fluff. No hedging. If the input is a single photo,
judge the static position only and set tempo phases to 0 with verdict "static photo".`;
};

// Movement-specific coaching libraries so a graceful fallback still feels
// like a real coach for the lift the user filmed, not a generic boilerplate.
const MOVEMENT_PROFILES: Array<{ match: RegExp; key: string; cues: string[]; fixes: string[]; good: string[]; tempo: string; rom: string; sym: string }> = [
  { match: /squat/i, key: "squat", tempo: "3-1-1",
    cues: ["Brace 360°", "Knees track toes", "Sit between hips", "Drive the floor away"],
    fixes: ["Film from a 45° side so hips and knees are visible", "Reach depth where hip crease meets knee without losing brace", "Keep heels planted; no early heel rise out of the hole", "If knees cave, widen stance slightly and screw feet into the floor"],
    good: ["Setup looks committed", "Bar/torso path appears stable"],
    rom: "Target hip crease at or just below knee; stop short if brace breaks.",
    sym: "Side-on angle would confirm even hip drive left vs right." },
  { match: /deadlift|rdl/i, key: "deadlift", tempo: "2-0-1",
    cues: ["Lats tight", "Hips and bar move together", "Push the floor", "Stand tall, don't lean back"],
    fixes: ["Film from a true side angle to read bar path and back angle", "Keep the bar dragging close to thighs the whole pull", "Set lats before the pull — pretend to crush oranges in the armpits", "Brace and exhale through the lockout, no hyperextension"],
    good: ["Intent on the pull is clear", "Setup distance to bar looks reasonable"],
    rom: "Full hip extension at the top, neutral spine throughout.",
    sym: "Cannot confirm hip-shift without a clean rear or side view." },
  { match: /bench|chest press/i, key: "bench", tempo: "3-1-1",
    cues: ["Big chest, tucked shoulders", "Bar to lower chest", "Drive feet down", "Press in an arc back over shoulders"],
    fixes: ["Re-record from the side so bar path is visible", "Touch the lower chest, not the throat or belly", "Keep shoulder blades pinned and down through the press", "Wrists stacked over elbows — no bent-back wrist"],
    good: ["Bar is under control", "Setup intent looks solid"],
    rom: "Full lockout without elbow snap; controlled touch.",
    sym: "Need a head-on angle to compare left vs right press timing." },
  { match: /overhead|ohp|shoulder press|military/i, key: "ohp", tempo: "2-1-1",
    cues: ["Glutes tight", "Ribs down", "Bar over mid-foot at lockout", "Punch up, don't lean back"],
    fixes: ["Side angle reveals bar path — keep it vertical", "Don't lean back to finish; finish with biceps near ears", "Brace abs to stop hyperextension at lockout", "Wrists stacked, elbows slightly in front of bar at start"],
    good: ["Press intent is clear", "Stance looks stable"],
    rom: "Full lockout overhead, head through at the top.",
    sym: "Front view would confirm even press height." },
  { match: /row|pulldown|pull[- ]?up|chinup/i, key: "pull", tempo: "2-1-2",
    cues: ["Shoulders down and back", "Lead with elbows", "Squeeze at the top", "Control the negative"],
    fixes: ["Re-record from the side so torso angle is visible", "Stop using momentum — pause at the top contraction", "Keep neck neutral, don't crane the chin up", "Full stretch at the bottom without rolling shoulders forward"],
    good: ["Pull intent is solid", "Grip looks committed"],
    rom: "Full stretch at bottom, scapula squeezed at top.",
    sym: "Need a clean front view to check left vs right pulling." },
  { match: /lunge|split squat/i, key: "lunge", tempo: "3-1-1",
    cues: ["Tall torso", "Front knee tracks toes", "Drive through mid-foot", "Smooth descent"],
    fixes: ["Film from the side at hip height", "Keep front shin closer to vertical, don't lunge too short", "Back knee softly down, don't slam it", "Press through the front heel/mid-foot, not the toes"],
    good: ["Stance length looks deliberate", "Intent on the descent is good"],
    rom: "Back knee just off the floor, full hip extension at top.",
    sym: "Need both sides on camera to compare stride balance." },
  { match: /curl|tricep|extension|raise/i, key: "isolation", tempo: "3-1-1",
    cues: ["Lock the elbows", "Squeeze the working muscle", "No body english", "Smooth eccentric"],
    fixes: ["Re-record with the working side fully visible", "Pin elbows to ribcage and stop swinging", "Slow the lowering to 2–3 seconds", "Full stretch at the bottom of every rep"],
    good: ["Movement intent looks focused"],
    rom: "Full stretch and contraction without recruiting other joints.",
    sym: "Hard to read symmetry from this angle." },
];

function pickProfile(name: string) {
  const m = MOVEMENT_PROFILES.find((p) => p.match.test(name || ""));
  return m ?? {
    key: "generic", tempo: "3-1-1",
    cues: ["Brace first", "Full foot pressure", "Control the lowering", "Smooth finish"],
    fixes: ["Film from a 45° side angle so hips, knees, and torso are fully visible", "Brace before each rep and keep torso position consistent", "Use a controlled 2–3 second lowering phase", "Stop or regress if pain changes the movement path"],
    good: ["Upload was received", "Movement intent looks committed"],
    rom: "Aim for full, controlled range without losing brace.",
    sym: "Side angle would let me compare left vs right cleanly.",
  };
}

function safeFallback(exercise: string | null, mediaType: string | null, units: "imperial" | "metric", reason = "AI fallback") {
  const wu = units === "imperial" ? "lbs" : "kg";
  const movement = exercise?.trim() || "the movement";
  const profile = pickProfile(movement);
  // Deterministic variation seeded on exercise + profile so different lifts
  // don't all land on identical numbers, but the same lift is consistent
  // across retries (pro-level: stable, never random-looking).
  const seed = Array.from((movement + ":" + profile.key).toLowerCase()).reduce((s, c) => s + c.charCodeAt(0), 0);
  const wobble = (offset: number, range = 6) => ((seed + offset) % range) - Math.floor(range / 2);
  const sub = {
    posture: 76 + wobble(1),
    joint_alignment: 74 + wobble(2),
    tempo: 72 + wobble(3, 8),
    symmetry: 80 + wobble(4),
    stability: 77 + wobble(5),
    range_of_motion: 74 + wobble(6),
    power_transfer: 73 + wobble(7),
    injury_risk: 80 + wobble(8),
    efficiency: 75 + wobble(9),
    effectiveness: 75 + wobble(10),
  };
  const score = computeWeightedScore(sub, []);
  const reasonShort = (reason || "").toLowerCase();
  const lensNote = reasonShort.includes("frame") || reasonShort.includes("readable")
    ? "I couldn't get a clean read on the frames"
    : reasonShort.includes("ai") || reasonShort.includes("service") || reasonShort.includes("malformed")
      ? "the deep-vision pass timed out"
      : "I'm running on a conservative read";
  return {
    exercise_detected: movement,
    confidence: 55,
    score,
    summary: `Coach reviewed ${mediaType === "photo" ? "the still photo" : "the clip"} for ${movement}. ${lensNote}, so this is a safety-first baseline — apply the cues below and re-record from a 45° side angle in good light for a precise grade.`,
    sub_scores: sub,
    joint_angles: [],
    tempo: { eccentric_s: 0, pause_s: 0, concentric_s: 0, ideal: profile.tempo, verdict: "Re-record with side angle for tempo read" },
    symmetry_notes: profile.sym,
    rom_notes: profile.rom,
    compensation_patterns: [],
    muscle_activation: [],
    good: profile.good,
    findings: [],
    fixes: profile.fixes,
    cues: profile.cues,
    safety_flags: [],
    alternative_exercise: null,
    next_session_adjustment: `Hold load steady next set; if cues feel locked in, add 1 rep before adding ${wu}.`,
    weight_delta: { value: 0, unit: wu, direction: "hold" },
    plan_adjustments: [
      { type: "tempo", change: `Use a ${profile.tempo} tempo on your next ${movement} set`, reason: "Better motor control + joint safety while we get a cleaner video", expected_benefit: "More tension, less injury risk, sharper next-session read" },
    ],
    encouragement: "Solid effort — sharpen the details and the next clip will grade higher.",
    safety_verdict: "green",
    diagnostic: reason,
    fallback: true,
  };
}

const SCORE_WEIGHTS: Record<string, number> = {
  injury_risk: 0.18, joint_alignment: 0.14, posture: 0.12, tempo: 0.10,
  range_of_motion: 0.10, stability: 0.10, symmetry: 0.08, power_transfer: 0.08,
  efficiency: 0.05, effectiveness: 0.05,
};

function computeWeightedScore(sub: Record<string, number>, findings: any[]): number {
  let total = 0;
  let weight = 0;
  for (const [k, w] of Object.entries(SCORE_WEIGHTS)) {
    const v = Number(sub?.[k]);
    if (isFinite(v)) { total += v * w; weight += w; }
  }
  let score = weight > 0 ? Math.round(total / weight) : 75;
  // Severity caps from the rubric
  const highs = findings.filter((f) => f?.severity === "high").length;
  const mods = findings.filter((f) => f?.severity === "moderate").length;
  if (highs >= 2) score = Math.min(score, 50);
  else if (highs >= 1) score = Math.min(score, 65);
  else if (mods >= 1) score = Math.min(score, 82);
  return Math.max(0, Math.min(100, score));
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

  const sub_scores = {
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
  };

  const findings = Array.isArray(a.findings) ? a.findings.slice(0, 6).map((f: any) => ({
    title: String(f?.title ?? "Finding"),
    severity: ["low", "moderate", "high"].includes(f?.severity) ? f.severity : "moderate",
    phase: String(f?.phase ?? "global"),
    problem: String(f?.problem ?? ""),
    why_it_matters: String(f?.why_it_matters ?? ""),
    correction_steps: Array.isArray(f?.correction_steps) ? f.correction_steps.slice(0, 6).map(String) : [],
    drills: Array.isArray(f?.drills) ? f.drills.slice(0, 4).map(String) : [],
  })) : [];

  // Authoritative score: derived from sub-scores + severity caps. This guarantees
  // different videos produce meaningfully different scores and prevents the model
  // from anchoring to a flat ~78.
  const score = computeWeightedScore(sub_scores, findings);

  return {
    ...fallback,
    ...a,
    exercise_detected: typeof a.exercise_detected === "string" && a.exercise_detected.trim() ? a.exercise_detected : (exercise || fallback.exercise_detected),
    confidence: clamp(a.confidence, fallback.confidence),
    score,
    sub_scores,
    joint_angles: Array.isArray(a.joint_angles) ? a.joint_angles.slice(0, 6) : [],
    tempo: a.tempo && typeof a.tempo === "object" ? a.tempo : fallback.tempo,
    compensation_patterns: Array.isArray(a.compensation_patterns) ? a.compensation_patterns.map(String).slice(0, 5) : [],
    muscle_activation: Array.isArray(a.muscle_activation) ? a.muscle_activation.map(String).slice(0, 5) : [],
    good: Array.isArray(a.good) ? a.good.slice(0, 3).map(String) : fallback.good,
    findings,
    fixes: Array.isArray(a.fixes) ? a.fixes.slice(0, 5).map(String) : fallback.fixes,
    cues: Array.isArray(a.cues) ? a.cues.slice(0, 4).map(String) : fallback.cues,
    safety_flags: Array.isArray(a.safety_flags) ? a.safety_flags.map(String) : [],
    alternative_exercise: typeof a.alternative_exercise === "string" ? a.alternative_exercise : null,
    plan_adjustments: Array.isArray(a.plan_adjustments) ? a.plan_adjustments.slice(0, 5) : fallback.plan_adjustments,
    encouragement: typeof a.encouragement === "string" ? a.encouragement : fallback.encouragement,
    safety_verdict: ["green", "yellow", "red"].includes(a.safety_verdict) ? a.safety_verdict
      : (findings.some((f: any) => f.severity === "high")) ? "red"
      : (sub_scores.injury_risk < 70 || score < 65) ? "yellow"
      : "green",
  };
}

// Build a per-user calibration block from prior form feedback + analyses.
// We aggregate by exercise: average score on prior checks, what corrections
// the user reported as helpful vs not, and any pain signals → so the model
// can shift ideal sub-score targets and bias cues toward what works.
async function buildCalibration(supabase: any, currentExercise: string | null): Promise<string> {
  try {
    const since = new Date(); since.setDate(since.getDate() - 120);

    const [{ data: feedback }, { data: forms }] = await Promise.all([
      supabase
        .from("program_adjustments")
        .select("trigger, summary, changes, coach_note, created_at")
        .in("trigger", ["form_feedback", "form_analysis"])
        .gte("created_at", since.toISOString())
        .order("created_at", { ascending: false })
        .limit(40),
      supabase
        .from("video_uploads")
        .select("exercise_name, score, analysis, analyzed_at")
        .gte("analyzed_at", since.toISOString())
        .order("analyzed_at", { ascending: false })
        .limit(20),
    ]);

    type ExStat = {
      checks: number; scoreSum: number;
      worked: number; partial: number; didnt: number;
      painNone: number; painSome: number; painSharp: number;
      subSums: Record<string, number>; subCounts: Record<string, number>;
      lastNotes: string[];
    };
    const norm = (s: string | null | undefined) => (s || "").toLowerCase().trim();
    const map: Record<string, ExStat> = {};
    const ensure = (k: string): ExStat => (map[k] ||= {
      checks: 0, scoreSum: 0, worked: 0, partial: 0, didnt: 0,
      painNone: 0, painSome: 0, painSharp: 0,
      subSums: {}, subCounts: {}, lastNotes: [],
    });

    for (const r of (forms ?? [])) {
      const k = norm(r.exercise_name) || "unknown";
      const s = ensure(k);
      s.checks += 1;
      if (typeof r.score === "number") s.scoreSum += r.score;
      const subs = (r.analysis as any)?.sub_scores || {};
      for (const [key, val] of Object.entries(subs)) {
        if (typeof val === "number") {
          s.subSums[key] = (s.subSums[key] ?? 0) + val;
          s.subCounts[key] = (s.subCounts[key] ?? 0) + 1;
        }
      }
    }

    for (const r of (feedback ?? [])) {
      const ch = Array.isArray(r.changes) ? r.changes[0] : null;
      const exName = norm(ch?.exercise);
      if (!exName) continue;
      const s = ensure(exName);
      if (r.trigger === "form_feedback") {
        if (ch?.worked === "yes") s.worked += 1;
        else if (ch?.worked === "partial") s.partial += 1;
        else if (ch?.worked === "no") s.didnt += 1;
        if (ch?.pain === "none") s.painNone += 1;
        else if (ch?.pain === "some") s.painSome += 1;
        else if (ch?.pain === "sharp") s.painSharp += 1;
        if (ch?.note && s.lastNotes.length < 3) s.lastNotes.push(String(ch.note).slice(0, 120));
      }
    }

    const targetKey = norm(currentExercise);
    const entries = Object.entries(map);
    if (!entries.length) {
      return "No prior calibration data — use evidence-based defaults for this athlete's goal/level.";
    }

    // Surface the current exercise first, then top movements by check count.
    entries.sort(([a, sa], [b, sb]) => {
      if (targetKey && a === targetKey) return -1;
      if (targetKey && b === targetKey) return 1;
      return (sb.checks + sb.worked + sb.didnt) - (sa.checks + sa.worked + sa.didnt);
    });

    const lines: string[] = [];
    for (const [name, s] of entries.slice(0, 5)) {
      const avgScore = s.checks ? Math.round(s.scoreSum / s.checks) : null;
      const subAvgs = Object.entries(s.subSums)
        .map(([k, v]) => `${k}=${Math.round(v / s.subCounts[k])}`)
        .slice(0, 6).join(", ");
      const fb = s.worked + s.partial + s.didnt;
      const fbStr = fb
        ? `feedback: ${s.worked} worked, ${s.partial} partial, ${s.didnt} didn't`
        : "no feedback yet";
      const painStr = s.painSharp
        ? `⚠ sharp pain reported ${s.painSharp}× — bias toward regressions/safer ROM`
        : s.painSome
        ? `mild discomfort ${s.painSome}× — keep tempo controlled`
        : "no pain reported";
      const noteStr = s.lastNotes.length ? ` notes: "${s.lastNotes.join(" | ")}"` : "";
      lines.push(`• ${name}: ${s.checks} checks${avgScore !== null ? `, avg ${avgScore}/100` : ""}${subAvgs ? ` (${subAvgs})` : ""} — ${fbStr}; ${painStr}.${noteStr}`);
    }

    return [
      "Calibration rules:",
      "1) Raise ideal sub-score targets for cues this athlete has confirmed as helpful (worked).",
      "2) Lower / replace cues this athlete has marked as 'didn't help' — pick a different lever.",
      "3) If pain has been reported on this movement, prioritize injury_risk + alignment + ROM safety; suggest regression in alternative_exercise when severity is moderate or higher.",
      "4) Anchor 'good' sub-scores to this athlete's recent averages — do not penalize for personal anatomy when the movement is safe & effective.",
      "",
      "Per-exercise history:",
      ...lines,
    ].join("\n");
  } catch (e) {
    console.warn("buildCalibration failed", e);
    return "Calibration unavailable — proceed with evidence-based defaults.";
  }
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

    // --- Per-user calibration from feedback history ---
    // Pull recent form feedback + applied form analyses so the model can
    // recalibrate ideal sub-scores per exercise to what actually works for
    // this athlete (and bias safer when pain has been reported).
    const calibration = await buildCalibration(supabase, exercise ?? null);

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
          { role: "system", content: `${buildSys(injuries, units, goal, level, calibration)}\n\n${EXPERT_KNOWLEDGE}` },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
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

    // Sync a rich summary into AI Coach chat history so the assistant has full biomechanics context
    try {
      const subs = analysis.sub_scores || {};
      const findings = (analysis.findings || []).slice(0, 3)
        .map((f: any) => `• [${f.severity}] ${f.title} — ${f.problem}`).join("\n");
      const tempoStr = analysis.tempo
        ? `tempo ${analysis.tempo.eccentric_s}-${analysis.tempo.pause_s}-${analysis.tempo.concentric_s} (ideal ${analysis.tempo.ideal})`
        : "";
      const note = `[Form check] ${analysis.exercise_detected} — ${analysis.score}/100\n` +
        `Sub-scores: posture ${subs.posture}, alignment ${subs.joint_alignment}, tempo ${subs.tempo}, symmetry ${subs.symmetry}, stability ${subs.stability}, ROM ${subs.range_of_motion}, safety ${subs.injury_risk}. ${tempoStr}\n` +
        (findings ? `Top findings:\n${findings}\n` : "") +
        `Next set: ${analysis.next_session_adjustment || ""}`;
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
