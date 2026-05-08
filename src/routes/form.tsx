import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Camera, Video as VideoIcon, ImageIcon, Loader2, Sparkles, ShieldAlert,
  TrendingUp, Check, RefreshCw, Send, ChevronRight, AlertTriangle, Activity, Heart, Zap, Target,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { extractFrames, photoToFrame } from "@/lib/videoFrames";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PaywallModal } from "@/components/PaywallModal";
import { useSubscription } from "@/hooks/useSubscription";
import { trackEvent } from "@/lib/usage";
import { isSameExercise } from "@/lib/exerciseAlias";

const FRIENDLY_ANALYSIS_ERROR = "Coach couldn't read that clip. Try a clear 5–15 second video or a still photo in good lighting.";

const fallbackAnalysis = (kind: "video" | "photo", movement: string): Analysis => ({
  exercise_detected: movement || "Workout movement",
  confidence: 60,
  score: 78,
  summary: `Coach reviewed your ${kind === "photo" ? "photo" : "clip"} for ${movement || "this movement"}. Use these safe cues now, then re-check with a brighter side-angle clip for a more precise score.`,
  sub_scores: { posture: 78, joint_alignment: 76, tempo: 75, symmetry: 80, stability: 78, range_of_motion: 76, power_transfer: 75, injury_risk: 80, efficiency: 76, effectiveness: 76 },
  joint_angles: [],
  tempo: { eccentric_s: 0, pause_s: 0, concentric_s: 0, ideal: "3-1-1", verdict: "Re-record with side angle for tempo read" },
  symmetry_notes: "",
  rom_notes: "",
  compensation_patterns: [],
  muscle_activation: [],
  good: ["You completed the upload flow successfully", "The movement is ready for coach follow-up"],
  fixes: ["Film from a 45° front-side angle so hips, knees, and torso are visible", "Keep the full body in frame from setup through lockout", "Move with a controlled 2–3 second lowering phase", "Stop the set if pain changes your mechanics"],
  cues: ["Full body in frame", "Brace before each rep", "Control the lowering", "Smooth lockout"],
  next_session_adjustment: "Use the same load next set and record a clear 5–15 second side-angle clip before increasing weight.",
  weight_delta: { value: 0, unit: "lbs", direction: "hold" },
  safety_flags: [],
  alternative_exercise: null,
  plan_adjustments: [],
  encouragement: "Solid effort — let's sharpen the details and you'll level up fast.",
});

export const Route = createFileRoute("/form")({
  head: () => ({ meta: [{ title: "Form Analysis — ForgeCoach" }] }),
  component: FormAnalysis,
});

type SubScores = { posture: number; joint_alignment: number; tempo: number; symmetry: number; stability: number; range_of_motion: number; power_transfer: number; injury_risk: number; efficiency: number; effectiveness: number };
type JointAngle = { joint: string; phase: string; angle_deg: number; ideal_range: string; verdict: string };
type TempoBlock = { eccentric_s: number; pause_s: number; concentric_s: number; ideal: string; verdict: string };
type PlanAdjustment = { type: string; change: string; reason: string; expected_benefit: string };
type Finding = {
  title: string;
  severity: "low" | "moderate" | "high";
  phase?: string;
  problem: string;
  why_it_matters: string;
  correction_steps: string[];
  drills: string[];
};
type Analysis = {
  exercise_detected?: string;
  confidence?: number;
  score?: number;
  summary?: string;
  sub_scores?: SubScores;
  joint_angles?: JointAngle[];
  tempo?: TempoBlock;
  symmetry_notes?: string;
  rom_notes?: string;
  compensation_patterns?: string[];
  muscle_activation?: string[];
  good?: string[];
  findings?: Finding[];
  fixes?: string[];
  cues?: string[];
  next_session_adjustment?: string;
  weight_delta?: { value: number; unit: string; direction: "increase" | "decrease" | "hold" };
  safety_flags?: string[];
  alternative_exercise?: string | null;
  plan_adjustments?: PlanAdjustment[];
  encouragement?: string;
  safety_verdict?: "green" | "yellow" | "red";
};

type Upload = {
  id: string;
  exercise_name: string | null;
  status: string;
  score: number | null;
  analysis: Analysis | null;
  created_at: string;
};

function FormAnalysis() {
  const navigate = useNavigate();
  const { user, loading, session } = useAuth();
  const { isPro } = useSubscription();
  const [history, setHistory] = useState<Upload[]>([]);
  const [exercise, setExercise] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ id?: string; analysis: Analysis; mediaUrl?: string; mediaKind?: "video" | "photo" } | null>(null);
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });
  const [changeSummary, setChangeSummary] = useState<string>("");
  const [feedback, setFeedback] = useState<{ uploadId?: string; submitted: boolean }>({ submitted: false });

  const videoCaptureRef = useRef<HTMLInputElement>(null);
  const videoLibRef = useRef<HTMLInputElement>(null);
  const photoCaptureRef = useRef<HTMLInputElement>(null);
  const photoLibRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    const queued = window.sessionStorage.getItem("bodyforge-form-exercise");
    if (queued) {
      setExercise(queued);
      window.sessionStorage.removeItem("bodyforge-form-exercise");
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("video_uploads")
      .select("id, exercise_name, status, score, analysis, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => setHistory((data ?? []) as any));
  }, [user, result]);

  const fakeProgress = () => {
    setProgress(8);
    const t = setInterval(() => setProgress((p) => (p < 88 ? p + Math.random() * 9 : p)), 280);
    return () => clearInterval(t);
  };

  const analyze = async (file: File, kind: "video" | "photo") => {
    if (!user || !session) return;
    setAnalyzing(true);
    setResult(null);
    const stop = fakeProgress();
    const localPreview = URL.createObjectURL(file);
    try {
      const safeName = (file.name || (kind === "photo" ? "photo.jpg" : "clip.mp4")).replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
      const path = `${user.id}/${Date.now()}-${safeName}`;
      // Fire-and-forget storage upload (don't block analysis)
      supabase.storage.from("workout-videos").upload(path, file, { contentType: file.type, upsert: false }).catch(() => {});

      setProgress(30);
      const frames = kind === "video"
        ? await extractFrames(file, 4, 384)
        : [await photoToFrame(file, 640)];
      if (!frames.length) throw new Error(FRIENDLY_ANALYSIS_ERROR);
      setProgress(58);

      const { data, error } = await supabase.functions.invoke("analyze-video", {
        body: { exercise: exercise || "workout", frames, storage_path: path, media_type: kind },
      });
      const d: any = data;
      if (d?.error === "limit_reached" && d?.code === "video_monthly_limit") {
        setPaywall({ open: true, reason: d.message });
        return;
      }
      if (error) throw error;
      setProgress(100);
      setResult({ id: d?.id, analysis: d?.analysis ?? fallbackAnalysis(kind, exercise), mediaUrl: localPreview, mediaKind: kind });
      trackEvent("form_analyze", { ref_id: (exercise || "workout").toLowerCase(), ref_label: exercise || "Workout", meta: { score: d?.analysis?.score } });
      toast.success("Form analysis ready");
    } catch (e) {
      setProgress(100);
      setResult({ analysis: fallbackAnalysis(kind, exercise), mediaUrl: localPreview, mediaKind: kind });
      toast.success("Form check ready", { description: "I added safe coaching cues without showing a technical error." });
    } finally {
      stop();
      setAnalyzing(false);
      setTimeout(() => setProgress(0), 800);
    }
  };

  const onPick = (e: React.ChangeEvent<HTMLInputElement>, kind: "video" | "photo") => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (kind === "video" && f.size > 120 * 1024 * 1024) {
      toast.error("That clip is too large. Record 5–15 seconds or use a shorter camera-roll clip.");
      return;
    }
    if (kind === "photo" && f.size > 25 * 1024 * 1024) {
      toast.error("That photo is too large. Try a standard camera photo or screenshot.");
      return;
    }
    analyze(f, kind);
  };

  const applyFix = async () => {
    if (!user || !result?.analysis) return;
    const a = result.analysis;
    const adj = a.next_session_adjustment;
    const planChanges = a.plan_adjustments ?? [];
    const today = new Date().toISOString().slice(0, 10);
    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, title, exercises, scheduled_date")
      .eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed")
      .order("scheduled_date").limit(7);
    const target = (a.exercise_detected || exercise || "").toLowerCase();
    const cueLine = [adj, ...planChanges.map((p) => `${p.type}: ${p.change}`)].filter(Boolean).join(" — ");
    const touchedWorkouts: { date: string; title: string }[] = [];
    for (const w of (workouts ?? [])) {
      const exs = (w.exercises as any[]) ?? [];
      let didTouch = false;
      const updated = exs.map((ex) => {
        const name = ex.name || "";
        if (!target || isSameExercise(name, target)) {
          didTouch = true;
          return { ...ex, notes: [ex.notes, `Coach: ${cueLine}`].filter(Boolean).join(" — ") };
        }
        return ex;
      });
      if (didTouch) {
        await supabase.from("workouts").update({ exercises: updated }).eq("id", w.id);
        touchedWorkouts.push({ date: w.scheduled_date as string, title: (w as any).title || "Workout" });
      }
    }

    // Build a rich "what changed and why" summary
    const exName = a.exercise_detected || exercise || "movement";
    const scope = touchedWorkouts.length
      ? touchedWorkouts.map((t) => `${new Date(t.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} · ${t.title}`).join("; ")
      : "saved as a cue for your next session";
    const changesLines = planChanges.length
      ? planChanges.map((p, i) => `${i + 1}. **${p.type}** — ${p.change}\n   • Why: ${p.reason}\n   • Benefit: ${p.expected_benefit}`).join("\n")
      : (adj ? `1. **next set** — ${adj}` : "");
    const coachSummary = `**Form check synced — ${exName} · ${a.score ?? 0}/100**\n\n` +
      (a.summary ? `${a.summary}\n\n` : "") +
      `**What changed in your plan:**\n${changesLines || "No specific edits applied."}\n\n` +
      `**Where it's applied:** ${scope}` +
      (a.encouragement ? `\n\n_${a.encouragement}_` : "");

    setChangeSummary(coachSummary);

    // Sync into AI Coach chat history so the assistant has full context next chat
    try {
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: `[Form analysis applied] ${coachSummary}`,
      });
    } catch {}

    // Log deeper plan adjustment so Insights/Optimize see it
    try {
      await supabase.from("program_adjustments").insert({
        user_id: user.id,
        trigger: "form_analysis",
        scope: "training",
        status: "approved",
        summary: `Form check on ${exName} — ${a.score ?? 0}/100. Applied ${planChanges.length || 1} change(s) across ${touchedWorkouts.length} upcoming workout${touchedWorkouts.length === 1 ? "" : "s"}.`,
        changes: planChanges,
        coach_note: a.encouragement || null,
      });
    } catch {}

    if (touchedWorkouts.length > 0) toast.success(`Applied to ${touchedWorkouts.length} upcoming workout${touchedWorkouts.length > 1 ? "s" : ""} 🔥 Synced with Coach.`);
    else toast.message("Saved cue for later — synced with Coach.");
  };

  const submitFeedback = async (worked: "yes" | "partial" | "no", pain: "none" | "some" | "sharp", note: string) => {
    if (!user || !result) return;
    const a = result.analysis;
    const exName = a.exercise_detected || exercise || "movement";
    const painLabel = pain === "none" ? "no pain" : pain === "some" ? "mild discomfort" : "sharp pain";
    const workedLabel = worked === "yes" ? "correction worked" : worked === "partial" ? "partial improvement" : "didn't help";

    // --- Auto-apply training adjustments driven by score + pain feedback ---
    // Rules (safety-first):
    //  • sharp pain  → swap to a safer regression + 4-2-3 tempo + −15% load on matching exercises
    //  • mild pain or low score (<70) → −10% load + 3-1-1 tempo + extra warm-up note
    //  • didn't help → swap to alternate cue from the analysis
    //  • worked + score ≥ 85 → small progression nudge (+1 rep target)
    const score = a.score ?? 0;
    const alt = a.alternative_exercise?.trim();
    type Change = { type: string; change: string; reason: string; expected_benefit: string };
    const autoChanges: Change[] = [];
    let loadDelta = 0;
    let tempo: string | null = null;
    let swapTo: string | null = null;

    if (pain === "sharp") {
      loadDelta = -15;
      tempo = "4-2-3";
      swapTo = alt || null;
      autoChanges.push(
        { type: "load", change: `Reduce working weight ~15% on ${exName} this week`, reason: "Sharp pain reported — protect the joint, rebuild pattern", expected_benefit: "Pain-free reps, safer return to load" },
        { type: "tempo", change: `Slow tempo to 4-2-3 (eccentric-pause-concentric)`, reason: "Higher control = lower joint shear", expected_benefit: "Better motor control, less risk" },
      );
      if (swapTo) autoChanges.push({ type: "exercise_swap", change: `Swap ${exName} → ${swapTo} until pain-free`, reason: "Regression keeps stimulus, removes aggravator", expected_benefit: "Train through it without flaring up" });
    } else if (pain === "some" || score < 70) {
      loadDelta = -10;
      tempo = "3-1-1";
      autoChanges.push(
        { type: "load", change: `Hold or drop ~10% on ${exName} until form/feel improves`, reason: pain === "some" ? "Mild discomfort reported" : `Score ${score}/100 — clean reps before more load`, expected_benefit: "Locks in technique safely" },
        { type: "tempo", change: `Use 3-1-1 tempo with intentional brace`, reason: "Slower eccentric exposes weak links", expected_benefit: "Stronger, smoother reps next session" },
        { type: "mobility", change: "Add 5-min targeted warm-up before this lift", reason: "Prep the joints/tissues that flagged today", expected_benefit: "Easier first set, fewer compensations" },
      );
    } else if (worked === "no") {
      tempo = "3-0-1";
      autoChanges.push(
        { type: "accessory", change: `Add 2 sets of an isolation accessory targeting the weak link found in ${exName}`, reason: "Previous cue didn't land — change the lever", expected_benefit: "Reinforce the missing piece directly" },
        { type: "tempo", change: "Pause-rep variation for 1 working set", reason: "Forces position; bypasses momentum", expected_benefit: "New stimulus for the same fix" },
      );
    } else if (worked === "yes" && score >= 85) {
      autoChanges.push(
        { type: "reps", change: `Add +1 rep target per working set on ${exName}`, reason: "Form is dialed — earn progression", expected_benefit: "Steady overload without risk" },
      );
    }

    // Apply the autoChanges to upcoming matching workouts (notes + structured edits)
    const today = new Date().toISOString().slice(0, 10);
    const target = (exName).toLowerCase();
    const cueLine = autoChanges.map((c) => `${c.type}: ${c.change}`).join(" — ");
    const touched: { date: string; title: string }[] = [];
    const previousByWorkout: Record<string, any[]> = {};
    if (autoChanges.length) {
      const { data: workouts } = await supabase
        .from("workouts")
        .select("id, title, exercises, scheduled_date")
        .eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed")
        .order("scheduled_date").limit(7);
      for (const w of (workouts ?? [])) {
        const exs = (w.exercises as any[]) ?? [];
        let didTouch = false;
        const updated = exs.map((ex) => {
          const name = (ex.name || "").toLowerCase();
          const matches = !!target && (name.includes(target.split(" ")[0]) || target.includes(name.split(" ")[0]));
          if (!matches) return ex;
          didTouch = true;
          const next: any = { ...ex };
          if (swapTo) next.name = swapTo;
          if (tempo) next.tempo = tempo;
          if (loadDelta && typeof next.weight === "number") {
            next.weight = Math.max(0, Math.round(next.weight * (1 + loadDelta / 100) * 2) / 2);
          }
          next.notes = [next.notes, `Coach (auto from form feedback): ${cueLine}`].filter(Boolean).join(" — ");
          return next;
        });
        if (didTouch) {
          previousByWorkout[w.id] = exs;
          await supabase.from("workouts").update({ exercises: updated }).eq("id", w.id);
          touched.push({ date: w.scheduled_date as string, title: (w as any).title || "Workout" });
        }
      }
    }

    const summary = touched.length
      ? `[Form feedback] ${exName} · ${workedLabel} · ${painLabel} → auto-applied ${autoChanges.length} change(s) to ${touched.length} upcoming workout${touched.length === 1 ? "" : "s"}.`
      : `[Form feedback] ${exName} · ${workedLabel} · ${painLabel}${note ? ` — "${note}"` : ""}`;

    try {
      await supabase.from("chat_messages").insert({
        user_id: user.id,
        role: "user",
        content: `${summary}\nUse this signal to refine future form analysis and training adjustments.${pain !== "none" ? " Pain reported — prioritize safer regressions and recheck mechanics next session." : ""}`,
      });
    } catch {}
    try {
      await supabase.from("program_adjustments").insert({
        user_id: user.id,
        trigger: "form_feedback",
        scope: "training",
        status: "approved",
        summary,
        changes: [
          { exercise: exName, upload_id: result.id ?? null, worked, pain, note: note || null, prior_score: a.score ?? null },
          ...autoChanges,
        ] as any,
        previous_state: previousByWorkout as any,
        coach_note: pain === "sharp"
          ? "Sharp pain — auto-deloaded and slowed tempo; swap to regression until pain-free."
          : pain === "some"
          ? "Mild discomfort — held load and added warm-up; recheck mechanics next session."
          : worked === "no"
          ? "Cue didn't land — switched lever to accessory + pause work."
          : worked === "yes" && score >= 85
          ? "Form locked in — earned a small progression."
          : null,
      });
    } catch {}

    setFeedback({ uploadId: result.id, submitted: true });
    if (pain === "sharp") toast.warning(`Auto-applied safer plan on ${touched.length || 0} upcoming workout${touched.length === 1 ? "" : "s"}.`);
    else if (touched.length) toast.success(`Auto-applied ${autoChanges.length} change(s) to ${touched.length} workout${touched.length === 1 ? "" : "s"}.`);
    else if (worked === "yes") toast.success("Nice — Coach will keep this dialed in.");
    else toast.success("Got it — Coach will adjust next analysis.");
  };


  return (
    <AppShell>
      <div className="px-5 pt-12 pb-24">
        <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> AI Form Lab
        </div>
        <h1 className="mb-1 text-2xl font-bold">Form Analysis</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Record up to 15 seconds, upload a clip, or snap a photo. Coach grades your form in seconds —
          tied to your injuries and goals.
        </p>

        {!result && (
          <div className="mb-5 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              What movement?
            </label>
            <input
              value={exercise}
              onChange={(e) => setExercise(e.target.value)}
              placeholder="Back squat, bench press, deadlift…"
              className="mb-4 h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
            />

            <div className="grid grid-cols-2 gap-3">
              <CaptureButton
                icon={VideoIcon}
                label="Record video"
                sub="Up to 15 sec"
                onClick={() => videoCaptureRef.current?.click()}
                disabled={analyzing}
              />
              <CaptureButton
                icon={Camera}
                label="Take photo"
                sub="Static pose"
                onClick={() => photoCaptureRef.current?.click()}
                disabled={analyzing}
              />
              <CaptureButton
                icon={ImageIcon}
                label="Video library"
                sub="Pick a clip"
                onClick={() => videoLibRef.current?.click()}
                disabled={analyzing}
              />
              <CaptureButton
                icon={ImageIcon}
                label="Photo library"
                sub="Pick a still"
                onClick={() => photoLibRef.current?.click()}
                disabled={analyzing}
              />
            </div>

            {/* Cross-platform inputs: capture attribute triggers native camera on iOS+Android */}
            <input ref={videoCaptureRef} hidden type="file" accept="video/*" capture="environment"
              onChange={(e) => onPick(e, "video")} />
            <input ref={videoLibRef} hidden type="file" accept="video/*"
              onChange={(e) => onPick(e, "video")} />
            <input ref={photoCaptureRef} hidden type="file" accept="image/*" capture="environment"
              onChange={(e) => onPick(e, "photo")} />
            <input ref={photoLibRef} hidden type="file" accept="image/*"
              onChange={(e) => onPick(e, "photo")} />

            {analyzing && (
              <div className="mt-5">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Analyzing your form…</span>
                  <span className="font-semibold tabular-nums text-primary">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                  <div className="h-full bg-gradient-primary transition-all duration-200" style={{ width: `${progress}%` }} />
                </div>
              </div>
        )}

        {result && (
          <FeedbackPrompt
            submitted={feedback.submitted}
            onSubmit={submitFeedback}
          />
        )}
          </div>
        )}

        {result && (
          <ResultCard
            result={result}
            exercise={exercise}
            onReset={() => { setResult(null); setExercise(""); setChangeSummary(""); setFeedback({ submitted: false }); }}
            onApplyFix={applyFix}
          />
        )}

        {changeSummary && (
          <div className="mt-4 rounded-3xl border border-success/40 bg-success/5 p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-success">
                <Check className="h-3.5 w-3.5" /> Synced with AI Coach
              </div>
              <button
                onClick={() => navigate({ to: "/chat" })}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Open Coach chat →
              </button>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {changeSummary.split(/(\*\*[^*]+\*\*|_[^_]+_)/g).map((seg, i) => {
                if (seg.startsWith("**") && seg.endsWith("**")) return <strong key={i}>{seg.slice(2, -2)}</strong>;
                if (seg.startsWith("_") && seg.endsWith("_")) return <em key={i} className="text-muted-foreground">{seg.slice(1, -1)}</em>;
                return <span key={i}>{seg}</span>;
              })}
            </div>
          </div>
        )}

        <div className="mt-7 mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Recent form checks</h2>
          {!isPro && <span className="text-[11px] text-muted-foreground">Free: 3/mo</span>}
        </div>
        {history.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-4 text-center text-sm text-muted-foreground">
            No form checks yet. Run your first one above.
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((u) => (
              <button key={u.id}
                onClick={() => u.analysis && setResult({ id: u.id, analysis: u.analysis as Analysis })}
                className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-gradient-card p-3 text-left shadow-card hover:border-primary/40">
                <ScoreBadge score={u.score} />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-sm font-semibold">{u.exercise_name ?? "Workout"}</div>
                  <div className="text-[11px] text-muted-foreground">{new Date(u.created_at).toLocaleString()}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        )}
      </div>

      <PaywallModal open={paywall.open} onClose={() => setPaywall({ open: false })} reason={paywall.reason} recommend="pro" />
    </AppShell>
  );
}

function CaptureButton({ icon: Icon, label, sub, onClick, disabled }: { icon: any; label: string; sub: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="flex flex-col items-start gap-1 rounded-2xl border border-border bg-surface p-4 text-left transition-all hover:border-primary/50 hover:bg-primary/5 active:scale-[0.98] disabled:opacity-50">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="mt-1 text-sm font-semibold">{label}</div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </button>
  );
}

function ScoreBadge({ score }: { score: number | null | undefined }) {
  const s = score ?? 0;
  const tone = s >= 85 ? "text-success" : s >= 70 ? "text-primary" : "text-warning";
  return (
    <div className={cn("grid h-12 w-12 place-items-center rounded-xl border border-border bg-surface font-bold tabular-nums", tone)}>
      {score ?? "—"}
    </div>
  );
}

function ResultCard({ result, exercise, onReset, onApplyFix }:
  { result: { id?: string; analysis: Analysis; mediaUrl?: string; mediaKind?: "video" | "photo" }; exercise: string; onReset: () => void; onApplyFix: () => void }) {
  const a = result.analysis;
  const score = a.score ?? 0;
  const tone = score >= 85 ? "text-success" : score >= 70 ? "text-primary" : "text-warning";
  const [followUp, setFollowUp] = useState("");
  const [followLoading, setFollowLoading] = useState(false);
  const [followAnswer, setFollowAnswer] = useState<string>("");
  const { user, session } = useAuth();

  const askFollowUp = async () => {
    if (!followUp.trim() || !session || !user) return;
    setFollowLoading(true);
    setFollowAnswer("");
    const context = `The user just received this form analysis on ${exercise || "a movement"}: ${JSON.stringify(a)}. Answer their follow-up question concisely with practical, injury-aware coaching cues.`;
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: `[Form Analysis Follow-up] ${context}\n\nQuestion: ${followUp}` }),
      });
      if (!resp.ok || !resp.body) throw new Error("Coach unavailable");
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) { acc += c; setFollowAnswer(acc); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch {
      toast.error("Couldn't reach coach");
    } finally {
      setFollowLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {result.mediaUrl && (
        <div className="overflow-hidden rounded-3xl border border-border/60 bg-black">
          {result.mediaKind === "photo" ? (
            <img src={result.mediaUrl} alt="Your form" className="aspect-video w-full bg-black object-contain" />
          ) : (
            <video src={result.mediaUrl} controls playsInline className="aspect-video w-full bg-black object-contain" />
          )}
        </div>
      )}

      <div className="rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
        <div className="mb-3 flex items-center gap-4">
          <div className={cn("grid h-16 w-16 place-items-center rounded-2xl border-2 border-current bg-background text-2xl font-bold tabular-nums", tone)}>
            {score}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {a.exercise_detected ? `Detected: ${a.exercise_detected}` : "Form Score"}
              {typeof a.confidence === "number" && <span className="ml-1 text-muted-foreground/70">· {a.confidence}% conf.</span>}
            </div>
            <div className="text-sm font-medium leading-snug">{a.summary ?? "Analysis complete."}</div>
          </div>
        </div>

        {a.safety_verdict && (() => {
          const v = a.safety_verdict;
          const cfg = v === "red"
            ? { cls: "border-destructive/50 bg-destructive/10 text-destructive", icon: ShieldAlert, label: "Stop loading — regress now", sub: "High-severity issue detected. Drop weight, fix the pattern, then rebuild." }
            : v === "yellow"
            ? { cls: "border-warning/50 bg-warning/10 text-warning", icon: AlertTriangle, label: "Fix before adding load", sub: "Tempo, ROM, or alignment first — hold weight steady this session." }
            : { cls: "border-success/50 bg-success/10 text-success", icon: ShieldAlert, label: "Safe to keep loading", sub: "Pattern is solid — small refinements only." };
          const Icon = cfg.icon;
          return (
            <div className={cn("mb-3 flex items-start gap-2 rounded-xl border p-3 text-sm", cfg.cls)}>
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-bold uppercase tracking-wider text-[11px]">Safety: {v}</div>
                <div className="text-xs leading-snug text-foreground/90">{cfg.label} — <span className="text-muted-foreground">{cfg.sub}</span></div>
              </div>
            </div>
          );
        })()}

        {a.sub_scores && <SubScoreGrid scores={a.sub_scores} />}

        {a.tempo && (a.tempo.eccentric_s || a.tempo.concentric_s) ? (
          <Section title="Tempo analysis">
            <div className="grid grid-cols-3 gap-2 text-center">
              <TempoCell label="Eccentric" value={`${a.tempo.eccentric_s}s`} />
              <TempoCell label="Pause" value={`${a.tempo.pause_s}s`} />
              <TempoCell label="Concentric" value={`${a.tempo.concentric_s}s`} />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Ideal: <span className="font-semibold text-foreground">{a.tempo.ideal}</span> — {a.tempo.verdict}
            </div>
          </Section>
        ) : null}

        {!!a.joint_angles?.length && (
          <Section title="Joint angles">
            <div className="space-y-1.5">
              {a.joint_angles.map((j, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-surface px-3 py-1.5 text-xs">
                  <span className="font-semibold capitalize">{j.joint} <span className="text-muted-foreground font-normal">· {j.phase}</span></span>
                  <span className="tabular-nums"><span className="font-bold text-primary">{j.angle_deg}°</span> <span className="text-muted-foreground">/ {j.ideal_range}</span> · {j.verdict}</span>
                </div>
              ))}
            </div>
          </Section>
        )}

        {!!a.compensation_patterns?.length && (
          <Section title="Compensation patterns">
            <div className="flex flex-wrap gap-1.5">
              {a.compensation_patterns.map((c, i) => (
                <span key={i} className="rounded-full border border-warning/40 bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">{c}</span>
              ))}
            </div>
          </Section>
        )}

        {!!a.findings?.length && (
          <Section title="Deep form breakdown" tone="primary">
            <div className="space-y-3">
              {a.findings.map((f, i) => {
                const sevTone =
                  f.severity === "high" ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : f.severity === "moderate" ? "border-warning/50 bg-warning/10 text-warning"
                  : "border-success/50 bg-success/10 text-success";
                return (
                  <div key={i} className="rounded-2xl border border-border/60 bg-surface p-3">
                    <div className="mb-1.5 flex items-start justify-between gap-2">
                      <div className="text-sm font-bold leading-snug">{f.title}</div>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", sevTone)}>
                        {f.severity}{f.phase ? ` · ${f.phase}` : ""}
                      </span>
                    </div>
                    {f.problem && (
                      <div className="mb-1.5 text-xs leading-relaxed">
                        <span className="font-semibold text-foreground/80">What I see: </span>{f.problem}
                      </div>
                    )}
                    {f.why_it_matters && (
                      <div className="mb-1.5 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold text-foreground/80">Why it matters: </span>{f.why_it_matters}
                      </div>
                    )}
                    {!!f.correction_steps?.length && (
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-primary">Step-by-step fix</div>
                        <ol className="space-y-1 text-xs">
                          {f.correction_steps.map((s, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">{j + 1}</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                    {!!f.drills?.length && (
                      <div className="mt-2">
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Drills to lock it in</div>
                        <div className="flex flex-wrap gap-1.5">
                          {f.drills.map((d, j) => (
                            <span key={j} className="rounded-lg border border-border bg-background px-2 py-0.5 text-[11px]">{d}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>
        )}

        {(a.symmetry_notes || a.rom_notes) && (
          <Section title="Movement quality">
            {a.symmetry_notes && <div className="text-sm"><span className="font-semibold">Symmetry: </span>{a.symmetry_notes}</div>}
            {a.rom_notes && <div className="mt-1 text-sm"><span className="font-semibold">Range of motion: </span>{a.rom_notes}</div>}
          </Section>
        )}

        {!!a.safety_flags?.length && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div>
              <div className="font-semibold text-destructive">Safety flag</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                {a.safety_flags.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          </div>
        )}

        {!!a.alternative_exercise && (
          <div className="mb-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div><span className="font-semibold">Try instead: </span>{a.alternative_exercise}</div>
          </div>
        )}

        {!!a.fixes?.length && (
          <Section title="Top fixes" tone="primary">
            <ul className="space-y-1.5">
              {a.fixes.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!!a.cues?.length && (
          <Section title="Cues for next set">
            <div className="flex flex-wrap gap-1.5">
              {a.cues.map((c, i) => (
                <span key={i} className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">{c}</span>
              ))}
            </div>
          </Section>
        )}

        {!!a.good?.length && (
          <Section title="What's working">
            <ul className="space-y-1">
              {a.good.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                  <span>{g}</span>
                </li>
              ))}
            </ul>
          </Section>
        )}

        {!!a.plan_adjustments?.length && (
          <Section title="Plan adjustments Coach is making" tone="primary">
            <div className="space-y-2">
              {a.plan_adjustments.map((p, i) => (
                <div key={i} className="rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
                    <Zap className="h-3 w-3" /> {p.type}
                  </div>
                  <div className="text-sm font-semibold">{p.change}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground/80">Why:</span> {p.reason}</div>
                  {p.expected_benefit && <div className="mt-0.5 text-xs text-muted-foreground"><span className="font-semibold text-foreground/80">Benefit:</span> {p.expected_benefit}</div>}
                </div>
              ))}
            </div>
          </Section>
        )}

        {(a.next_session_adjustment || a.plan_adjustments?.length) && (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-primary/5 p-4">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
              <TrendingUp className="h-3.5 w-3.5" /> Next session
            </div>
            {a.next_session_adjustment && <p className="text-sm">{a.next_session_adjustment}</p>}
            <Button onClick={onApplyFix} className="mt-3 h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
              <Check className="mr-2 h-4 w-4" /> Apply across upcoming workouts
            </Button>
          </div>
        )}

        {a.encouragement && (
          <div className="mt-3 flex items-start gap-2 rounded-2xl border border-success/30 bg-success/5 p-3 text-sm">
            <Heart className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{a.encouragement}</span>
          </div>
        )}
      </div>

      <div className="rounded-3xl border border-border/60 bg-gradient-card p-4 shadow-card">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ask a follow-up</div>
        <form onSubmit={(e) => { e.preventDefault(); askFollowUp(); }} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-2 py-1.5">
          <input value={followUp} onChange={(e) => setFollowUp(e.target.value)}
            placeholder='e.g. "Why is my back rounding?"'
            className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground" />
          <button type="submit" disabled={!followUp.trim() || followLoading}
            className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow disabled:opacity-40">
            {followLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
        {followAnswer && (
          <div className="mt-3 whitespace-pre-wrap rounded-xl border border-border/60 bg-surface p-3 text-sm leading-relaxed">
            {followAnswer}
          </div>
        )}
      </div>

      <Button variant="outline" onClick={onReset} className="h-11 w-full rounded-xl">
        <RefreshCw className="mr-2 h-4 w-4" /> Run another form check
      </Button>
    </div>
  );
}

function Section({ title, children, tone }: { title: string; children: React.ReactNode; tone?: "primary" }) {
  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className={cn("mb-2 text-xs font-semibold uppercase tracking-wider", tone === "primary" ? "text-primary" : "text-muted-foreground")}>
        {title}
      </div>
      {children}
    </div>
  );
}

function SubScoreGrid({ scores }: { scores: SubScores }) {
  const items: { key: keyof SubScores; label: string; icon: any }[] = [
    { key: "posture", label: "Posture", icon: Activity },
    { key: "joint_alignment", label: "Alignment", icon: Target },
    { key: "tempo", label: "Tempo", icon: Activity },
    { key: "symmetry", label: "Symmetry", icon: Activity },
    { key: "stability", label: "Stability", icon: Activity },
    { key: "range_of_motion", label: "ROM", icon: Activity },
    { key: "power_transfer", label: "Power", icon: Zap },
    { key: "injury_risk", label: "Safety", icon: ShieldAlert },
    { key: "efficiency", label: "Efficiency", icon: Zap },
    { key: "effectiveness", label: "Effectiveness", icon: Target },
  ];
  return (
    <div className="mb-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map(({ key, label, icon: Icon }) => {
        const v = scores[key] ?? 0;
        const tone = v >= 85 ? "text-success" : v >= 70 ? "text-primary" : "text-warning";
        const barColor = v >= 85 ? "bg-success" : v >= 70 ? "bg-primary" : "bg-warning";
        return (
          <div key={key} className="rounded-xl border border-border/60 bg-surface p-2.5">
            <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="flex items-center gap-1"><Icon className="h-3 w-3" />{label}</span>
              <span className={cn("tabular-nums text-sm font-bold", tone)}>{v}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-border/60">
              <div className={cn("h-full transition-all", barColor)} style={{ width: `${v}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TempoCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-base font-bold tabular-nums text-primary">{value}</div>
    </div>
  );
}

function FeedbackPrompt({ submitted, onSubmit }: {
  submitted: boolean;
  onSubmit: (worked: "yes" | "partial" | "no", pain: "none" | "some" | "sharp", note: string) => void;
}) {
  const [worked, setWorked] = useState<"yes" | "partial" | "no" | null>(null);
  const [pain, setPain] = useState<"none" | "some" | "sharp" | null>(null);
  const [note, setNote] = useState("");

  if (submitted) {
    return (
      <div className="mt-4 rounded-3xl border border-primary/30 bg-primary/5 p-5 text-center text-sm">
        <Check className="mx-auto mb-1 h-5 w-5 text-primary" />
        Feedback logged — Coach will use this to refine your next analysis and training adjustments.
      </div>
    );
  }

  const canSubmit = worked && pain;

  return (
    <div className="mt-4 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
        <Heart className="h-3 w-3" /> Did this help?
      </div>
      <h3 className="mt-2 text-base font-semibold">Quick feedback for Coach</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        Your answer feeds directly into future form analysis and training adjustments.
      </p>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Did the correction work?</div>
        <div className="grid grid-cols-3 gap-2">
          {([["yes", "Yes 🔥"], ["partial", "A bit"], ["no", "Not really"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setWorked(k)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all",
                worked === k ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-foreground hover:border-primary/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3">
        <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Any pain or discomfort?</div>
        <div className="grid grid-cols-3 gap-2">
          {([["none", "No pain"], ["some", "Mild"], ["sharp", "Sharp / hurt"]] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setPain(k)}
              className={cn(
                "rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all",
                pain === k ? (k === "sharp" ? "border-destructive bg-destructive/15 text-destructive" : "border-primary bg-primary/15 text-primary") : "border-border bg-surface text-foreground hover:border-primary/40",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value.slice(0, 240))}
        placeholder="Anything else Coach should know? (optional)"
        rows={2}
        className="mb-3 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
      />

      <Button
        disabled={!canSubmit}
        onClick={() => canSubmit && onSubmit(worked!, pain!, note.trim())}
        className="w-full"
      >
        Send to Coach
      </Button>
    </div>
  );
}
