import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { TrendingUp, Award, Flame, Activity, Sparkles, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_UNITS, type Units, kgToLb, weightLabel } from "@/lib/units";

export const Route = createFileRoute("/progress")({
  head: () => ({ meta: [{ title: "Progress — Body Forge" }] }),
  component: Progress,
});

function Progress() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [stats, setStats] = useState({ workouts: 0, prs: 0, volume: 0, sessions: 0 });
  const [lifts, setLifts] = useState<{ name: string; current: number; trend: number[] }[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const since = new Date(Date.now() - 56 * 24 * 60 * 60 * 1000).toISOString();
      const { data: prof } = await supabase.from("profiles").select("units").eq("user_id", user.id).maybeSingle();
      if (prof?.units === "metric" || prof?.units === "imperial") setUnits(prof.units);
      const { data: logs, count } = await supabase.from("workout_logs").select("*", { count: "exact" })
        .eq("user_id", user.id).gte("started_at", since);
      const { data: sets } = await supabase.from("set_logs").select("exercise_name, weight, reps, created_at")
        .eq("user_id", user.id).gte("created_at", since).order("created_at");

      const totalVolume = (sets ?? []).reduce((a, s) => a + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0);

      // Top 3 exercises by frequency
      const freq: Record<string, { weights: number[]; max: number }> = {};
      (sets ?? []).forEach((s) => {
        if (!freq[s.exercise_name]) freq[s.exercise_name] = { weights: [], max: 0 };
        const w = Number(s.weight) || 0;
        freq[s.exercise_name].weights.push(w);
        if (w > freq[s.exercise_name].max) freq[s.exercise_name].max = w;
      });
      const top = Object.entries(freq)
        .sort((a, b) => b[1].weights.length - a[1].weights.length)
        .slice(0, 3)
        .map(([name, v]) => ({ name, current: v.max, trend: v.weights.slice(-8) }));

      setLifts(top);
      setStats({ workouts: count ?? 0, prs: top.length, volume: Math.round(totalVolume), sessions: logs?.length ?? 0 });
      setLoadingData(false);
    })();
  }, [user, loading, navigate]);

  if (loading || loadingData) return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <h1 className="mb-1 text-2xl font-bold">Progress</h1>
        <p className="mb-6 text-sm text-muted-foreground">Last 8 weeks</p>

        <div className="mb-6 grid grid-cols-2 gap-3">
          <BigStat icon={Flame} value={`${stats.workouts}`} label="Workouts" sub="Logged sessions" />
          <BigStat icon={Award} value={`${stats.prs}`} label="Tracked lifts" sub="In rotation" />
          <BigStat icon={Activity} value={`${(stats.volume / 1000).toFixed(1)}k`} label="Total volume" sub="kg lifted" />
          <BigStat icon={TrendingUp} value={`${stats.sessions}`} label="Completed" sub="On schedule" />
        </div>

        <div className="mb-6 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
          <div className="mb-3 flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-primary text-primary-foreground"><Sparkles className="h-4 w-4" /></div>
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-primary">AI Weekly Review</div>
              <div className="text-xs text-muted-foreground">Ask Coach Forge for a deep review</div>
            </div>
          </div>
          <p className="text-sm leading-relaxed text-foreground/90">
            {stats.workouts === 0
              ? "Log your first session to unlock personalized weekly reviews."
              : `You've logged ${stats.workouts} sessions and moved ${(stats.volume / 1000).toFixed(1)}k kg of total volume. Open the chat for a full breakdown and recommendations.`}
          </p>
        </div>

        {lifts.length > 0 && <h2 className="mb-3 text-lg font-semibold">Strength trends</h2>}
        <div className="space-y-3">
          {lifts.map((lift) => (
            <div key={lift.name} className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
              <div className="mb-3 flex items-baseline justify-between">
                <div>
                  <div className="font-semibold">{lift.name}</div>
                  <div className="text-2xl font-bold tabular-nums">{lift.current}kg</div>
                </div>
                <div className="rounded-full bg-primary/15 px-2.5 py-1 text-xs font-semibold text-primary">{lift.trend.length} sets</div>
              </div>
              <Sparkline data={lift.trend.length > 1 ? lift.trend : [lift.current, lift.current]} />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}

function BigStat({ icon: Icon, value, label, sub }: { icon: typeof Flame; value: string; label: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
      <Icon className="mb-2 h-4 w-4 text-primary" />
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      <div className="text-xs font-medium">{label}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{sub}</div>
    </div>
  );
}

function Sparkline({ data }: { data: number[] }) {
  const max = Math.max(...data); const min = Math.min(...data); const range = max - min || 1;
  const w = 280, h = 50;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`).join(" ");
  const area = `0,${h} ${pts} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-12 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.78 0.17 165)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="oklch(0.78 0.17 165)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill="url(#sparkFill)" />
      <polyline points={pts} fill="none" stroke="oklch(0.78 0.17 165)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
