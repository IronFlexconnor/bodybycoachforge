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
import { computeSessionSummary, recommendFromHistory, type OverloadRec } from "@/lib/overload";

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
            <h1 className="page-title">Upcoming sessions</h1>
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
  const [lastByExercise, setLastByExercise] = useState<Record<string, { weight: number | null; reps: number | null; rpe: number | null; unit: string | null; date: string } | null>>({});
  const [recByExercise, setRecByExercise] = useState<Record<string, OverloadRec | null>>({});
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
        .select("exercise_name, weight, reps, rpe, weight_unit, workout_log_id, created_at")
        .eq("user_id", user.id)
        .in("exercise_name", names)
        .order("created_at", { ascending: false })
        .limit(400);
      const lastMap: typeof lastByExercise = {};
      const recMap: typeof recByExercise = {};
      // Group by exercise; find most recent workout_log_id per exercise, then top set within it.
      const byEx: Record<string, any[]> = {};
      (data ?? []).forEach((row: any) => {
        (byEx[row.exercise_name] ??= []).push(row);
      });
      for (const [name, rows] of Object.entries(byEx)) {
        const mostRecent = rows[0];
        if (mostRecent?.weight != null) {
          lastMap[name] = {
            weight: mostRecent.weight,
            reps: mostRecent.reps,
            rpe: mostRecent.rpe,
            unit: mostRecent.weight_unit,
            date: mostRecent.created_at,
          };
        }
        // Top set from the most recent session (or fall back to last set)
        const sessionRows = mostRecent?.workout_log_id
          ? rows.filter((r) => r.workout_log_id === mostRecent.workout_log_id)
          : rows.slice(0, 1);
        const withWeight = sessionRows.filter((r) => r.weight != null);
        if (withWeight.length) {
          const top = withWeight.sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0) || (b.reps ?? 0) - (a.reps ?? 0))[0];
          recMap[name] = recommendFromHistory(
            name,
            { weight: top.weight, reps: top.reps, rpe: top.rpe },
            weightUnit,
          );
        }
      }
      setLastByExercise(lastMap);
      setRecByExercise(recMap);
    })();
  }, [user, workout, weightUnit]);

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

    // Progressive-overload recommendations (see src/lib/overload.ts + unit tests)
    const { recs, totals } = computeSessionSummary(workout.exercises, logs, weightUnit);

    // Show summary first; auto-adjust runs in parallel and updates coachNote on arrival
    setSummary({ durationMin: duration, ...totals, recs });

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
        <button onClick={onClose} aria-label="Close workout" className="grid h-9 w-9 place-items-center rounded-full bg-surface"><X aria-hidden="true" className="h-4 w-4" /></button>
        <div className="text-center">
          <div className="text-xs text-muted-foreground">In progress</div>
          <div className="font-semibold">{workout.title}</div>
        </div>
        <div className="w-9" />
      </div>

      <div className="px-5 pt-6 space-y-4">
        {workout.exercises.map((ex) => {
          const last = lastByExercise[ex.name];
          const rec = recByExercise[ex.name];
          return (
          <div key={ex.name} className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
            <div className="mb-3 flex items-baseline justify-between">
              <div className="min-w-0">
                <div className="font-semibold truncate">{ex.name}</div>
                <div className="text-xs text-muted-foreground">Target: {ex.sets} × {ex.reps}{ex.rpe ? ` · RPE ${ex.rpe}` : ""}</div>
                {last ? (
                  <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                    Last: {last.weight}{last.unit ?? weightUnit} × {last.reps ?? "—"}
                  </div>
                ) : (
                  <div className="mt-1 text-[10px] text-muted-foreground">First time logging — set your baseline 💪</div>
                )}
              </div>
              <button onClick={() => analyzeExercise(ex.name)} className="ml-3 grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-primary/30 bg-primary/10 text-primary transition-colors hover:border-primary" aria-label={`Analyze ${ex.name} form`}>
                <Video className="h-4 w-4" />
              </button>
            </div>
            {rec && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/15 to-primary/5 p-2.5">
                <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
                  <TrendingUp className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">Try this week</div>
                  <div className="text-sm font-semibold leading-tight">
                    {rec.nextWeight}{weightUnit} × {rec.topReps || ex.reps}
                    <span className="ml-1.5 text-[11px] font-medium text-muted-foreground">
                      (last: {rec.topWeight}{weightUnit} × {rec.topReps}{rec.rpe != null ? ` @ RPE ${rec.rpe}` : ""})
                    </span>
                  </div>
                  <div className="mt-0.5 text-[11px] italic text-muted-foreground">{rec.verdict}</div>
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>#</div><div>Weight ({weightUnit})</div><div>Reps</div><div>RPE</div><div></div>
              </div>
              {logs[ex.name]?.map((s, i) => (
                <div key={i} className={cn("grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 rounded-lg p-1 transition-colors", s.done && "bg-primary/10")}>
                  <div className="text-center text-xs font-semibold text-muted-foreground">{i + 1}</div>
                  <Input inputMode="decimal" aria-label={`${ex.name} set ${i + 1} weight in ${weightUnit}`} value={s.weight} onChange={(e) => updateSet(ex.name, i, "weight", e.target.value)} placeholder={rec?.nextWeight != null ? String(rec.nextWeight) : last?.weight != null ? String(last.weight) : weightUnit} className="h-9 text-sm" />
                  <Input inputMode="numeric" aria-label={`${ex.name} set ${i + 1} reps`} value={s.reps} onChange={(e) => updateSet(ex.name, i, "reps", e.target.value)} placeholder={ex.reps} className="h-9 text-sm" />
                  <Input inputMode="decimal" aria-label={`${ex.name} set ${i + 1} RPE`} value={s.rpe} onChange={(e) => updateSet(ex.name, i, "rpe", e.target.value)} placeholder="—" className="h-9 text-sm" />
                  <button onClick={() => toggleDone(ex.name, i)}
                    aria-label={`Mark ${ex.name} set ${i + 1} ${s.done ? "not done" : "done"}`}
                    aria-pressed={s.done}
                    className={cn("grid h-9 w-9 place-items-center rounded-lg",
                      s.done ? "bg-gradient-primary text-primary-foreground shadow-glow" : "bg-surface text-muted-foreground")}>
                    <Check aria-hidden="true" className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <button onClick={() => addSet(ex.name)} className="flex-1 rounded-lg border border-dashed border-border py-2 text-xs font-medium text-muted-foreground hover:border-primary hover:text-primary">
                  <Plus aria-hidden="true" className="mr-1 inline h-3 w-3" /> Add set
                </button>
                {logs[ex.name]?.length > 1 && (
                  <button onClick={() => removeSet(ex.name, logs[ex.name].length - 1)} aria-label={`Remove last ${ex.name} set`} className="rounded-lg border border-dashed border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-destructive">
                    <Minus aria-hidden="true" className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
          );
        })}
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

      {summary && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/85 backdrop-blur-md sm:items-center" role="dialog" aria-modal="true">
          <div className="relative max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border/60 bg-gradient-card shadow-card sm:rounded-3xl">
            <div className="px-6 pt-7 pb-3 text-center">
              <div className="mx-auto mb-2 grid h-12 w-12 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
                <Check className="h-6 w-6" />
              </div>
              <h2 className="text-xl font-bold">Session complete</h2>
              <p className="mt-1 text-sm text-muted-foreground">{summary.durationMin} min · {summary.totalSets} sets · {Math.round(summary.totalVolume).toLocaleString()} {weightUnit} of total volume</p>
            </div>

            <div className="px-6 pt-2 pb-6 space-y-4">
              <div>
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  Progressive overload — try next week
                </div>
                {summary.recs.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border/60 p-4 text-center text-xs text-muted-foreground">
                    Log weight + reps on at least one set next time to unlock per-lift recommendations.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {summary.recs.map((r) => (
                      <div key={r.exercise} className="rounded-xl border border-border/60 bg-surface/50 p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold">{r.exercise}</div>
                            <div className="text-[11px] text-muted-foreground">
                              Today: <span className="font-medium text-foreground">{r.topWeight}{weightUnit} × {r.topReps}</span>
                              {r.rpe != null && <> @ RPE {r.rpe}</>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 rounded-lg bg-primary/10 px-2.5 py-1.5 text-primary">
                            <ArrowRight className="h-3.5 w-3.5" />
                            <span className="text-sm font-bold tabular-nums">{r.nextWeight}{weightUnit}</span>
                            <span className="text-[10px] font-semibold opacity-80">
                              {r.deltaPct > 0 ? `+${r.deltaPct}%` : r.deltaPct < 0 ? `${r.deltaPct}%` : "hold"}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 text-[11px] italic text-muted-foreground">{r.verdict}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {summary.coachNote && (
                <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-primary">
                    <Sparkles className="h-3.5 w-3.5" /> Coach updated next session
                  </div>
                  <div className="text-xs text-foreground/90">{summary.coachNote}</div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 pt-1">
                <Button variant="outline" className="h-11 rounded-xl" onClick={() => { closeSummary(); navigate({ to: "/calendar" }); }}>
                  View history
                </Button>
                <Button className="h-11 rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow" onClick={closeSummary}>
                  Done
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
