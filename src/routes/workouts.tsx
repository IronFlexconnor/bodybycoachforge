import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Calendar, Plus, Minus, Check, Loader2, X, Sparkles, Target, Video, TrendingUp, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEFAULT_WEIGHT_UNIT, unitsToWeightUnit, type WeightUnit } from "@/lib/units";
import { GoalSelector } from "@/components/GoalSelector";

export const Route = createFileRoute("/workouts")({
  head: () => ({ meta: [{ title: "Workouts — Body Forge" }] }),
  component: Workouts,
});

type Exercise = { name: string; sets: number; reps: string; rest_sec?: number; rpe?: number; notes?: string };
type Workout = { id: string; title: string; focus: string | null; week: number | null; day: number | null; exercises: Exercise[]; scheduled_date: string | null };

function Workouts() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [upcoming, setUpcoming] = useState<Workout[]>([]);
  const [active, setActive] = useState<Workout | null>(null);
  const [busy, setBusy] = useState(true);
  const [showGoals, setShowGoals] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<string | null>(null);

  const refresh = async () => {
    if (!user) return;
    const today = new Date().toISOString().slice(0, 10);
    const [{ data: ws }, { data: prof }] = await Promise.all([
      supabase.from("workouts").select("*")
        .eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed")
        .order("scheduled_date", { ascending: true }).limit(7),
      supabase.from("profiles").select("goal").eq("user_id", user.id).maybeSingle(),
    ]);
    setUpcoming((ws ?? []) as any);
    setCurrentGoal(prof?.goal ?? null);
    setBusy(false);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    refresh();
  }, [user, loading, navigate]);

  if (loading || busy) return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;

  if (active) return <ActiveSession workout={active} onClose={() => { setActive(null); }} onComplete={() => { setActive(null); setUpcoming((u) => u.filter((w) => w.id !== active.id)); }} />;

  const today = upcoming[0];

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Your Program</p>
            <h1 className="text-2xl font-bold">Upcoming sessions</h1>
          </div>
          <Link
            to="/calendar"
            aria-label="Open workout calendar"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-semibold text-primary shadow-card transition-all hover:border-primary hover:bg-primary/20 active:scale-95"
          >
            <Calendar className="h-4 w-4" />
            History
          </Link>
        </div>

        <div className="mb-5 rounded-2xl border border-primary/30 bg-gradient-card p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Target className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Current goal</div>
              <div className="font-semibold leading-tight truncate">{currentGoal ?? "Pick a goal"}</div>
            </div>
            <Button onClick={() => setShowGoals((s) => !s)} size="sm" className="h-9 rounded-full bg-gradient-primary text-xs font-semibold text-primary-foreground shadow-glow">
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Optimize
            </Button>
          </div>
          {showGoals && (
            <div className="mt-4">
              <p className="mb-3 text-xs text-muted-foreground">Tap a goal — Coach instantly rebuilds your program around it.</p>
              <GoalSelector compact onBuilt={() => { setShowGoals(false); refresh(); }} />
            </div>
          )}
        </div>

        {today ? (
          <div className="mb-6 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">Next · {today.scheduled_date}</div>
            <h2 className="mb-1 text-xl font-bold">{today.title}</h2>
            <p className="mb-4 text-sm text-muted-foreground">{(today.exercises ?? []).length} exercises · {today.focus ?? ""}</p>
            <Button onClick={() => setActive(today)} className="h-12 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
              <Play className="mr-2 h-4 w-4 fill-current" /> Start workout
            </Button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-5 text-center text-sm text-muted-foreground">
            No upcoming sessions. Ask Coach Forge to design a new block.
          </div>
        )}

        {upcoming.length > 1 && <h3 className="mb-3 mt-2 text-lg font-semibold">Coming up</h3>}
        <div className="space-y-2">
          {upcoming.slice(1).map((w) => (
            <button key={w.id} onClick={() => setActive(w)}
              className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-gradient-card p-4 text-left shadow-card hover:border-primary/40">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary"><Play className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold leading-tight">{w.title}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{w.scheduled_date} · {(w.exercises ?? []).length} exercises</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function ActiveSession({ workout, onClose, onComplete }: { workout: Workout; onClose: () => void; onComplete: () => void }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [logId, setLogId] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [logs, setLogs] = useState<Record<string, { reps: string; weight: string; rpe: string; done: boolean }[]>>({});
  const [finishing, setFinishing] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);
  const [lastByExercise, setLastByExercise] = useState<Record<string, { weight: number | null; reps: number | null; unit: string | null; date: string } | null>>({});
  const [summary, setSummary] = useState<null | {
    durationMin: number;
    totalSets: number;
    totalReps: number;
    totalVolume: number;
    coachNote?: string;
    recs: { exercise: string; topWeight: number; topReps: number; rpe: number | null; nextWeight: number; deltaPct: number; verdict: string }[];
  }>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("profiles").select("units").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      if (data?.units === "metric" || data?.units === "imperial") {
        setWeightUnit(unitsToWeightUnit(data.units));
      }
    });
    supabase.from("workout_logs").insert({ user_id: user.id, workout_id: workout.id }).select().single().then(({ data }) => {
      if (data) setLogId(data.id);
    });
    const init: typeof logs = {};
    workout.exercises.forEach((ex) => {
      init[ex.name] = Array.from({ length: ex.sets || 3 }, () => ({ reps: "", weight: "", rpe: "", done: false }));
    });
    setLogs(init);

    // Fetch last logged set for each exercise (for the "previous" hint)
    (async () => {
      const names = workout.exercises.map((e) => e.name);
      if (!names.length) return;
      const { data } = await supabase
        .from("set_logs")
        .select("exercise_name, weight, reps, weight_unit, created_at")
        .eq("user_id", user.id)
        .in("exercise_name", names)
        .order("created_at", { ascending: false })
        .limit(200);
      const map: typeof lastByExercise = {};
      (data ?? []).forEach((row: any) => {
        if (!map[row.exercise_name] && row.weight != null) {
          map[row.exercise_name] = { weight: row.weight, reps: row.reps, unit: row.weight_unit, date: row.created_at };
        }
      });
      setLastByExercise(map);
    })();
  }, [user, workout]);

  const updateSet = (ex: string, idx: number, key: "reps" | "weight" | "rpe", val: string) => {
    setLogs((l) => ({ ...l, [ex]: l[ex].map((s, i) => i === idx ? { ...s, [key]: val } : s) }));
  };

  const toggleDone = async (ex: string, idx: number) => {
    if (!user || !logId) return;
    const set = logs[ex][idx];
    const next = !set.done;
    setLogs((l) => ({ ...l, [ex]: l[ex].map((s, i) => i === idx ? { ...s, done: next } : s) }));
    if (next && (set.reps || set.weight)) {
      await supabase.from("set_logs").insert({
        user_id: user.id, workout_log_id: logId, exercise_name: ex, set_number: idx + 1,
        reps: set.reps ? parseInt(set.reps) : null,
        weight: set.weight ? parseFloat(set.weight) : null,
        weight_unit: weightUnit,
        rpe: set.rpe ? parseFloat(set.rpe) : null,
        completed: true,
      });
    }
  };

  const addSet = (ex: string) => setLogs((l) => ({ ...l, [ex]: [...l[ex], { reps: "", weight: "", rpe: "", done: false }] }));
  const removeSet = (ex: string, idx: number) => setLogs((l) => ({ ...l, [ex]: l[ex].filter((_, i) => i !== idx) }));

  const analyzeExercise = (name: string) => {
    window.sessionStorage.setItem("bodyforge-form-exercise", name);
    navigate({ to: "/form" });
  };

  const finish = async () => {
    if (!user || !logId) return;
    setFinishing(true);
    const duration = Math.round((Date.now() - startedAt) / 60000);
    await supabase.from("workout_logs").update({ completed_at: new Date().toISOString(), duration_min: duration }).eq("id", logId);
    await supabase.from("workouts").update({ status: "completed" }).eq("id", workout.id);

    // --- Build progressive-overload recommendations from this session's sets ---
    const round = (n: number) => {
      const step = weightUnit === "kg" ? 2.5 : 5;
      return Math.round(n / step) * step;
    };
    const recs: NonNullable<typeof summary>["recs"] = [];
    let totalSets = 0, totalReps = 0, totalVolume = 0;
    for (const ex of workout.exercises) {
      const sets = (logs[ex.name] ?? []).filter((s) => s.done && s.weight && s.reps);
      if (!sets.length) continue;
      // Heaviest set wins; tie-broken by reps
      const top = sets
        .map((s) => ({ w: parseFloat(s.weight), r: parseInt(s.reps), rpe: s.rpe ? parseFloat(s.rpe) : NaN }))
        .filter((s) => Number.isFinite(s.w) && Number.isFinite(s.r))
        .sort((a, b) => b.w - a.w || b.r - a.r)[0];
      if (!top) continue;
      sets.forEach((s) => {
        const w = parseFloat(s.weight); const r = parseInt(s.reps);
        if (Number.isFinite(w) && Number.isFinite(r)) { totalSets++; totalReps += r; totalVolume += w * r; }
      });
      const rpe = Number.isFinite(top.rpe) ? top.rpe : null;
      let deltaPct = 0; let verdict = "Hold steady — dial in technique";
      if (rpe == null || rpe <= 7) { deltaPct = 5; verdict = "Felt strong — push the bar"; }
      else if (rpe <= 8) { deltaPct = 2.5; verdict = "Solid effort — small jump"; }
      else if (rpe <= 8.5) { deltaPct = 1.25; verdict = "Right at the edge — micro-load"; }
      else if (rpe <= 9.5) { deltaPct = 0; verdict = "Hold weight — chase a clean rep PR"; }
      else { deltaPct = -5; verdict = "Back off 5% — recover and rebuild"; }
      const nextWeight = Math.max(round(top.w * (1 + deltaPct / 100)), 0);
      recs.push({ exercise: ex.name, topWeight: top.w, topReps: top.r, rpe, nextWeight, deltaPct, verdict });
    }

    // Show summary first; auto-adjust runs in parallel and updates coachNote on arrival
    setSummary({ durationMin: duration, totalSets, totalReps, totalVolume, recs });

    supabase.functions.invoke("auto-adjust", { body: { trigger: "workout_complete", workout_log_id: logId } })
      .then(({ data }) => {
        const d = data as any;
        if (d?.should_adjust && d?.summary) {
          setSummary((prev) => prev ? { ...prev, coachNote: d.summary } : prev);
        }
      })
      .catch(() => {});
  };

  const closeSummary = () => {
    toast.success(`Session complete · ${summary?.durationMin ?? 0} min 🔥`);
    onComplete();
  };

  return (
    <div className="min-h-dvh bg-background pb-32">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur-xl">
        <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full bg-surface"><X className="h-4 w-4" /></button>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">In progress</div>
          <div className="font-semibold">{workout.title}</div>
        </div>
        <div className="w-9" />
      </div>

      <div className="px-5 pt-6 space-y-4">
        {workout.exercises.map((ex) => (
          <div key={ex.name} className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{ex.name}</div>
                <div className="text-xs text-muted-foreground">Target: {ex.sets} × {ex.reps}{ex.rpe ? ` · RPE ${ex.rpe}` : ""}</div>
                {lastByExercise[ex.name] ? (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Last: {lastByExercise[ex.name]!.weight}{lastByExercise[ex.name]!.unit ?? weightUnit} × {lastByExercise[ex.name]!.reps ?? "—"}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-muted-foreground">First time logging — set your baseline 💪</div>
                )}
              </div>
              <button onClick={() => analyzeExercise(ex.name)} className="ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-colors hover:border-primary" aria-label={`Analyze ${ex.name} form`}>
                <Video className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>#</div><div>Weight ({weightUnit})</div><div>Reps</div><div>RPE</div><div></div>
              </div>
              {logs[ex.name]?.map((s, i) => (
                <div key={i} className={cn("grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 rounded-lg p-1 transition-colors", s.done && "bg-primary/10")}>
                  <div className="text-center text-xs font-semibold text-muted-foreground">{i + 1}</div>
                  <Input inputMode="decimal" value={s.weight} onChange={(e) => updateSet(ex.name, i, "weight", e.target.value)} placeholder={lastByExercise[ex.name]?.weight != null ? String(lastByExercise[ex.name]!.weight) : weightUnit} className="h-9 text-sm" />
                  <Input inputMode="numeric" value={s.reps} onChange={(e) => updateSet(ex.name, i, "reps", e.target.value)} placeholder={ex.reps} className="h-9 text-sm" />
                  <Input inputMode="decimal" value={s.rpe} onChange={(e) => updateSet(ex.name, i, "rpe", e.target.value)} placeholder="—" className="h-9 text-sm" />
                  <button onClick={() => toggleDone(ex.name, i)}
                    className={cn("grid h-9 w-9 place-items-center rounded-lg",
                      s.done ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-surface text-muted-foreground")}>
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={() => addSet(ex.name)} className="flex-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary">
                  <Plus className="mr-1 inline h-3 w-3" /> Add set
                </button>
                {logs[ex.name]?.length > 1 && (
                  <button onClick={() => removeSet(ex.name, logs[ex.name].length - 1)} className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive">
                    <Minus className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed right-4 bottom-24 z-20">
        <Link to="/form"
          className="flex items-center gap-2 rounded-full border border-primary/40 bg-background/95 px-4 py-2.5 text-xs font-semibold shadow-card backdrop-blur-xl hover:border-primary">
          <Sparkles className="h-4 w-4 text-primary" /> Analyze form
        </Link>
      </div>

      <div className="fixed bottom-0 inset-x-0 border-t border-border/60 bg-background/95 px-5 py-3 backdrop-blur-xl">
        <div className="mx-auto max-w-lg">
          <Button onClick={finish} disabled={finishing} className="h-12 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
            {finishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Finish session
          </Button>
        </div>
      </div>
    </div>
  );
}
