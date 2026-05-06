import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Apple, Loader2, Plus, Sparkles, Trash2, ArrowLeft, Target } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/nutrition")({
  head: () => ({ meta: [{ title: "Nutrition — Body Forge" }] }),
  component: Nutrition,
});

type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Meal = { id: string; name: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; eaten_at: string };

function Nutrition() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [busy, setBusy] = useState(true);
  const [adding, setAdding] = useState(false);
  const [calcing, setCalcing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [review, setReview] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle();
      setProfile(p);
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { data: m } = await supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", since.toISOString()).order("eaten_at", { ascending: false });
      setMeals((m ?? []) as Meal[]);
      setBusy(false);
    })();
  }, [user, loading, navigate]);

  const calcMacros = async () => {
    setCalcing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nutrition-coach", { body: { action: "calc_macros" } });
      if (error) throw error;
      const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
      setProfile(p);
      toast.success(`Targets set: ${data.calories} kcal · ${data.protein_g}g protein`);
    } catch (e) { toast.error("Couldn't calculate macros"); } finally { setCalcing(false); }
  };

  const suggestMeals = async () => {
    setSuggesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("nutrition-coach", { body: { action: "suggest_meals" } });
      if (error) throw error;
      setSuggestions(data.meals ?? []);
    } catch { toast.error("Couldn't fetch suggestions"); } finally { setSuggesting(false); }
  };

  const reviewDay = async () => {
    setReviewing(true);
    try {
      const { data, error } = await supabase.functions.invoke("nutrition-coach", { body: { action: "review_day" } });
      if (error) throw error;
      setReview(data);
    } catch { toast.error("Couldn't generate review"); } finally { setReviewing(false); }
  };

  const addMeal = async () => {
    if (!user || !form.name.trim()) return;
    const row = {
      user_id: user.id,
      name: form.name,
      calories: form.calories ? parseInt(form.calories) : null,
      protein_g: form.protein_g ? parseFloat(form.protein_g) : null,
      carbs_g: form.carbs_g ? parseFloat(form.carbs_g) : null,
      fat_g: form.fat_g ? parseFloat(form.fat_g) : null,
    };
    const { data, error } = await supabase.from("meal_logs").insert(row).select().single();
    if (error) { toast.error(error.message); return; }
    setMeals((m) => [data as Meal, ...m]);
    setForm({ name: "", calories: "", protein_g: "", carbs_g: "", fat_g: "" });
    setAdding(false);
    toast.success("Meal logged");
  };

  const removeMeal = async (id: string) => {
    await supabase.from("meal_logs").delete().eq("id", id);
    setMeals((m) => m.filter((x) => x.id !== id));
  };

  const addSuggested = async (s: any) => {
    if (!user) return;
    const { data } = await supabase.from("meal_logs").insert({
      user_id: user.id, name: s.title, calories: s.calories, protein_g: s.protein_g, carbs_g: s.carbs_g, fat_g: s.fat_g,
    }).select().single();
    if (data) setMeals((m) => [data as Meal, ...m]);
    toast.success(`Logged ${s.title}`);
  };

  if (loading || busy) return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;

  const targets: Macros | null = profile?.macro_targets ?? null;
  const totals = meals.reduce((a, m) => ({
    calories: a.calories + (m.calories ?? 0),
    protein_g: a.protein_g + Number(m.protein_g ?? 0),
    carbs_g: a.carbs_g + Number(m.carbs_g ?? 0),
    fat_g: a.fat_g + Number(m.fat_g ?? 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 });

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/" className="grid h-10 w-10 place-items-center rounded-full bg-surface"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <p className="text-sm text-muted-foreground">Today</p>
            <h1 className="text-2xl font-bold">Nutrition</h1>
          </div>
        </div>

        {!targets ? (
          <div className="mb-6 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Target className="h-3 w-3" /> Set your targets
            </div>
            <p className="mb-4 text-sm text-muted-foreground">Coach Forge will calculate your daily calories and macros from your goal, weight, and training volume.</p>
            <Button onClick={calcMacros} disabled={calcing} className="h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
              {calcing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />} Calculate macros
            </Button>
          </div>
        ) : (
          <div className="mb-5 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Today</div>
                <div className="text-2xl font-bold tabular-nums">{Math.round(totals.calories)} <span className="text-sm font-normal text-muted-foreground">/ {targets.calories} kcal</span></div>
              </div>
              <button onClick={calcMacros} disabled={calcing} className="text-xs font-medium text-primary">Recalc</button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MacroBar label="Protein" value={Math.round(totals.protein_g)} target={targets.protein_g} color="bg-primary" />
              <MacroBar label="Carbs" value={Math.round(totals.carbs_g)} target={targets.carbs_g} color="bg-accent" />
              <MacroBar label="Fat" value={Math.round(totals.fat_g)} target={targets.fat_g} color="bg-warning" />
            </div>
          </div>
        )}

        <div className="mb-3 flex gap-2">
          <Button onClick={() => setAdding(true)} variant="outline" className="flex-1 h-11 rounded-xl border-border bg-surface"><Plus className="mr-1 h-4 w-4" /> Log meal</Button>
          <Button onClick={suggestMeals} disabled={suggesting} variant="outline" className="flex-1 h-11 rounded-xl border-border bg-surface">
            {suggesting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Suggest
          </Button>
        </div>

        {adding && (
          <div className="mb-4 rounded-2xl border border-primary/30 bg-gradient-card p-4 space-y-2 shadow-card">
            <Input placeholder="Meal name (e.g. Chicken & rice)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10" />
            <div className="grid grid-cols-4 gap-2">
              <Input placeholder="kcal" inputMode="numeric" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} className="h-10" />
              <Input placeholder="P (g)" inputMode="decimal" value={form.protein_g} onChange={(e) => setForm({ ...form, protein_g: e.target.value })} className="h-10" />
              <Input placeholder="C (g)" inputMode="decimal" value={form.carbs_g} onChange={(e) => setForm({ ...form, carbs_g: e.target.value })} className="h-10" />
              <Input placeholder="F (g)" inputMode="decimal" value={form.fat_g} onChange={(e) => setForm({ ...form, fat_g: e.target.value })} className="h-10" />
            </div>
            <div className="flex gap-2">
              <Button onClick={addMeal} className="flex-1 h-10 rounded-xl bg-gradient-primary text-primary-foreground">Save</Button>
              <Button variant="outline" onClick={() => setAdding(false)} className="h-10 rounded-xl">Cancel</Button>
            </div>
          </div>
        )}

        {suggestions.length > 0 && (
          <div className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Coach suggestions</h3>
            <div className="space-y-2">
              {suggestions.map((s, i) => (
                <div key={i} className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] uppercase tracking-wider text-primary">{s.name}</div>
                      <div className="font-semibold">{s.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{s.calories} kcal · {s.protein_g}P / {s.carbs_g}C / {s.fat_g}F</div>
                      {s.prep && <p className="mt-1.5 text-xs text-muted-foreground">{s.prep}</p>}
                    </div>
                    <Button size="sm" onClick={() => addSuggested(s)} className="rounded-lg bg-gradient-primary text-primary-foreground">Log</Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <h3 className="mb-2 mt-2 text-sm font-semibold text-muted-foreground">Today's meals</h3>
        <div className="space-y-2">
          {meals.length === 0 && <p className="rounded-2xl border border-border/60 bg-gradient-card p-4 text-center text-sm text-muted-foreground">Nothing logged yet.</p>}
          {meals.map((m) => (
            <div key={m.id} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary"><Apple className="h-4 w-4" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold leading-tight truncate">{m.name}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{m.calories ?? "—"} kcal · {m.protein_g ?? 0}P / {m.carbs_g ?? 0}C / {m.fat_g ?? 0}F</div>
              </div>
              <button onClick={() => removeMeal(m.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
        </div>

        {meals.length > 0 && (
          <Button onClick={reviewDay} disabled={reviewing} variant="outline" className="mt-4 h-11 w-full rounded-xl border-primary/30 bg-surface">
            {reviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4 text-primary" />} Review my day
          </Button>
        )}

        {review && (
          <div className="mt-4 rounded-2xl border border-primary/30 bg-gradient-card p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-primary">Coach review</div>
              <div className="text-2xl font-bold text-gradient-primary">{review.score}</div>
            </div>
            <p className="text-sm">{review.summary}</p>
            {review.wins?.length > 0 && <div className="mt-3 text-xs"><span className="font-semibold text-success">Wins:</span> {review.wins.join(", ")}</div>}
            {review.fixes?.length > 0 && <div className="mt-1 text-xs"><span className="font-semibold text-warning">Fix:</span> {review.fixes.join(", ")}</div>}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function MacroBar({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}<span className="text-xs font-normal text-muted-foreground">/{target}g</span></div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
