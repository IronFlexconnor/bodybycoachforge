import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Flame, Play, MessageCircle, TrendingUp, Activity, Heart, Zap, ChevronRight, Loader2, Apple, Check, Crown, Sparkles, Video, ChefHat, Dumbbell } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import { AdjustmentsCard } from "@/components/AdjustmentsCard";
import { DailyFreshPicks } from "@/components/DailyFreshPicks";
import { celebrate } from "@/lib/celebrate";

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
  const { isActive, isTrialing } = useSubscription();
  const [profile, setProfile] = useState<any>(null);
  const [todayWorkout, setTodayWorkout] = useState<any>(null);
  const [stats, setStats] = useState({ workouts: 0, streak: 0, weekDone: 0, weekTotal: 0 });
  const [checkin, setCheckin] = useState<any>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/welcome" }); return; }
    (async () => {
      const today = new Date().toISOString().slice(0, 10);
      const startOfWeek = new Date();
      startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
      startOfWeek.setHours(0, 0, 0, 0);

      // Parallelize all initial reads — was 5 sequential round-trips, now 1.
      const [profileRes, workoutRes, checkinRes, weekDoneRes, totalRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("workouts").select("*")
          .eq("user_id", user.id).gte("scheduled_date", today)
          .order("scheduled_date", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("daily_checkins").select("*")
          .eq("user_id", user.id).eq("checkin_date", today).maybeSingle(),
        supabase.from("workout_logs").select("*", { count: "exact", head: true })
          .eq("user_id", user.id).gte("started_at", startOfWeek.toISOString()),
        supabase.from("workout_logs").select("*", { count: "exact", head: true }).eq("user_id", user.id),
      ]);

      const p = profileRes.data;
      if (!p?.onboarded) { navigate({ to: "/onboarding" }); return; }
      setProfile(p);
      setTodayWorkout(workoutRes.data);
      setCheckin(checkinRes.data);
      const weekDone = weekDoneRes.count;
      const total = totalRes.count;

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
        <div className="mb-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Good to see you,</p>
            <h1 className="text-2xl font-bold">{name} 👋</h1>
          </div>
          <Link to="/profile" className="grid h-11 w-11 place-items-center rounded-full bg-gradient-primary text-base font-bold text-primary-foreground shadow-glow">
            {name.slice(0, 1).toUpperCase()}
          </Link>
        </div>

        <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3 w-3" /> Expert mode · NSCA / ISSN / ACSM-grade
        </div>

        <div className="mb-5 flex gap-3">
          <Stat icon={Heart} value={readiness ? `${readiness}` : "—"} label="Readiness" />
          <Stat icon={Flame} value={`${stats.workouts}`} label="Total sessions" />
          <Stat icon={Activity} value={`${stats.weekDone}/${stats.weekTotal}`} label="This week" />
        </div>

        {/* One-tap quick actions */}
        <div className="mb-5 grid grid-cols-4 gap-2">
          <QuickAction to="/workouts" icon={Dumbbell} label="Log workout" />
          <QuickAction to="/form" icon={Video} label="Record form" />
          <QuickAction
            icon={ChefHat}
            label="New meals"
            onClick={() => {
              if (typeof window !== "undefined") sessionStorage.setItem("forge:open-regen", "1");
              navigate({ to: "/nutrition" });
            }}
          />
          <QuickAction to="/chat" icon={MessageCircle} label="Talk to Coach" />
        </div>

        {!checkin && (
          <CheckinCard onSaved={(c) => setCheckin(c)} />
        )}

        {!isActive && !isTrialing && (
          <Link
            to="/pricing"
            className="mb-6 flex items-center gap-3 rounded-2xl border border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 p-4 hover:border-primary/70"
          >
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Crown className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold">Unlock unlimited coaching</div>
              <div className="text-[11px] text-muted-foreground">7-day free trial · Cancel anytime</div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        )}

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

        <AdjustmentsCard />

        <DailyFreshPicks />

        <Link to="/form" className="mb-3 flex items-center gap-4 rounded-2xl border border-primary/30 bg-gradient-card p-4 shadow-card hover:border-primary/60">
          <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold">Analyze my form</div>
            <p className="truncate text-sm text-muted-foreground">Video or photo · graded in seconds</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground" />
        </Link>

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
          <Link to="/nutrition" className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card hover:border-primary/40">
            <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><Apple className="h-3.5 w-3.5" /> Nutrition</div>
            <div className="text-xl font-bold text-gradient-primary">{profile?.macro_targets?.calories ?? "Set"}</div>
            <div className="mt-1 text-xs text-muted-foreground">Daily target</div>
          </Link>
          <Card icon={TrendingUp} title="Adherence" value={`${Math.round(((stats.weekDone) / Math.max(1, stats.weekTotal)) * 100)}%`} sub="This week" />
        </div>

        <button
          onClick={() => {
            if (typeof window !== "undefined") sessionStorage.setItem("forge:open-regen", "1");
            navigate({ to: "/nutrition" });
          }}
          className="group relative mt-4 flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-primary/30 bg-gradient-card p-4 text-left shadow-card hover:border-primary/60"
        >
          <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="relative flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Fresh meals ready</div>
            <div className="font-semibold leading-tight">8 brand-new meals waiting for you</div>
            <p className="truncate text-xs text-muted-foreground">Tap to see prep videos & swap into your plan</p>
          </div>
          <ChevronRight className="relative h-5 w-5 text-muted-foreground" />
        </button>

        <Button
          onClick={() => {
            if (typeof window !== "undefined") sessionStorage.setItem("forge:autogen-plan", "1");
            navigate({ to: "/nutrition" });
          }}
          className="mt-3 h-12 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow"
        >
          <Sparkles className="mr-2 h-4 w-4" /> Generate my meal plan
        </Button>
      </div>
    </AppShell>
  );
}

function CheckinCard({ onSaved }: { onSaved: (c: any) => void }) {
  const { user } = useAuth();
  const [energy, setEnergy] = useState(7);
  const [soreness, setSoreness] = useState(3);
  const [stress, setStress] = useState(4);
  const [sleep, setSleep] = useState(7.5);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.from("daily_checkins").insert({
      user_id: user.id, checkin_date: today, energy, soreness, stress, sleep_hours: sleep,
    }).select().single();
    if (error) { toast.error(error.message); setSaving(false); return; }
    toast.success("Check-in saved — Coach will tune today's session");
    celebrate();
    onSaved(data);
    // Trigger auto-adjust based on readiness
    supabase.functions.invoke("auto-adjust", { body: { trigger: "checkin", auto_apply: true } })
      .then(({ data: a }) => {
        const d = a as any;
        if (d?.should_adjust && d?.summary) toast.success(`Plan tuned — ${d.summary}`, { duration: 6000 });
      }).catch(() => {});
    setSaving(false);
  };

  return (
    <div className="mb-5 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
      <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
        Daily check-in
      </div>
      <p className="mb-3 text-sm text-muted-foreground">30 seconds — helps Coach tune today's session.</p>
      <div className="space-y-3">
        <Slider label="Energy" value={energy} setValue={setEnergy} max={10} suffix="/10" />
        <Slider label="Muscle soreness" value={soreness} setValue={setSoreness} max={10} suffix="/10" />
        <Slider label="Stress" value={stress} setValue={setStress} max={10} suffix="/10" />
        <Slider label="Sleep" value={sleep} setValue={setSleep} max={12} step={0.5} suffix=" h" />
      </div>
      <Button onClick={save} disabled={saving} className="mt-4 h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />} Save check-in
      </Button>
    </div>
  );
}

function Slider({ label, value, setValue, max, step = 1, suffix }: { label: string; value: number; setValue: (n: number) => void; max: number; step?: number; suffix?: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold tabular-nums">{value}{suffix ?? ""}</span>
      </div>
      <input type="range" min={0} max={max} step={step} value={value} onChange={(e) => setValue(parseFloat(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary" />
    </div>
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

function QuickAction({ to, onClick, icon: Icon, label }: { to?: string; onClick?: () => void; icon: typeof Heart; label: string }) {
  const inner = (
    <>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
        <Icon className="h-5 w-5" />
      </span>
      <span className="text-[11px] font-semibold leading-tight text-center">{label}</span>
    </>
  );
  const cls = "flex flex-col items-center gap-1.5 rounded-2xl border border-border/60 bg-gradient-card p-2.5 shadow-card hover:border-primary/40 active:scale-95 transition";
  if (to) return <Link to={to} className={cls}>{inner}</Link>;
  return <button onClick={onClick} className={cls}>{inner}</button>;
}
