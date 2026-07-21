import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Apple, Loader2, Plus, Sparkles, Trash2, ArrowLeft, Target, ChefHat, ChevronDown, ShoppingCart, BookOpen, PlayCircle, RefreshCcw, Wand2, Zap } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { buildMealPlan, calculateMacroTargets, reviewLoggedMeals } from "../../supabase/functions/nutrition-coach/planner";
import { MealRegenerationModal } from "@/components/MealRegenerationModal";
import { MealPrepVideo } from "@/components/MealPrepVideo";

export const Route = createFileRoute("/nutrition")({
  head: () => ({ meta: [{ title: "Nutrition — Body Forge" }] }),
  component: Nutrition,
});

type Macros = { calories: number; protein_g: number; carbs_g: number; fat_g: number };
type Meal = { id: string; name: string; calories: number | null; protein_g: number | null; carbs_g: number | null; fat_g: number | null; eaten_at: string };

function nutritionErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.includes("non-2xx") || message.includes("FunctionsHttpError") ? fallback : message || fallback;
}

function suggestedMealsFromPlan(plan: any, preset?: string) {
  const text = String(preset ?? "").toLowerCase();
  let meals = [...(plan.days?.[0]?.meals ?? [])];
  if (text.includes("high-protein")) meals = meals.sort((a, b) => Number(b.protein_g) - Number(a.protein_g)).slice(0, 3);
  else if (text.includes("post-workout")) meals = meals.filter((m) => /snack|post|lunch/i.test(String(m.slot))).slice(0, 3);
  else if (text.includes("swap")) meals = (plan.days?.slice(1).flatMap((d: any) => d.meals ?? []) ?? []).slice(0, 3);
  else meals = meals.slice(0, 4);
  return meals.map((meal: any) => ({
    name: meal.slot,
    title: meal.title,
    calories: meal.calories,
    protein_g: meal.protein_g,
    carbs_g: meal.carbs_g,
    fat_g: meal.fat_g,
    ingredients: meal.ingredients_with_units,
    prep: meal.instructions?.join(" "),
    prep_video: meal.prep_video,
  }));
}

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
  const [planning, setPlanning] = useState(false);
  const [plan, setPlan] = useState<any>(null);
  const [planPrompt, setPlanPrompt] = useState("");
  const [openDay, setOpenDay] = useState<number | null>(0);
  const [openPrep, setOpenPrep] = useState<string | null>(null);
  const [libCat, setLibCat] = useState<"Breakfast" | "Lunch" | "Dinner" | "Snack">("Breakfast");
  const [libOpen, setLibOpen] = useState<string | null>(null);
  const [regenOpen, setRegenOpen] = useState(false);
  const [regenPrompt, setRegenPrompt] = useState<string | undefined>();

  const openRegen = (prompt?: string) => { setRegenPrompt(prompt); setRegenOpen(true); };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    (async () => {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      // Parallelize profile + meals
      const [profRes, mealsRes] = await Promise.all([
        supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle(),
        supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", since.toISOString()).order("eaten_at", { ascending: false }),
      ]);
      setProfile(profRes.data);
      setMeals((mealsRes.data ?? []) as Meal[]);
      setBusy(false);
      if (typeof window !== "undefined" && sessionStorage.getItem("forge:autogen-plan") === "1") {
        sessionStorage.removeItem("forge:autogen-plan");
        setTimeout(() => generatePlan(), 200);
      }
      if (typeof window !== "undefined") {
        const regenFlag = sessionStorage.getItem("forge:open-regen");
        if (regenFlag) {
          sessionStorage.removeItem("forge:open-regen");
          setTimeout(() => openRegen(regenFlag === "1" ? undefined : regenFlag), 250);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, loading, navigate]);

  const calcMacros = async () => {
    setCalcing(true);
    try {
      const nutritionPrefs = profile?.nutrition_preferences ?? {};
      const data = calculateMacroTargets(profile ?? {}, nutritionPrefs, null, []);
      if (user) await supabase.from("profiles").update({ macro_targets: data }).eq("user_id", user.id);
      setProfile((p: any) => p ? { ...p, macro_targets: data } : p);
      toast.success(`Targets set: ${data.calories} kcal · ${data.protein_g}g protein`);
    } catch (e) { toast.error(nutritionErrorMessage(e, "Couldn't calculate macros — open Nutrition again after your profile loads.")); } finally { setCalcing(false); }
  };

  const suggestMeals = async (preset?: string) => {
    setSuggesting(true);
    try {
      const activeProfile = profile ?? {};
      const nutritionPrefs = activeProfile?.nutrition_preferences ?? {};
      const targets = activeProfile?.macro_targets ?? calculateMacroTargets(activeProfile, nutritionPrefs, null, []);
      if (!activeProfile?.macro_targets && user) {
        await supabase.from("profiles").update({ macro_targets: targets }).eq("user_id", user.id);
        setProfile((p: any) => p ? { ...p, macro_targets: targets } : p);
      }
      const localPlan = buildMealPlan({ profile: { ...activeProfile, macro_targets: targets }, nutritionPrefs, program: null, upcoming: [], prompt: preset }, targets);
      const m = suggestedMealsFromPlan(localPlan, preset);
      if (m.length === 0) { toast.error("No suggestions returned — try again."); return; }
      setSuggestions(m);
      toast.success(preset ? "Suggestion ready" : `${m.length} meal ideas ready`);
      setTimeout(() => document.getElementById("coach-suggestions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
    } catch (e) { toast.error(nutritionErrorMessage(e, "Couldn't fetch suggestions — please try again in Nutrition.")); } finally { setSuggesting(false); }
  };

  const generatePlan = async (overridePrompt?: string) => {
    setPlanning(true);
    let activeProfile = profile;
    try {
      if (!activeProfile?.macro_targets) {
        toast.loading("Calculating your macro targets…", { id: "macros" });
        const nutritionPrefs = activeProfile?.nutrition_preferences ?? {};
        const mData = calculateMacroTargets(activeProfile ?? {}, nutritionPrefs, null, []);
        toast.dismiss("macros");
        if (user) await supabase.from("profiles").update({ macro_targets: mData }).eq("user_id", user.id);
        const { data: p } = await supabase.from("profiles").select("*").eq("user_id", user!.id).maybeSingle();
        activeProfile = p ?? { ...activeProfile, macro_targets: mData };
        setProfile(activeProfile);
      }
      const nutritionPrefs = activeProfile?.nutrition_preferences ?? {};
      const targets = activeProfile?.macro_targets ?? calculateMacroTargets(activeProfile ?? {}, nutritionPrefs, null, []);
      const d: any = buildMealPlan({ profile: { ...activeProfile, macro_targets: targets }, nutritionPrefs, program: null, upcoming: [], prompt: overridePrompt || planPrompt || undefined }, targets);
      if (!d?.days?.length) {
        toast.error("The plan came back incomplete — please try again.");
        return;
      }
      setPlan(d);
      if (d?.recommended_macros) setProfile((p: any) => p ? { ...p, macro_targets: d.recommended_macros } : p);
      setOpenDay(0);
      toast.success(`${d.days.length}-day macro-matched plan ready`);
    } catch (e: any) {
      console.error(e);
      toast.error(nutritionErrorMessage(e, "Couldn't generate meal plan — please try again from Nutrition."));
    } finally { setPlanning(false); }
  };

  const swapMeal = (meal: any) => {
    generatePlan(`Swap ${meal.title} for a different allergy-safe meal with the same macros and a matching prep video.`);
  };

  const reviewDay = async () => {
    setReviewing(true);
    try {
      const nutritionPrefs = profile?.nutrition_preferences ?? {};
      const targets = profile?.macro_targets ?? calculateMacroTargets(profile ?? {}, nutritionPrefs, null, []);
      const d = reviewLoggedMeals(meals, targets);
      setReview(d);
    } catch (e) { toast.error(nutritionErrorMessage(e, "Couldn't generate review — please try again.")); } finally { setReviewing(false); }
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
            <h1 className="page-title">Nutrition</h1>
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
          <div className="mb-5 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-card shadow-card">
            <div className="relative p-5">
              <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
              <div className="absolute -bottom-12 -left-12 h-40 w-40 rounded-full bg-accent/15 blur-3xl" />
              <div className="relative mb-3 flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">Today's macros</div>
                  <div className="text-3xl font-extrabold tabular-nums leading-none">
                    {Math.round(totals.calories)}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">/ {targets.calories} kcal</span>
                  </div>
                </div>
                <button onClick={calcMacros} disabled={calcing} className="rounded-full border border-primary/30 bg-surface px-3 py-1.5 text-[11px] font-semibold text-primary hover:bg-primary/10">
                  {calcing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Recalc"}
                </button>
              </div>
              <div className="relative grid grid-cols-4 gap-2">
                <MacroBar label="kcal" value={Math.round(totals.calories)} target={targets.calories} color="bg-gradient-primary" unit="" />
                <MacroBar label="Protein" value={Math.round(totals.protein_g)} target={targets.protein_g} color="bg-primary" />
                <MacroBar label="Carbs" value={Math.round(totals.carbs_g)} target={targets.carbs_g} color="bg-accent" />
                <MacroBar label="Fat" value={Math.round(totals.fat_g)} target={targets.fat_g} color="bg-warning" />
              </div>
            </div>
          </div>
        )}

        {/* Premium Fresh Meals hero */}
        <Link
          to="/fresh-meals"
          className="group relative mb-3 block overflow-hidden rounded-3xl border border-primary/30 shadow-card transition hover:border-primary/60"
        >
          <div className="relative aspect-[16/9] w-full">
            <img
              src="https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&w=1600&q=80"
              alt="Today's fresh meal plan preview"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
              loading="lazy"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full bg-primary/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
              <ChefHat className="h-3 w-3" /> Today's Fresh Meals
            </div>
            <div className="absolute bottom-3 left-4 right-4 text-white">
              <div className="text-lg font-extrabold leading-tight drop-shadow">Your daily plan, ready to cook</div>
              <p className="text-[11px] opacity-90 drop-shadow">Breakfast → evening snack · prep videos · macro-smart swaps</p>
            </div>
            <div className="absolute right-4 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-white/95 text-primary shadow-glow transition group-hover:scale-110">
              <PlayCircle className="h-6 w-6" />
            </div>
          </div>
        </Link>

        {/* Quick filter chips — deep-link into the daily plan with filter pre-applied */}
        <div className="-mx-5 mb-4 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {[
              { key: "high-protein", label: "High protein" },
              { key: "low-inflammation", label: "Low inflammation" },
              { key: "quick", label: "Quick & easy" },
              { key: "keto", label: "Keto" },
              { key: "gluten-free", label: "Gluten-free" },
              { key: "senior", label: "Senior-friendly" },
              { key: "vegan", label: "Vegan" },
              { key: "budget", label: "Budget" },
            ].map((c) => (
              <button
                key={c.key}
                onClick={() => {
                  if (typeof window !== "undefined") sessionStorage.setItem("forge:fresh-filter", c.key);
                  navigate({ to: "/fresh-meals" });
                }}
                className="shrink-0 rounded-full border border-border/60 bg-surface px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        {/* Surprise Me hero */}
        <button
          onClick={() => openRegen("Surprise me with completely fresh meals for tonight that match my macros and dietary preferences.")}
          className="group relative mb-4 block w-full overflow-hidden rounded-3xl border border-primary/30 bg-gradient-card p-5 text-left shadow-card transition hover:border-primary/60"
        >
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/30 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
          <div className="relative flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
              <Wand2 className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
                <Sparkles className="h-3 w-3" /> Surprise me tonight
              </div>
              <div className="text-base font-bold leading-tight">8 brand-new meals, picked for you</div>
              <p className="text-xs text-muted-foreground">Macro-perfect · with prep videos · tap to swap</p>
            </div>
            <Zap className="h-5 w-5 text-primary transition-transform group-hover:scale-125" />
          </div>
        </button>

        <div className="mb-3 flex gap-2">
          <Button onClick={() => setAdding(true)} variant="outline" className="flex-1 h-11 rounded-xl border-border bg-surface"><Plus className="mr-1 h-4 w-4" /> Log meal</Button>
          <Button onClick={() => suggestMeals()} disabled={suggesting} variant="outline" className="flex-1 h-11 rounded-xl border-border bg-surface">
            {suggesting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Sparkles className="mr-1 h-4 w-4" />} Suggest
          </Button>
        </div>

        {/* Quick suggestion presets */}
        <div className="mb-4 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Suggestions
          </div>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Quick high-protein", prompt: "A fast 10-minute high-protein meal hitting 40g+ protein." },
              { label: "Post-workout", prompt: "A post-workout meal with fast carbs + lean protein for recovery." },
              { label: "Generate for today", prompt: "Suggest breakfast, lunch, dinner and a snack for today only." },
              { label: "Swap a meal", prompt: "Suggest 3 macro-equivalent allergy-safe swaps for my logged meals." },
            ].map((p) => (
              <Button key={p.label} onClick={() => suggestMeals(p.prompt)} disabled={suggesting} variant="outline" size="sm" className="h-10 rounded-xl border-border bg-surface text-xs">
                {p.label}
              </Button>
            ))}
          </div>
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
          <div id="coach-suggestions" className="mb-5">
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

        {/* AI Meal Plan synced with training */}
        <div className="mb-5 rounded-3xl border border-primary/20 bg-gradient-card p-5 shadow-card">
          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <ChefHat className="h-3 w-3" /> Training-synced meal plan
          </div>
          <p className="mb-3 text-sm text-muted-foreground">7-day plan with recipes, macros, and a meal-prep library — automatically matched to this week's training and your allergies.</p>
          <Input
            placeholder='Optional request — e.g. "high-protein for push-pull-legs" or "no eggs this week"'
            value={planPrompt}
            onChange={(e) => setPlanPrompt(e.target.value)}
            className="mb-3 h-11"
          />
          <Button onClick={() => generatePlan()} disabled={planning} className="h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
            {planning ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {plan ? "Regenerate plan" : "Generate my meal plan"}
          </Button>
        </div>

        {plan && (
          <div className="mb-6 space-y-3">
            {plan.summary && <p className="rounded-2xl border border-border/60 bg-surface p-3 text-sm text-muted-foreground">{plan.summary}</p>}

            {plan.shopping_list?.length > 0 && (
              <details className="rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
                <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                  <ShoppingCart className="h-4 w-4 text-primary" /> Weekly shopping list
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {plan.shopping_list.map((c: any, i: number) => (
                    <div key={i}>
                      <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">{c.category}</div>
                      <ul className="space-y-0.5 text-sm text-muted-foreground">
                        {c.items?.map((it: string, j: number) => <li key={j}>· {it}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}

            {plan.days?.length > 0 && (() => {
              const buckets: Record<string, Array<{ meal: any; day: any; di: number; mi: number }>> = { Breakfast: [], Lunch: [], Dinner: [], Snack: [] };
              plan.days.forEach((day: any, di: number) => {
                day.meals?.forEach((meal: any, mi: number) => {
                  const slot = (meal.slot || "").toLowerCase();
                  let key: keyof typeof buckets = "Snack";
                  if (slot.includes("break")) key = "Breakfast";
                  else if (slot.includes("lunch")) key = "Lunch";
                  else if (slot.includes("din")) key = "Dinner";
                  else if (slot.includes("post") || slot.includes("snack")) key = "Snack";
                  else if (mi === 0) key = "Breakfast";
                  else if (mi === 1) key = "Lunch";
                  else if (mi === 2) key = "Dinner";
                  buckets[key].push({ meal, day, di, mi });
                });
              });
              const list = buckets[libCat];
              return (
                <div className="rounded-2xl border border-primary/20 bg-gradient-card p-4 shadow-card">
                  <div className="mb-3 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
                    <BookOpen className="h-3 w-3" /> Meal library
                  </div>
                  <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {(["Breakfast", "Lunch", "Dinner", "Snack"] as const).map((c) => (
                      <button key={c} onClick={() => setLibCat(c)}
                        className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${libCat === c ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground"}`}>
                        {c} <span className="ml-1 opacity-60">{buckets[c].length}</span>
                      </button>
                    ))}
                  </div>
                  {list.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No {libCat.toLowerCase()} meals in this plan.</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map(({ meal, day, di, mi }) => {
                        const k = `lib-${di}-${mi}`;
                        const open = libOpen === k;
                        const video = meal.prep_video;
                        return (
                          <div key={k} className="rounded-xl border border-border/60 bg-surface p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] uppercase tracking-wider text-primary">{day.day} · {meal.slot}</div>
                                <div className="font-semibold leading-tight">{meal.title}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">{meal.calories} kcal · {meal.protein_g}P / {meal.carbs_g}C / {meal.fat_g}F</div>
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                <Button size="sm" onClick={() => addSuggested({ name: meal.slot, title: meal.title, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g })} className="rounded-lg bg-gradient-primary text-primary-foreground">Add</Button>
                                <Button size="sm" variant="outline" onClick={() => swapMeal(meal)} disabled={planning} className="rounded-lg border-primary/30 bg-surface text-primary"><RefreshCcw className="h-3.5 w-3.5" /></Button>
                              </div>
                            </div>
                            <button onClick={() => setLibOpen(open ? null : k)} className="mt-2 text-xs font-semibold text-primary">
                              {open ? "Hide details" : "Recipe & meal prep"}
                            </button>
                            {open && (
                              <div className="mt-2 space-y-2">
                                {video?.url && <MealPrepVideo recipe={{ slug: meal.title, title: meal.title, meal_type: meal.slot }} title={meal.title} categoryLabel={meal.slot} size="sm" />}
                                {meal.ingredients_with_units?.length > 0 && (
                                  <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</div>
                                    <ul className="mt-1 text-xs text-muted-foreground">{meal.ingredients_with_units.map((ing: string, k2: number) => <li key={k2}>· {ing}</li>)}</ul></div>
                                )}
                                {meal.instructions?.length > 0 && (
                                  <div><div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cook</div>
                                    <ol className="mt-1 list-decimal pl-4 text-xs text-muted-foreground space-y-0.5">{meal.instructions.map((s: string, k2: number) => <li key={k2}>{s}</li>)}</ol></div>
                                )}
                                {meal.meal_prep && (
                                  <div className="rounded-lg border border-primary/20 bg-primary/5 p-2.5 text-xs text-muted-foreground space-y-1">
                                    {meal.meal_prep.batch_cook && <div><span className="font-semibold text-foreground">Batch cook:</span> {meal.meal_prep.batch_cook}</div>}
                                    {meal.meal_prep.store && <div><span className="font-semibold text-foreground">Store:</span> {meal.meal_prep.store}</div>}
                                    {meal.meal_prep.reheat && <div><span className="font-semibold text-foreground">Reheat:</span> {meal.meal_prep.reheat}</div>}
                                    {meal.meal_prep.substitutions?.length > 0 && <div><span className="font-semibold text-foreground">Subs:</span> {meal.meal_prep.substitutions.join(", ")}</div>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}

            {plan.days?.map((day: any, di: number) => {
              const isOpen = openDay === di;
              return (
                <div key={di} className="rounded-2xl border border-border/60 bg-gradient-card shadow-card">
                  <button onClick={() => setOpenDay(isOpen ? null : di)} className="flex w-full items-center justify-between gap-3 p-4 text-left">
                    <div>
                      <div className="font-semibold">{day.day} <span className="ml-1 text-xs font-normal text-muted-foreground">· {day.training_focus}</span></div>
                      {day.calorie_target && <div className="text-xs text-muted-foreground">{day.calorie_target} kcal target</div>}
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="space-y-3 border-t border-border/60 p-4">
                      {day.meals?.map((meal: any, mi: number) => {
                        const prepKey = `${di}-${mi}`;
                        const prepOpen = openPrep === prepKey;
                        return (
                          <div key={mi} className="rounded-xl border border-border/60 bg-surface p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <div className="text-[10px] uppercase tracking-wider text-primary">{meal.slot}</div>
                                <div className="font-semibold">{meal.title}</div>
                                <div className="mt-0.5 text-xs text-muted-foreground">{meal.calories} kcal · {meal.protein_g}P / {meal.carbs_g}C / {meal.fat_g}F</div>
                              </div>
                              <Button size="sm" onClick={() => addSuggested({ name: meal.slot, title: meal.title, calories: meal.calories, protein_g: meal.protein_g, carbs_g: meal.carbs_g, fat_g: meal.fat_g })} className="rounded-lg bg-gradient-primary text-primary-foreground">Log</Button>
                            </div>

                            {meal.training_rationale && <p className="mt-2 text-xs italic text-muted-foreground">{meal.training_rationale}</p>}

                            {meal.prep_video?.url && <div className="mt-3"><MealPrepVideo recipe={{ slug: meal.title, title: meal.title, meal_type: meal.slot }} title={meal.title} categoryLabel={meal.slot} size="sm" /></div>}

                            {meal.ingredients_with_units?.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Ingredients</div>
                                <ul className="mt-1 text-xs text-muted-foreground">
                                  {meal.ingredients_with_units.map((ing: string, k: number) => <li key={k}>· {ing}</li>)}
                                </ul>
                              </div>
                            )}

                            {meal.instructions?.length > 0 && (
                              <div className="mt-3">
                                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Cook</div>
                                <ol className="mt-1 list-decimal pl-4 text-xs text-muted-foreground space-y-0.5">
                                  {meal.instructions.map((s: string, k: number) => <li key={k}>{s}</li>)}
                                </ol>
                              </div>
                            )}

                            {meal.meal_prep && (
                              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
                                <button onClick={() => setOpenPrep(prepOpen ? null : prepKey)} className="flex w-full items-center justify-between gap-2 text-left">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                                    <BookOpen className="h-3.5 w-3.5" /> Meal-prep library
                                  </span>
                                  <ChevronDown className={`h-3.5 w-3.5 text-primary transition-transform ${prepOpen ? "rotate-180" : ""}`} />
                                </button>
                                {prepOpen && (
                                  <div className="mt-3 space-y-2 text-xs text-muted-foreground">
                                    {meal.meal_prep.batch_cook && <div><span className="font-semibold text-foreground">Batch cook:</span> {meal.meal_prep.batch_cook}</div>}
                                    {meal.meal_prep.store && <div><span className="font-semibold text-foreground">Store:</span> {meal.meal_prep.store}</div>}
                                    {meal.meal_prep.reheat && <div><span className="font-semibold text-foreground">Reheat:</span> {meal.meal_prep.reheat}</div>}
                                    {meal.meal_prep.make_ahead && <div><span className="font-semibold text-foreground">Make-ahead:</span> {meal.meal_prep.make_ahead}</div>}
                                    {meal.meal_prep.portion_scaling && <div><span className="font-semibold text-foreground">Scaling:</span> {meal.meal_prep.portion_scaling}</div>}
                                    {meal.meal_prep.substitutions?.length > 0 && (
                                      <div><span className="font-semibold text-foreground">Substitutions:</span> {meal.meal_prep.substitutions.join(", ")}</div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
              <button onClick={() => removeMeal(m.id)} aria-label={`Remove ${m.name}`} className="text-muted-foreground hover:text-destructive"><Trash2 aria-hidden="true" className="h-4 w-4" /></button>
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


      <MealRegenerationModal
        open={regenOpen}
        onClose={() => setRegenOpen(false)}
        initialPrompt={regenPrompt}
        userAllergens={profile?.nutrition_preferences?.allergies ?? []}
        userDiets={profile?.nutrition_preferences?.diets ?? []}
        macroTargets={profile?.macro_targets ?? null}
        onSwapped={async () => {
          if (!user) return;
          const since = new Date(); since.setHours(0, 0, 0, 0);
          const { data: m } = await supabase.from("meal_logs").select("*").eq("user_id", user.id).gte("eaten_at", since.toISOString()).order("eaten_at", { ascending: false });
          setMeals((m ?? []) as Meal[]);
        }}
      />
    </AppShell>
  );
}

function MacroBar({ label, value, target, color, unit = "g" }: { label: string; value: number; target: number; color: string; unit?: string }) {
  const pct = Math.min(100, Math.round((value / Math.max(1, target)) * 100));
  return (
    <div className="rounded-xl border border-border/60 bg-surface p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-bold tabular-nums">{value}<span className="text-xs font-normal text-muted-foreground">/{target}{unit}</span></div>
      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-border/60">
        <div className={`h-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// MealPrepVideo moved to src/components/MealPrepVideo.tsx
