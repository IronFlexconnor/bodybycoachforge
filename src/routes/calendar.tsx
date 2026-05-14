import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Calendar as CalendarIcon, TrendingUp, Sparkles, Dumbbell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Calendar } from "@/components/ui/calendar";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Body Forge" }] }),
  component: CalendarPage,
});

type WorkoutLog = {
  id: string;
  workout_id: string | null;
  started_at: string;
  completed_at: string | null;
  duration_min: number | null;
};
type SetLog = {
  id: string;
  workout_log_id: string | null;
  exercise_name: string;
  set_number: number;
  reps: number | null;
  weight: number | null;
  weight_unit: string | null;
  rpe: number | null;
  created_at: string;
};

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function CalendarPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(true);
  const [logs, setLogs] = useState<WorkoutLog[]>([]);
  const [sets, setSets] = useState<SetLog[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Date | undefined>(new Date());

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const since = new Date(); since.setMonth(since.getMonth() - 6);
      const [{ data: wl }, { data: sl }] = await Promise.all([
        supabase.from("workout_logs").select("id, workout_id, started_at, completed_at, duration_min")
          .eq("user_id", user.id).not("completed_at", "is", null)
          .gte("started_at", since.toISOString())
          .order("completed_at", { ascending: false }),
        supabase.from("set_logs").select("id, workout_log_id, exercise_name, set_number, reps, weight, weight_unit, rpe, created_at")
          .eq("user_id", user.id).eq("completed", true)
          .gte("created_at", since.toISOString())
          .order("set_number", { ascending: true }),
      ]);
      const wls = (wl ?? []) as WorkoutLog[];
      setLogs(wls);
      setSets((sl ?? []) as SetLog[]);
      const wIds = Array.from(new Set(wls.map(w => w.workout_id).filter(Boolean))) as string[];
      if (wIds.length) {
        const { data: ws } = await supabase.from("workouts").select("id, title").in("id", wIds);
        const map: Record<string, string> = {};
        (ws ?? []).forEach((w: any) => { map[w.id] = w.title; });
        setTitles(map);
      }
      setBusy(false);
    })();
  }, [user, loading, navigate]);

  const completedDays = useMemo(() => {
    const set = new Set<string>();
    logs.forEach(l => l.completed_at && set.add(dayKey(l.completed_at)));
    return set;
  }, [logs]);

  const completedDateObjs = useMemo(
    () => Array.from(completedDays).map(k => {
      const [y, m, d] = k.split("-").map(Number);
      return new Date(y, m - 1, d);
    }),
    [completedDays]
  );

  const selectedKey = selected ? dayKey(selected.toISOString()) : "";
  const dayLogs = useMemo(
    () => logs.filter(l => l.completed_at && dayKey(l.completed_at) === selectedKey),
    [logs, selectedKey]
  );

  const dayExercises = useMemo(() => {
    const ids = new Set(dayLogs.map(l => l.id));
    const grouped: Record<string, SetLog[]> = {};
    sets.filter(s => s.workout_log_id && ids.has(s.workout_log_id)).forEach(s => {
      (grouped[s.exercise_name] ??= []).push(s);
    });
    Object.values(grouped).forEach(arr => arr.sort((a, b) => a.set_number - b.set_number));
    return grouped;
  }, [sets, dayLogs]);

  const coachNote = useMemo(() => {
    if (!dayLogs.length) return null;
    const exNames = Object.keys(dayExercises);
    if (!exNames.length) return "Session logged — every rep counts. Keep showing up. 💪";
    // Find a PR or improvement vs previous occurrences
    const dayTime = new Date(dayLogs[0].completed_at!).getTime();
    let bestNote: string | null = null;
    for (const name of exNames) {
      const today = dayExercises[name];
      const todayMax = Math.max(...today.map(s => Number(s.weight) || 0));
      if (!todayMax) continue;
      const prior = sets.filter(s =>
        s.exercise_name === name &&
        s.workout_log_id &&
        !dayLogs.find(l => l.id === s.workout_log_id) &&
        new Date(s.created_at).getTime() < dayTime
      );
      const priorMax = prior.length ? Math.max(...prior.map(s => Number(s.weight) || 0)) : 0;
      const unit = today[0]?.weight_unit ?? "lb";
      if (priorMax && todayMax > priorMax) {
        const diff = +(todayMax - priorMax).toFixed(1);
        bestNote = `Huge — you pushed ${name} up by ${diff}${unit} from your previous best. That's real progress. 🔥`;
        break;
      } else if (!prior.length) {
        bestNote ??= `First time logging ${name} at ${todayMax}${unit} — baseline locked in. Build from here. 💪`;
      } else if (todayMax === priorMax) {
        bestNote ??= `Matched your best on ${name} — consistency is what builds champions. Stay with it.`;
      }
    }
    return bestNote ?? "Solid work on this session — every log moves the needle. 👊";
  }, [dayExercises, dayLogs, sets]);

  if (loading || busy) {
    return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="px-5 pt-12 pb-6">
        <div className="mb-6">
          <p className="text-sm text-muted-foreground">Your training history</p>
          <h1 className="text-2xl font-bold">Calendar</h1>
        </div>

        <div className="mb-5 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-muted-foreground">
              <CalendarIcon className="h-3.5 w-3.5" />
              <span>{logs.length} completed sessions</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-primary shadow-glow" />
              <span className="text-muted-foreground">Trained</span>
            </div>
          </div>
          <Calendar
            mode="single"
            selected={selected}
            onSelect={setSelected}
            modifiers={{ completed: completedDateObjs }}
            modifiersClassNames={{
              completed: "relative after:absolute after:bottom-1 after:left-1/2 after:-translate-x-1/2 after:h-1 after:w-1 after:rounded-full after:bg-primary after:shadow-glow",
            }}
            className="pointer-events-auto mx-auto"
          />
        </div>

        {selected && (
          <div className="mb-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">
                {selected.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </h2>
              {dayLogs[0]?.duration_min && (
                <span className="text-xs text-muted-foreground">{dayLogs[0].duration_min} min</span>
              )}
            </div>

            {dayLogs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/60 bg-surface/40 p-6 text-center">
                <Dumbbell className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No session logged on this day.</p>
              </div>
            ) : (
              <>
                {coachNote && (
                  <div className="mb-3 flex items-start gap-2 rounded-2xl border border-primary/30 bg-primary/5 p-3">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm leading-snug">{coachNote}</p>
                  </div>
                )}

                {dayLogs.map(l => {
                  const exNames = Object.keys(dayExercises).filter(n =>
                    sets.some(s => s.workout_log_id === l.id && s.exercise_name === n)
                  );
                  return (
                    <div key={l.id} className="mb-3 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
                      <div className="mb-3 flex items-center justify-between">
                        <div className="font-semibold">{titles[l.workout_id ?? ""] ?? "Training session"}</div>
                        <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          {exNames.length} exercise{exNames.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      {exNames.length === 0 ? (
                        <p className="text-xs text-muted-foreground">Session completed — no individual sets logged.</p>
                      ) : (
                        <div className="space-y-3">
                          {exNames.map(name => {
                            const exSets = sets.filter(s => s.workout_log_id === l.id && s.exercise_name === name)
                              .sort((a, b) => a.set_number - b.set_number);
                            const top = Math.max(...exSets.map(s => Number(s.weight) || 0));
                            const unit = exSets[0]?.weight_unit ?? "lb";
                            return (
                              <div key={name} className="rounded-xl border border-border/40 bg-surface/40 p-3">
                                <div className="mb-2 flex items-center justify-between">
                                  <div className="font-medium text-sm">{name}</div>
                                  {top > 0 && (
                                    <div className="flex items-center gap-1 text-[11px] font-semibold text-primary">
                                      <TrendingUp className="h-3 w-3" />
                                      Top {top}{unit}
                                    </div>
                                  )}
                                </div>
                                <div className="space-y-1">
                                  {exSets.map(s => (
                                    <div key={s.id} className={cn(
                                      "grid grid-cols-[28px_1fr_1fr_1fr] items-center gap-2 rounded-lg px-2 py-1.5 text-xs",
                                      "bg-background/40"
                                    )}>
                                      <div className="text-center font-semibold text-muted-foreground">{s.set_number}</div>
                                      <div><span className="font-semibold">{s.weight ?? "—"}</span><span className="text-muted-foreground">{s.weight != null ? (s.weight_unit ?? unit) : ""}</span></div>
                                      <div><span className="font-semibold">{s.reps ?? "—"}</span> <span className="text-muted-foreground">reps</span></div>
                                      <div className="text-muted-foreground">{s.rpe != null ? `RPE ${s.rpe}` : ""}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
