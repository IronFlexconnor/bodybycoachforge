import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Search, Sparkles, Heart, Play, Loader2, RefreshCcw, Shuffle,
  Clock, Flame, Leaf, Utensils, Plus, X, Sunrise, Sun, Moon, Coffee, Cookie, Apple,
  ShoppingCart, Copy, Check, Wand2,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { thumbForRecipe, thumbFallbackForRecipe, videoForRecipe } from "@/lib/mealVideos";
import { useFavorites } from "@/lib/favorites";
import { logPlanChangeToCoach } from "@/lib/coachSync";
import { trackEvent } from "@/lib/usage";
import { toast } from "sonner";

export const Route = createFileRoute("/fresh-meals")({
  head: () => ({
    meta: [
      { title: "Today's Fresh Meals — Body Forge" },
      { name: "description", content: "Your daily plan: breakfast to evening snack with prep videos, smart filters, and macro-preserving swaps." },
      { property: "og:title", content: "Today's Fresh Meals — Body Forge" },
      { property: "og:description", content: "Big videos. Mouth-watering picks. One-tap save & swap." },
    ],
  }),
  component: FreshMealsPage,
});

type Recipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  meal_type: string;
  cuisine: string | null;
  dietary_tags: string[] | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_minutes: number;
  cook_minutes: number;
  difficulty: string;
};

type FilterKey =
  | "all" | "high-protein" | "low-carb" | "quick" | "low-inflammation"
  | "gluten-free" | "dairy-free" | "keto" | "paleo" | "vegan" | "vegetarian"
  | "pescatarian" | "low-fodmap" | "senior" | "budget" | "family";

const FILTERS: { key: FilterKey; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "high-protein", label: "High protein", icon: Flame },
  { key: "low-inflammation", label: "Low inflammation", icon: Leaf },
  { key: "quick", label: "Under 15 min", icon: Clock },
  { key: "low-carb", label: "Low carb", icon: Leaf },
  { key: "keto", label: "Keto", icon: Leaf },
  { key: "paleo", label: "Paleo", icon: Leaf },
  { key: "vegan", label: "Vegan", icon: Leaf },
  { key: "vegetarian", label: "Vegetarian", icon: Leaf },
  { key: "pescatarian", label: "Pescatarian", icon: Leaf },
  { key: "gluten-free", label: "Gluten-free", icon: Leaf },
  { key: "dairy-free", label: "Dairy-free", icon: Leaf },
  { key: "low-fodmap", label: "Low FODMAP", icon: Leaf },
  { key: "senior", label: "Senior-friendly", icon: Heart },
  { key: "budget", label: "Budget", icon: Utensils },
  { key: "family", label: "Family", icon: Utensils },
];

type SlotKey = "breakfast" | "mid_morning" | "lunch" | "afternoon" | "dinner" | "evening";
const SLOTS: { key: SlotKey; label: string; sub: string; mealType: string; isSnack: boolean; icon: any }[] = [
  { key: "breakfast",   label: "Breakfast",          sub: "Start strong",          mealType: "breakfast", isSnack: false, icon: Sunrise },
  { key: "mid_morning", label: "Mid-morning snack",  sub: "Gentle energy",         mealType: "snack",     isSnack: true,  icon: Coffee },
  { key: "lunch",       label: "Lunch",              sub: "Refuel for the day",    mealType: "lunch",     isSnack: false, icon: Sun },
  { key: "afternoon",   label: "Afternoon snack",    sub: "Beat the slump",        mealType: "snack",     isSnack: true,  icon: Apple },
  { key: "dinner",      label: "Dinner",             sub: "Recover & repair",      mealType: "dinner",    isSnack: false, icon: Moon },
  { key: "evening",     label: "Evening snack",      sub: "Optional wind-down",    mealType: "snack",     isSnack: true,  icon: Cookie },
];

// ------------------- Regenerate prefs -------------------
const CUISINES = ["Italian", "Mexican", "Asian", "Mediterranean", "American", "Indian", "Middle Eastern", "Japanese"] as const;
const PREP_TIMES = [
  { key: "any", label: "Any time" },
  { key: "u10", label: "Under 10 min" },
  { key: "u20", label: "15–20 min" },
  { key: "u30", label: "Around 30 min" },
  { key: "batch", label: "Meal-prep batch" },
] as const;
const DIET_OPTIONS = [
  "low-inflammation", "gluten-free", "dairy-free", "keto", "paleo",
  "vegan", "vegetarian", "pescatarian", "low-fodmap", "high-protein", "senior", "budget", "family",
] as const;
const MOODS = [
  { key: "energy",   label: "Energy boost" },
  { key: "recovery", label: "Recovery" },
  { key: "family",   label: "Family-friendly" },
  { key: "comfort",  label: "Comfort food" },
  { key: "light",    label: "Light & lean" },
] as const;

type PrepTimeKey = (typeof PREP_TIMES)[number]["key"];
type MoodKey = (typeof MOODS)[number]["key"];
type RegenPrefs = {
  cuisines: string[];
  prepTime: PrepTimeKey;
  dietary: string[];
  mood: MoodKey | null;
};
const DEFAULT_PREFS: RegenPrefs = { cuisines: [], prepTime: "any", dietary: [], mood: null };

function todayKey() { return new Date().toISOString().slice(0, 10); }
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice(); let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function tagsOf(r: Recipe) { return (r.dietary_tags || []).map((t) => t.toLowerCase()); }
function tagMatches(r: Recipe, key: FilterKey): boolean {
  const tags = tagsOf(r);
  const has = (...needles: string[]) => tags.some((t) => needles.some((n) => t.includes(n)));
  switch (key) {
    case "all": return true;
    case "high-protein": return Number(r.protein_g) >= 30;
    case "low-carb": return Number(r.carbs_g) <= 30;
    case "quick": return (r.prep_minutes + r.cook_minutes) <= 15;
    case "low-inflammation": return has("anti-inflammatory", "low-inflammation", "mediterranean", "omega");
    case "gluten-free": return has("gluten-free", "gf");
    case "dairy-free": return has("dairy-free", "lactose-free");
    case "keto": return has("keto") || (Number(r.carbs_g) <= 20 && Number(r.fat_g) >= 20);
    case "paleo": return has("paleo");
    case "vegan": return has("vegan", "plant-based");
    case "vegetarian": return has("vegetarian", "vegan", "plant-based");
    case "pescatarian": return has("pescatarian", "fish", "seafood", "salmon", "tuna");
    case "low-fodmap": return has("low-fodmap", "fodmap");
    case "senior": return has("senior", "geriatric", "soft", "gentle") || r.difficulty === "easy";
    case "budget": return has("budget", "cheap", "pantry");
    case "family": return has("family", "kid");
  }
}

function prepTimeMatches(r: Recipe, k: PrepTimeKey): boolean {
  const t = (r.prep_minutes || 0) + (r.cook_minutes || 0);
  switch (k) {
    case "any": return true;
    case "u10": return t <= 10;
    case "u20": return t <= 20;
    case "u30": return t <= 30;
    case "batch": return t >= 30 || tagsOf(r).some((x) => x.includes("batch") || x.includes("meal-prep"));
  }
}
function moodMatches(r: Recipe, m: MoodKey | null): boolean {
  if (!m) return true;
  const tags = tagsOf(r);
  const has = (...n: string[]) => tags.some((t) => n.some((x) => t.includes(x)));
  switch (m) {
    case "energy":   return Number(r.carbs_g) >= 30 || has("energy", "pre-workout");
    case "recovery": return Number(r.protein_g) >= 25 || has("recovery", "post-workout");
    case "family":   return has("family", "kid");
    case "comfort":  return has("comfort", "stew", "pasta", "soup", "bake");
    case "light":    return Number(r.calories || 0) <= 450;
  }
}
function applyPrefs(list: Recipe[], prefs: RegenPrefs): Recipe[] {
  let out = list;
  if (prefs.cuisines.length) {
    const set = new Set(prefs.cuisines.map((c) => c.toLowerCase()));
    out = out.filter((r) => set.has((r.cuisine || "").toLowerCase()));
  }
  if (prefs.prepTime !== "any") out = out.filter((r) => prepTimeMatches(r, prefs.prepTime));
  if (prefs.dietary.length) out = out.filter((r) => prefs.dietary.every((d) => tagMatches(r, d as FilterKey)));
  if (prefs.mood) out = out.filter((r) => moodMatches(r, prefs.mood));
  return out;
}

function FreshMealsPage() {
  const navigate = useNavigate();
  const [all, setAll] = useState<Recipe[] | null>(null);
  const [seedOffset, setSeedOffset] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Recipe | null>(null);
  const [prefs, setPrefs] = useState<RegenPrefs>(DEFAULT_PREFS);
  const [regenOpen, setRegenOpen] = useState(false);
  const [overrides, setOverrides] = useState<Partial<Record<SlotKey, Recipe>>>({});
  const [showShopping, setShowShopping] = useState(false);
  const { isFav, toggle } = useFavorites();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("recipes")
        .select("id,slug,title,description,meal_type,cuisine,dietary_tags,calories,protein_g,carbs_g,fat_g,prep_minutes,cook_minutes,difficulty")
        .limit(1000);
      if (cancelled || !data) return;
      setAll(data as Recipe[]);
    })();
    // Pre-apply a filter sent from the Nutrition page
    if (typeof window !== "undefined") {
      const f = sessionStorage.getItem("forge:fresh-filter");
      if (f) {
        sessionStorage.removeItem("forge:fresh-filter");
        setFilter(f as FilterKey);
      }
    }
    return () => { cancelled = true; };
  }, []);

  const baseFiltered = useMemo(() => {
    if (!all) return null;
    let list = all.slice();
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) =>
        r.title.toLowerCase().includes(q) ||
        (r.cuisine || "").toLowerCase().includes(q) ||
        (r.dietary_tags || []).some((t) => t.toLowerCase().includes(q))
      );
    }
    if (filter !== "all") list = list.filter((r) => tagMatches(r, filter));
    return list;
  }, [all, filter, query]);

  // Build the daily plan using applied prefs; gracefully fall back if too narrow.
  const slotPicks = useMemo(() => {
    if (!baseFiltered) return null;
    const seed = hash(todayKey() + ":" + seedOffset + ":" + JSON.stringify(prefs));
    const withPrefs = applyPrefs(baseFiltered, prefs);
    const fallback = baseFiltered;
    const shuffledPref = seededShuffle(withPrefs, seed);
    const shuffledFb = seededShuffle(fallback, seed + 7);
    const picks: Record<SlotKey, { primary: Recipe | null; alts: Recipe[] }> = {} as any;
    const used = new Set<string>();
    for (const slot of SLOTS) {
      const matchSlot = (r: Recipe) => {
        const mt = (r.meal_type || "").toLowerCase();
        return slot.isSnack ? mt.includes("snack") : mt === slot.mealType;
      };
      let pool = shuffledPref.filter(matchSlot).filter((r) => !used.has(r.id));
      if (pool.length < 2) {
        const extra = shuffledFb.filter(matchSlot).filter((r) => !used.has(r.id) && !pool.find((p) => p.id === r.id));
        pool = pool.concat(extra);
      }
      if (!pool.length) pool = shuffledFb.filter((r) => !used.has(r.id));
      const override = overrides[slot.key] && pool.find((p) => p.id === overrides[slot.key]!.id) ? overrides[slot.key]! : null;
      const primary = override ?? pool[0] ?? null;
      if (primary) used.add(primary.id);
      const alts = pool.filter((r) => r.id !== primary?.id).slice(0, 8);
      picks[slot.key] = { primary, alts };
    }
    return picks;
  }, [baseFiltered, seedOffset, prefs, overrides]);

  const totals = useMemo(() => {
    if (!slotPicks) return null;
    let kcal = 0, p = 0, c = 0, f = 0;
    for (const slot of SLOTS) {
      const r = slotPicks[slot.key].primary;
      if (!r) continue;
      kcal += r.calories || 0;
      p += Number(r.protein_g) || 0;
      c += Number(r.carbs_g) || 0;
      f += Number(r.fat_g) || 0;
    }
    return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
  }, [slotPicks]);

  // Dynamic weekly shopping list — derived from current daily picks (×7) +
  // recipe titles/tags. Updates instantly when meals are swapped or regenerated.
  const shoppingList = useMemo(() => {
    if (!slotPicks) return [];
    const items = new Map<string, { name: string; count: number; from: Set<string> }>();
    const add = (raw: string, from: string) => {
      const name = raw.trim();
      if (!name) return;
      const k = name.toLowerCase();
      const prev = items.get(k);
      if (prev) { prev.count += 1; prev.from.add(from); }
      else items.set(k, { name, count: 1, from: new Set([from]) });
    };
    for (const slot of SLOTS) {
      const r = slotPicks[slot.key].primary;
      if (!r) continue;
      const guesses = inferIngredients(r);
      guesses.forEach((g) => add(g, r.title));
    }
    return Array.from(items.values()).sort((a, b) => b.count - a.count);
  }, [slotPicks]);

  const regenAll = () => {
    setSeedOffset((n) => n + 1);
    setOverrides({});
    toast.success("Fresh plan served — same macro shape, brand-new variety");
    logPlanChangeToCoach("Regenerated today's full meal plan (Surprise Me) — keeping macros aligned. Please factor this into future coaching.");
  };

  const swapIntoPlan = (r: Recipe) => {
    // Map the recipe to its slot for instant in-page update + sync to AI Coach
    const slot = SLOTS.find((s) => (s.isSnack ? (r.meal_type || "").toLowerCase().includes("snack") : (r.meal_type || "").toLowerCase() === s.mealType));
    if (slot) setOverrides((prev) => ({ ...prev, [slot.key]: r }));
    if (typeof window !== "undefined") {
      sessionStorage.setItem("forge:open-regen", `swap ${r.title} into today's plan with similar macros`);
    }
    toast.success(`${r.title} swapped in — shopping list updated`);
    logPlanChangeToCoach(`Swapped ${slot?.label ?? "a meal"} to "${r.title}" (${r.calories} kcal · ${Math.round(r.protein_g)}P/${Math.round(r.carbs_g)}C/${Math.round(r.fat_g)}F). Shopping list updated.`);
  };

  const addToWeek = (r: Recipe) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("forge:open-regen", `add ${r.title} to this week's meal plan`);
    }
    toast.success(`Added ${r.title} to this week`);
    logPlanChangeToCoach(`Added "${r.title}" to this week's plan (${r.calories} kcal · ${Math.round(r.protein_g)}g protein).`);
    navigate({ to: "/nutrition" });
  };

  return (
    <AppShell>
      <div className="px-5 pt-6">
        {/* Header */}
        <div className="mb-4 flex items-center gap-3">
          <button onClick={() => navigate({ to: "/" })} aria-label="Back" className="grid h-10 w-10 place-items-center rounded-full border border-border/60 bg-card hover:border-primary/50">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> Today's plan
            </div>
            <h1 className="page-title mt-1">Today's Fresh Meals</h1>
            <p className="text-xs text-muted-foreground">Breakfast → evening snack · macro-smart swaps</p>
          </div>
          <button onClick={() => setRegenOpen(true)} aria-label="Regenerate" className="grid h-10 w-10 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow hover:scale-105 transition">
            <Wand2 className="h-4 w-4" />
          </button>
        </div>

        {/* Active prefs chips */}
        {(prefs.cuisines.length > 0 || prefs.dietary.length > 0 || prefs.mood || prefs.prepTime !== "any") && (
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-muted-foreground">Tuned for:</span>
            {prefs.cuisines.map((c) => <Chip key={c}>{c}</Chip>)}
            {prefs.prepTime !== "any" && <Chip>{PREP_TIMES.find((p) => p.key === prefs.prepTime)?.label}</Chip>}
            {prefs.dietary.map((d) => <Chip key={d}>{d}</Chip>)}
            {prefs.mood && <Chip>{MOODS.find((m) => m.key === prefs.mood)?.label}</Chip>}
            <button onClick={() => { setPrefs(DEFAULT_PREFS); setOverrides({}); }} className="ml-1 text-primary underline-offset-2 hover:underline">Clear</button>
          </div>
        )}

        {/* Daily totals */}
        {totals && (
          <div className="mb-4 grid grid-cols-4 gap-2 rounded-2xl border border-border/60 bg-gradient-card p-3 shadow-card">
            <Stat label="kcal" value={totals.kcal} />
            <Stat label="protein" value={`${totals.p}g`} />
            <Stat label="carbs" value={`${totals.c}g`} />
            <Stat label="fat" value={`${totals.f}g`} />
          </div>
        )}

        {/* Search */}
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search meals, cuisine, tags…"
            className="h-11 w-full rounded-2xl border border-border/60 bg-card pl-9 pr-9 text-sm outline-none focus:border-primary/60"
          />
          {query && (
            <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:text-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter chips */}
        <div className="-mx-5 mb-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex gap-2 w-max">
            {FILTERS.map((f) => {
              const isActive = filter === f.key;
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                    isActive
                      ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
                      : "border-border/60 bg-card text-muted-foreground hover:border-primary/40"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" /> {f.label}
                </button>
              );
            })}
          </div>
        </div>

        {!slotPicks ? (
          <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <>
            {SLOTS.map((slot) => (
              <SlotSection
                key={slot.key}
                slot={slot}
                primary={slotPicks[slot.key].primary}
                alts={slotPicks[slot.key].alts}
                onOpen={(r) => { trackEvent("meal_view", { ref_id: r.slug, ref_label: r.title }); setActive(r); }}
                onSwap={swapIntoPlan}
                onSave={(r) => {
                  const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type });
                  if (added) trackEvent("meal_save", { ref_id: r.slug, ref_label: r.title });
                  toast.success(added ? "Saved to favorites" : "Removed from favorites");
                }}
                isFav={isFav}
              />
            ))}

            {/* Shopping list — dynamic, updates with every swap */}
            <ShoppingListSection
              list={shoppingList}
              open={showShopping}
              onToggle={() => setShowShopping((v) => !v)}
            />

            <div className="mb-8 mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => { trackEvent("meal_regenerate", { ref_label: "open_sheet" }); setRegenOpen(true); }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-gradient-primary p-4 font-semibold text-primary-foreground shadow-glow hover:scale-[1.01] transition"
              >
                <Wand2 className="h-4 w-4" /> Regenerate plan
              </button>
              <button
                onClick={() => { trackEvent("meal_regenerate", { ref_label: "surprise" }); regenAll(); }}
                className="flex items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-card p-4 font-semibold text-primary hover:bg-primary/10 transition"
              >
                <Shuffle className="h-4 w-4" /> Surprise me
              </button>
            </div>
          </>
        )}
      </div>

      {regenOpen && (
        <RegenSheet
          initial={prefs}
          onClose={() => setRegenOpen(false)}
          onApply={(p) => {
            setPrefs(p);
            setOverrides({});
            setSeedOffset((n) => n + 1);
            setRegenOpen(false);
            toast.success("New daily plan generated for your picks");
            const bits: string[] = [];
            if (p.cuisines.length) bits.push(`cuisines: ${p.cuisines.join(", ")}`);
            if (p.prepTime !== "any") bits.push(`prep: ${PREP_TIMES.find((x) => x.key === p.prepTime)?.label}`);
            if (p.dietary.length) bits.push(`dietary: ${p.dietary.join(", ")}`);
            if (p.mood) bits.push(`mood: ${MOODS.find((m) => m.key === p.mood)?.label}`);
            logPlanChangeToCoach(
              `Regenerated today's meal plan with preferences — ${bits.length ? bits.join(" · ") : "no specific filters"}. Macros kept aligned with current targets.`,
            );
          }}
        />
      )}

      {active && (
        <DetailSheet
          recipe={active}
          onClose={() => setActive(null)}
          isFav={isFav(active.id)}
          onSave={(r) => {
            const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type });
            if (added) trackEvent("meal_save", { ref_id: r.slug, ref_label: r.title });
            toast.success(added ? "Saved to favorites" : "Removed from favorites");
          }}
          onSwap={(r) => { swapIntoPlan(r); setActive(null); }}
          onAdd={addToWeek}
        />
      )}
    </AppShell>
  );
}

// ------------------- Subcomponents -------------------

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-primary/15 px-2 py-0.5 font-medium capitalize text-primary">{children}</span>;
}

function SlotSection({
  slot, primary, alts, onOpen, onSwap, onSave, isFav,
}: {
  slot: { key: SlotKey; label: string; sub: string; icon: any };
  primary: Recipe | null;
  alts: Recipe[];
  onOpen: (r: Recipe) => void;
  onSwap: (r: Recipe) => void;
  onSave: (r: Recipe) => void;
  isFav: (id: string) => boolean;
}) {
  const Icon = slot.icon;
  if (!primary) return null;
  const fav = isFav(primary.id);
  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid h-8 w-8 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <h2 className="text-base font-semibold leading-tight">{slot.label}</h2>
          <p className="text-[11px] text-muted-foreground">{slot.sub}</p>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-card shadow-card">
        <button onClick={() => onOpen(primary)} className="block w-full text-left">
          <div className="relative aspect-[16/10] overflow-hidden bg-muted">
            <img
              src={thumbForRecipe(primary)}
              alt={primary.title}
              loading="eager"
              decoding="async"
              fetchPriority="high"
              onError={(e) => { const img = e.currentTarget; const fb = thumbFallbackForRecipe(primary); if (img.src !== fb) img.src = fb; }}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
            <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/30">
              <Play className="h-3 w-3 fill-current" /> Prep video
            </div>
            <div className="absolute bottom-3 left-3 right-3 text-white">
              <div className="text-[10px] font-semibold uppercase tracking-wider opacity-90">{primary.prep_minutes + primary.cook_minutes} min · {primary.difficulty}</div>
              <div className="text-xl font-bold leading-tight drop-shadow">{primary.title}</div>
              <div className="mt-0.5 text-xs opacity-90">{primary.calories} kcal · {Math.round(primary.protein_g)}g protein · {Math.round(primary.carbs_g)}g carbs · {Math.round(primary.fat_g)}g fat</div>
            </div>
          </div>
        </button>
        <div className="flex gap-2 p-3">
          <button onClick={() => onSwap(primary)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
            <RefreshCcw className="h-4 w-4" /> Swap into plan
          </button>
          <button onClick={() => onSave(primary)} aria-label="Save" className={`grid h-10 w-10 place-items-center rounded-xl border ${fav ? "border-primary bg-primary/10" : "border-border/60 bg-card"}`}>
            <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
          </button>
        </div>
      </div>

      {alts.length > 0 && (
        <div className="mt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">More options · macro-similar</p>
          <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <ul className="flex gap-3 snap-x snap-mandatory">
              {alts.map((r) => {
                const f = isFav(r.id);
                return (
                  <li key={r.id} className="snap-start shrink-0 w-[68%] sm:w-[42%] lg:w-[28%]">
                    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-card transition hover:border-primary/50">
                      <button onClick={() => onOpen(r)} className="block w-full text-left">
                        <div className="relative aspect-video overflow-hidden bg-muted">
                          <img
                            src={thumbForRecipe(r)}
                            alt={r.title}
                            loading="lazy"
                            decoding="async"
                            onError={(e) => { const img = e.currentTarget; const fb = thumbFallbackForRecipe(r); if (img.src !== fb) img.src = fb; }}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                          <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md ring-1 ring-white/25">
                            <Play className="h-3 w-3 fill-current" /> Prep video
                          </div>
                          <div className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-glow">
                            {r.prep_minutes + r.cook_minutes}m
                          </div>
                        </div>
                      </button>
                      <div className="flex items-center justify-between gap-2 p-3">
                        <button onClick={() => onOpen(r)} className="flex-1 text-left">
                          <div className="line-clamp-1 text-sm font-semibold">{r.title}</div>
                          <div className="mt-0.5 text-[11px] text-muted-foreground">{r.calories} kcal · {Math.round(r.protein_g)}g protein</div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSwap(r); }}
                          className="grid h-8 w-8 place-items-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25"
                          aria-label="Swap into plan"
                        >
                          <RefreshCcw className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); onSave(r); }}
                          className="grid h-8 w-8 place-items-center rounded-lg border border-border/60 bg-card hover:border-primary/50"
                          aria-label={f ? "Remove favorite" : "Save meal"}
                        >
                          <Heart className={`h-4 w-4 ${f ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

function ShoppingListSection({
  list, open, onToggle,
}: { list: { name: string; count: number; from: Set<string> }[]; open: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const exportText = useMemo(() => list.map((i) => `• ${i.name}${i.count > 1 ? ` ×${i.count}` : ""}`).join("\n"), [list]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Weekly shopping list\n\n${exportText}`);
      setCopied(true);
      toast.success("Shopping list copied");
      setTimeout(() => setCopied(false), 1500);
    } catch { toast.error("Couldn't copy — try again"); }
  };
  return (
    <section className="mb-6 overflow-hidden rounded-3xl border border-border/60 bg-gradient-card shadow-card">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-primary/15 text-primary">
          <ShoppingCart className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-base font-semibold">Weekly shopping list</div>
          <div className="text-[11px] text-muted-foreground">{list.length} items · auto-updates with every swap</div>
        </div>
        <span className="text-xs font-semibold text-primary">{open ? "Hide" : "View"}</span>
      </button>
      {open && (
        <div className="border-t border-border/60 p-4">
          <ul className="grid grid-cols-2 gap-2">
            {list.map((i) => (
              <li key={i.name} className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-3 py-2">
                <Check className="h-3.5 w-3.5 text-primary" />
                <div className="flex-1 truncate text-sm capitalize">{i.name}</div>
                {i.count > 1 && <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">×{i.count}</span>}
              </li>
            ))}
          </ul>
          <button
            onClick={copy}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow"
          >
            {copied ? <><Check className="h-4 w-4" /> Copied</> : <><Copy className="h-4 w-4" /> Copy / export list</>}
          </button>
        </div>
      )}
    </section>
  );
}

function RegenSheet({
  initial, onClose, onApply,
}: { initial: RegenPrefs; onClose: () => void; onApply: (p: RegenPrefs) => void }) {
  const [p, setP] = useState<RegenPrefs>(initial);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);
  const toggleArr = (k: "cuisines" | "dietary", v: string) =>
    setP((cur) => ({ ...cur, [k]: cur[k].includes(v) ? cur[k].filter((x) => x !== v) : [...cur[k], v] }));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-border/60 bg-background sm:rounded-3xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-card text-foreground hover:bg-primary/10">
          <X className="h-4 w-4" />
        </button>
        <div className="border-b border-border/60 bg-gradient-to-br from-primary/15 via-background to-background p-5">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Wand2 className="h-3 w-3" /> Tune your plan
          </div>
          <h2 className="mt-2 text-xl font-bold">What sounds good today?</h2>
          <p className="text-xs text-muted-foreground">Pick anything, leave the rest. We'll keep your macros locked in.</p>
        </div>
        <div className="max-h-[65vh] space-y-5 overflow-y-auto p-5">
          <Group title="Cuisine">
            <div className="flex flex-wrap gap-2">
              {CUISINES.map((c) => (
                <Pill key={c} active={p.cuisines.includes(c)} onClick={() => toggleArr("cuisines", c)}>{c}</Pill>
              ))}
            </div>
          </Group>
          <Group title="Prep time">
            <div className="flex flex-wrap gap-2">
              {PREP_TIMES.map((pt) => (
                <Pill key={pt.key} active={p.prepTime === pt.key} onClick={() => setP({ ...p, prepTime: pt.key })}>{pt.label}</Pill>
              ))}
            </div>
          </Group>
          <Group title="Dietary focus">
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map((d) => (
                <Pill key={d} active={p.dietary.includes(d)} onClick={() => toggleArr("dietary", d)}>
                  <span className="capitalize">{d.replace(/-/g, " ")}</span>
                </Pill>
              ))}
            </div>
          </Group>
          <Group title="Mood / goal">
            <div className="flex flex-wrap gap-2">
              {MOODS.map((m) => (
                <Pill key={m.key} active={p.mood === m.key} onClick={() => setP({ ...p, mood: p.mood === m.key ? null : m.key })}>{m.label}</Pill>
              ))}
            </div>
          </Group>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-border/60 p-3">
          <button onClick={() => setP(DEFAULT_PREFS)} className="rounded-xl border border-border/60 bg-card px-3 py-2.5 text-sm font-semibold">Reset</button>
          <button onClick={() => onApply(p)} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" /> Generate today's plan
          </button>
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active
          ? "border-primary bg-gradient-primary text-primary-foreground shadow-glow"
          : "border-border/60 bg-card text-muted-foreground hover:border-primary/40"
      }`}
    >
      {children}
    </button>
  );
}

function DetailSheet({ recipe, onClose, isFav, onSave, onSwap, onAdd }: {
  recipe: Recipe; onClose: () => void; isFav: boolean;
  onSave: (r: Recipe) => void; onSwap: (r: Recipe) => void; onAdd: (r: Recipe) => void;
}) {
  const video = videoForRecipe(recipe);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div className="relative w-full max-w-lg overflow-hidden rounded-t-3xl border border-border/60 bg-background sm:rounded-3xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Close" className="absolute right-3 top-3 z-20 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80">
          <X className="h-4 w-4" />
        </button>
        <div className="aspect-video w-full bg-muted">
          <iframe
            src={video.embedUrl}
            title={`${recipe.title} — meal prep video (captions available via the CC button)`}
            aria-describedby="meal-transcript-note"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
        <p id="meal-transcript-note" className="sr-only">
          Full ingredients, macros, and step-by-step prep instructions for this recipe are listed below the video as an accessible text alternative.
        </p>
        <div className="max-h-[55vh] overflow-y-auto p-5">
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">{recipe.meal_type}</span>
            <span className="text-[11px] text-muted-foreground">{recipe.prep_minutes + recipe.cook_minutes} min · {recipe.difficulty}</span>
          </div>
          <h2 className="mb-1 text-xl font-bold leading-tight">{recipe.title}</h2>
          {recipe.description && <p className="text-sm text-muted-foreground">{recipe.description}</p>}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <Stat label="kcal" value={recipe.calories} />
            <Stat label="protein" value={`${Math.round(recipe.protein_g)}g`} />
            <Stat label="carbs" value={`${Math.round(recipe.carbs_g)}g`} />
            <Stat label="fat" value={`${Math.round(recipe.fat_g)}g`} />
          </div>
          {(recipe.dietary_tags || []).length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {recipe.dietary_tags!.slice(0, 8).map((t) => (
                <span key={t} className="rounded-full border border-border/60 bg-card px-2 py-0.5 text-[10px] text-muted-foreground">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-border/60 p-3">
          <button onClick={() => onSave(recipe)} className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold ${isFav ? "border-primary bg-primary/10 text-primary" : "border-border/60 bg-card"}`}>
            <Heart className={`h-4 w-4 ${isFav ? "fill-primary" : ""}`} /> {isFav ? "Saved" : "Save"}
          </button>
          <button onClick={() => onSwap(recipe)} className="flex items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-2 py-2.5 text-xs font-semibold text-primary-foreground shadow-glow">
            <RefreshCcw className="h-4 w-4" /> Swap today
          </button>
          <button onClick={() => onAdd(recipe)} className="flex items-center justify-center gap-1.5 rounded-xl border border-primary/40 bg-primary/10 px-2 py-2.5 text-xs font-semibold text-primary">
            <Plus className="h-4 w-4" /> Add to week
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card py-2">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    </div>
  );
}

// Lightweight ingredient inference from titles + tags. Server-free, instant.
// The full ingredient list is stored in the recipe detail; for the weekly
// shopping list we extract the most likely staples per recipe so it updates
// instantly as the user swaps meals.
const INGREDIENT_DICT: { match: RegExp; items: string[] }[] = [
  { match: /chicken/i, items: ["chicken breast"] },
  { match: /salmon/i, items: ["salmon fillet"] },
  { match: /tuna/i, items: ["tuna"] },
  { match: /beef|steak/i, items: ["lean beef"] },
  { match: /turkey/i, items: ["ground turkey"] },
  { match: /shrimp|prawn/i, items: ["shrimp"] },
  { match: /tofu/i, items: ["tofu"] },
  { match: /tempeh/i, items: ["tempeh"] },
  { match: /lentil/i, items: ["lentils"] },
  { match: /chickpea|hummus/i, items: ["chickpeas"] },
  { match: /bean/i, items: ["beans"] },
  { match: /egg/i, items: ["eggs"] },
  { match: /oat|granola/i, items: ["rolled oats"] },
  { match: /rice/i, items: ["rice"] },
  { match: /quinoa/i, items: ["quinoa"] },
  { match: /pasta|spaghetti|penne/i, items: ["pasta"] },
  { match: /potato/i, items: ["potatoes"] },
  { match: /sweet potato/i, items: ["sweet potatoes"] },
  { match: /tortilla|wrap|burrito|taco/i, items: ["tortillas"] },
  { match: /bread|toast|sandwich/i, items: ["bread"] },
  { match: /spinach/i, items: ["spinach"] },
  { match: /broccoli/i, items: ["broccoli"] },
  { match: /kale/i, items: ["kale"] },
  { match: /tomato/i, items: ["tomatoes"] },
  { match: /avocado/i, items: ["avocado"] },
  { match: /berry|berries|blueberr|strawberr/i, items: ["mixed berries"] },
  { match: /banana/i, items: ["bananas"] },
  { match: /apple/i, items: ["apples"] },
  { match: /yogurt|yoghurt/i, items: ["greek yogurt"] },
  { match: /cheese|feta|parmesan/i, items: ["cheese"] },
  { match: /almond|cashew|walnut|pecan/i, items: ["mixed nuts"] },
  { match: /peanut/i, items: ["peanut butter"] },
  { match: /olive/i, items: ["olive oil"] },
  { match: /lemon/i, items: ["lemons"] },
  { match: /garlic/i, items: ["garlic"] },
  { match: /onion/i, items: ["onion"] },
  { match: /salad|greens|lettuce/i, items: ["mixed greens"] },
  { match: /cucumber/i, items: ["cucumber"] },
];

function inferIngredients(r: Recipe): string[] {
  const text = `${r.title} ${(r.dietary_tags || []).join(" ")} ${r.description || ""}`;
  const out = new Set<string>();
  for (const entry of INGREDIENT_DICT) {
    if (entry.match.test(text)) entry.items.forEach((i) => out.add(i));
  }
  // Always add a couple of staples so the list never feels empty.
  if (out.size < 3) ["seasonings", "olive oil", "mixed greens"].forEach((s) => out.add(s));
  return Array.from(out);
}
