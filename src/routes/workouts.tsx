import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Play, Calendar, Plus, Minus, Check, Loader2, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DEFAULT_WEIGHT_UNIT, unitsToWeightUnit, type WeightUnit } from "@/lib/units";

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

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const { data } = await supabase.from("workouts").select("*")
        .eq("user_id", user.id).gte("scheduled_date", today).neq("status", "completed")
        .order("scheduled_date", { ascending: true }).limit(7);
      setUpcoming((data ?? []) as any);
      setBusy(false);
    })();
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
          <Button size="icon" variant="outline" className="h-10 w-10 rounded-full border-border bg-surface">
            <Calendar className="h-4 w-4" />
          </Button>
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
  const [logId, setLogId] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [logs, setLogs] = useState<Record<string, { reps: string; weight: string; rpe: string; done: boolean }[]>>({});
  const [finishing, setFinishing] = useState(false);
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(DEFAULT_WEIGHT_UNIT);

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
        rpe: set.rpe ? parseFloat(set.rpe) : null,
        completed: true,
      });
    }
  };

  const addSet = (ex: string) => setLogs((l) => ({ ...l, [ex]: [...l[ex], { reps: "", weight: "", rpe: "", done: false }] }));
  const removeSet = (ex: string, idx: number) => setLogs((l) => ({ ...l, [ex]: l[ex].filter((_, i) => i !== idx) }));

  const finish = async () => {
    if (!user || !logId) return;
    setFinishing(true);
    const duration = Math.round((Date.now() - startedAt) / 60000);
    await supabase.from("workout_logs").update({ completed_at: new Date().toISOString(), duration_min: duration }).eq("id", logId);
    await supabase.from("workouts").update({ status: "completed" }).eq("id", workout.id);
    toast.success(`Session complete · ${duration} min 🔥`);
    // Fire-and-forget auto-adjust for next session
    supabase.functions.invoke("auto-adjust", { body: { trigger: "workout_complete", workout_log_id: logId } })
      .then(({ data }) => {
        const d = data as any;
        if (d?.should_adjust && d?.summary) toast.success(`Coach updated next session — ${d.summary}`, { duration: 6000 });
      })
      .catch(() => {});
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
              <div>
                <div className="font-semibold">{ex.name}</div>
                <div className="text-xs text-muted-foreground">Target: {ex.sets} × {ex.reps}{ex.rpe ? ` · RPE ${ex.rpe}` : ""}</div>
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 px-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                <div>#</div><div>Weight</div><div>Reps</div><div>RPE</div><div></div>
              </div>
              {logs[ex.name]?.map((s, i) => (
                <div key={i} className={cn("grid grid-cols-[24px_1fr_1fr_1fr_36px] items-center gap-2 rounded-lg p-1 transition-colors", s.done && "bg-primary/10")}>
                  <div className="text-center text-xs font-semibold text-muted-foreground">{i + 1}</div>
                  <Input inputMode="decimal" value={s.weight} onChange={(e) => updateSet(ex.name, i, "weight", e.target.value)} placeholder="kg" className="h-9 text-sm" />
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
