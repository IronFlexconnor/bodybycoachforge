import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Play, MessageCircle, TrendingUp, Activity, Heart, Zap, ChevronRight, Loader2, Apple, Check } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Today — Body Forge AI Coach" },
      { name: "description", content: "Your daily training plan, AI coach, and progress at a glance." },
    ],
  }),
  component: Home,
});

function Home() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [todayWorkout, setTodayWorkout] = useState<any>(null);
  const [stats, setStats] = useState({ workouts: 0, streak: 0, weekDone: 0, weekTotal: 0 });
  const [checkin, setCheckin] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/welcome" }); return; }
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      if (!p?.onboarded) { navigate({ to: "/onboarding" }); return; }
      setProfile(p);

      const today = new Date().toISOString().slice(0, 10);
      const { data: w } = await supabase.from("workouts").select("*")
        .eq("user_id", user.id).gte("scheduled_date", today)
        .order("scheduled_date", { ascending: true }).limit(1).maybeSingle();
      setTodayWorkout(w);

      const { data: c } = await supabase.from("daily_checkins").select("*")
        .eq("user_id", user.id).eq("checkin_date", today).maybeSingle();
      setCheckin(c);

      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      const { count: weekDone } = await supabase.from("workout_logs").select("*", { count: "exact", head: true })
        .eq("user_id", user.id).gte("started_at", startOfWeek.toISOString());
      const { count: total } = await supabase.from("workout_logs").select("*", { count: "exact", head: true }).eq("user_id", user.id);

      setStats({
        workouts: total ?? 0,
        streak: total ?? 0,
        weekDone: weekDone ?? 0,
        weekTotal: p.days_per_week ?? 4,
      });
      setBusy(false);
    })();
  }, [user, loading, navigate]);

  const readiness = checkin ? Math.round(((checkin.energy ?? 5) * 7 + (10 - (checkin.soreness ?? 5)) * 6 + (10 - (checkin.stress ?? 5)) * 4 + Math.min(10, (checkin.sleep_hours ?? 7)) * 3) / 2) : null;

  if (loading || busy) {
    return (
      <AppShell>
        <div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      </AppShell>
    );
  }

  const name = profile?.name || "Athlete";
  const exCount = Array.isArray(todayWorkout?.exercises) ? todayWorkout.exercises.length : 0;
  const setCount = Array.isArray(todayWorkout?.exercises)
    ? todayWorkout.exercises.reduce((a: number, e: any) => a + (Number(e.sets) || 0), 0) : 0;

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Good to see you,</p>
            <h1 className="text-2xl font-bold">{name} 👋</h1>
          </div>
          <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-full bg-gradient-primary text-base font-bold text-primary-foreground shadow-glow">
            {name.slice(0, 1).toUpperCase()}
          </Link>
        </div>

        <div className="mb-5 flex gap-3">
          <Stat icon={Heart} value="86" label="Readiness" />
          <Stat icon={Flame} value={`${stats.workouts}`} label="Total sessions" />
          <Stat icon={Activity} value={`${stats.weekDone}/${stats.weekTotal}`} label="This week" />
        </div>

        {todayWorkout ? (
          <Link to="/workouts" className="group relative mb-6 block overflow-hidden rounded-3xl border border-primary/20 bg-gradient-card p-6 shadow-card">
            <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative">
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                <Zap className="h-3 w-3" /> Next Session
              </div>
              <h2 className="mb-1 text-2xl font-bold">{todayWorkout.title}</h2>
              <p className="mb-5 text-sm text-muted-foreground">{exCount} exercises · {setCount} sets · {todayWorkout.focus ?? ""}</p>
              <Button className="h-12 w-full rounded-xl bg-gradient-primary text-sm font-semibold text-primary-foreground shadow-glow">
                <Play className="mr-2 h-4 w-4 fill-current" /> Start workout
              </Button>
            </div>
          </Link>
        ) : (
          <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-6 text-center shadow-card">
            <p className="text-sm text-muted-foreground">No upcoming sessions. Open Coach to plan your next block.</p>
          </div>
        )}

        <Link to="/chat" className="mb-6 flex items-center gap-4 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card hover:border-primary/40">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold">Coach Forge</span>
              <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
            </div>
            <p className="truncate text-sm text-muted-foreground">Ready when you are — ask me anything.</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Quick view</h3>
          <Link to="/progress" className="text-sm font-medium text-primary">See progress</Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Card icon={TrendingUp} title="Adherence" value={`${Math.round(((stats.weekDone) / Math.max(1, stats.weekTotal)) * 100)}%`} sub="This week" />
          <Card icon={Activity} title="Program" value={profile?.goal ?? "—"} sub="Active goal" />
        </div>
      </div>
    </AppShell>
  );
}

function Stat({ icon: Icon, value, label }: { icon: typeof Heart; value: string; label: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-border/60 bg-gradient-card p-3 shadow-card">
      <Icon className="mb-1.5 h-4 w-4 text-primary" />
      <div className="text-lg font-bold tabular-nums leading-none">{value}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

function Card({ icon: Icon, title, value, sub }: { icon: typeof TrendingUp; title: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {title}</div>
      <div className="text-xl font-bold text-gradient-primary">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}
