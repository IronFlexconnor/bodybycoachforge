import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Search, Sparkles, Heart, Play, Loader2, RefreshCcw, Shuffle,
  Filter, Clock, Flame, Leaf, Utensils, ChevronRight, Plus, X, Check,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { thumbForRecipe, thumbFallbackForRecipe, videoForRecipe } from "@/lib/mealVideos";
import { useFavorites } from "@/lib/favorites";
import { toast } from "sonner";

export const Route = createFileRoute("/fresh-meals")({
  head: () => ({
    meta: [
      { title: "Today's Fresh Meals — Body Forge" },
      { name: "description", content: "5,000+ chef-tested meals with prep videos, smart filters, and one-tap save & swap." },
      { property: "og:title", content: "Today's Fresh Meals — Body Forge" },
      { property: "og:description", content: "Big videos. Mouth-watering picks. Filters, swaps, and saves in one tap." },
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
  | "all" | "high-protein" | "low-carb" | "quick" | "vegetarian"
  | "vegan" | "senior" | "budget" | "family";

const FILTERS: { key: FilterKey; label: string; icon: any }[] = [
  { key: "all", label: "All", icon: Sparkles },
  { key: "high-protein", label: "High protein", icon: Flame },
  { key: "low-carb", label: "Low carb", icon: Leaf },
  { key: "quick", label: "Under 15 min", icon: Clock },
  { key: "vegetarian", label: "Vegetarian", icon: Leaf },
  { key: "vegan", label: "Vegan", icon: Leaf },
  { key: "senior", label: "Senior-friendly", icon: Heart },
  { key: "budget", label: "Budget", icon: Utensils },
  { key: "family", label: "Family", icon: Utensils },
];

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

function tagMatches(r: Recipe, key: FilterKey): boolean {
  const tags = (r.dietary_tags || []).map((t) => t.toLowerCase());
  switch (key) {
    case "all": return true;
    case "high-protein": return Number(r.protein_g) >= 30;
    case "low-carb": return Number(r.carbs_g) <= 30;
    case "quick": return (r.prep_minutes + r.cook_minutes) <= 15;
    case "vegetarian": return tags.some((t) => t.includes("vegetarian") || t.includes("veg"));
    case "vegan": return tags.some((t) => t.includes("vegan") || t.includes("plant"));
    case "senior": return tags.some((t) => t.includes("senior") || t.includes("geriatric") || t.includes("soft") || t.includes("gentle")) || r.difficulty === "easy";
    case "budget": return tags.some((t) => t.includes("budget") || t.includes("cheap") || t.includes("pantry"));
    case "family": return tags.some((t) => t.includes("family") || t.includes("kid"));
  }
}

function FreshMealsPage() {
  const navigate = useNavigate();
  const [all, setAll] = useState<Recipe[] | null>(null);
  const [seedOffset, setSeedOffset] = useState(0);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<Recipe | null>(null);
  const { isFav, toggle } = useFavorites();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("recipes")
        .select("id,slug,title,description,meal_type,cuisine,dietary_tags,calories,protein_g,carbs_g,fat_g,prep_minutes,cook_minutes,difficulty")
        .limit(600);
      if (cancelled || !data) return;
      setAll(data as Recipe[]);
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!all) return null;
    const seed = hash(todayKey()) + seedOffset * 9973;
    let list = seededShuffle(all, seed);
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
  }, [all, seedOffset, filter, query]);

  const carousels = useMemo(() => {
    if (!filtered) return null;
    const pick = (k: FilterKey, n = 10) => filtered.filter((r) => tagMatches(r, k)).slice(0, n);
    return {
      hero: filtered.slice(0, 6),
      protein: pick("high-protein"),
      quick: pick("quick"),
      senior: pick("senior"),
      budget: pick("budget"),
      family: pick("family"),
      surprise: seededShuffle(filtered, hash(todayKey() + ":" + seedOffset)).slice(0, 10),
    };
  }, [filtered, seedOffset]);

  const regenAll = () => {
    setSeedOffset((n) => n + 1);
    toast.success("Fresh batch served — same macros, brand-new variety");
  };

  const swapIntoPlan = (r: Recipe) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("forge:open-regen", `swap ${r.title} into today's plan with similar macros`);
    }
    toast.success(`Swapping ${r.title} into today's plan…`);
    navigate({ to: "/nutrition" });
  };

  const addToWeek = (r: Recipe) => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("forge:open-regen", `add ${r.title} to this week's meal plan`);
    }
    toast.success(`Added ${r.title} to this week`);
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
              <Sparkles className="h-3 w-3" /> Fresh today
            </div>
            <h1 className="mt-1 text-2xl font-bold leading-tight">Today's Fresh Meals</h1>
            <p className="text-xs text-muted-foreground">Chef-tested · prep videos · macro-smart swaps</p>
          </div>
          <button onClick={regenAll} aria-label="Regenerate" className="grid h-10 w-10 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow hover:scale-105 transition">
            <RefreshCcw className="h-4 w-4" />
          </button>
        </div>

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
              const active = filter === f.key;
              const Icon = f.icon;
              return (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition ${
                    active
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

        {!carousels ? (
          <div className="grid h-64 place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : carousels.hero.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No meals match your search. Try clearing filters.</p>
          </div>
        ) : (
          <>
            {/* Hero card */}
            <HeroCard recipe={carousels.hero[0]} onOpen={setActive} onSave={(r) => {
              const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type });
              toast.success(added ? "Saved to favorites" : "Removed from favorites");
            }} isFav={isFav(carousels.hero[0].id)} onSwap={swapIntoPlan} />

            <Row title="Today's hero picks" subtitle="Hand-picked for your goals" items={carousels.hero.slice(1)} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />
            <Row title="High-protein picks" subtitle="30g+ protein per serving" items={carousels.protein} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />
            <Row title="Quick & easy" subtitle="Under 15 minutes" items={carousels.quick} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />
            <Row title="Senior-friendly" subtitle="Gentle, soft, easy on joints" items={carousels.senior} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />
            <Row title="Budget meals" subtitle="Under $5 per serving" items={carousels.budget} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />
            <Row title="Family favorites" subtitle="Crowd pleasers" items={carousels.family} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />

            {/* Surprise me */}
            <div className="mb-3 mt-2 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold leading-tight">Surprise me</h2>
                <p className="text-xs text-muted-foreground">A random twist on today's macros</p>
              </div>
              <button onClick={regenAll} className="flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15">
                <Shuffle className="h-3.5 w-3.5" /> Shuffle
              </button>
            </div>
            <Row title="" subtitle="" items={carousels.surprise} onOpen={setActive} onSave={(r) => { const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type }); toast.success(added ? "Saved" : "Removed"); }} isFav={isFav} />

            {/* Regenerate footer */}
            <button
              onClick={regenAll}
              className="mb-8 mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-primary/40 bg-gradient-primary p-4 font-semibold text-primary-foreground shadow-glow hover:scale-[1.01] transition"
            >
              <RefreshCcw className="h-4 w-4" /> Regenerate all fresh meals
            </button>
          </>
        )}
      </div>

      {/* Detail sheet */}
      {active && (
        <DetailSheet
          recipe={active}
          onClose={() => setActive(null)}
          isFav={isFav(active.id)}
          onSave={(r) => {
            const added = toggle({ id: r.id, slug: r.slug, title: r.title, meal_type: r.meal_type });
            toast.success(added ? "Saved to favorites" : "Removed from favorites");
          }}
          onSwap={swapIntoPlan}
          onAdd={addToWeek}
        />
      )}
    </AppShell>
  );
}

function HeroCard({ recipe, onOpen, onSave, isFav, onSwap }: {
  recipe: Recipe; onOpen: (r: Recipe) => void; onSave: (r: Recipe) => void; isFav: boolean; onSwap: (r: Recipe) => void;
}) {
  return (
    <div className="mb-6 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-card shadow-card">
      <button onClick={() => onOpen(recipe)} className="block w-full text-left">
        <div className="relative aspect-[16/10] overflow-hidden bg-muted">
          <img
            src={thumbForRecipe(recipe)}
            alt={recipe.title}
            loading="eager"
            decoding="async"
            fetchPriority="high"
            onError={(e) => { const img = e.currentTarget; const fb = thumbFallbackForRecipe(recipe); if (img.src !== fb) img.src = fb; }}
            className="h-full w-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
          <div className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-md ring-1 ring-white/30">
            <Play className="h-3 w-3 fill-current" /> Prep video
          </div>
          <div className="absolute left-3 top-3 rounded-full bg-primary/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
            Fresh hero
          </div>
          <div className="absolute bottom-3 left-3 right-3 text-white">
            <div className="text-[10px] font-semibold uppercase tracking-wider opacity-90">{recipe.meal_type} · {recipe.prep_minutes + recipe.cook_minutes} min</div>
            <div className="text-xl font-bold leading-tight drop-shadow">{recipe.title}</div>
            <div className="mt-0.5 text-xs opacity-90">{recipe.calories} kcal · {Math.round(recipe.protein_g)}g protein</div>
          </div>
        </div>
      </button>
      <div className="flex gap-2 p-3">
        <button onClick={() => onSwap(recipe)} className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-glow">
          <RefreshCcw className="h-4 w-4" /> Swap into today
        </button>
        <button onClick={() => onSave(recipe)} aria-label="Save" className={`grid h-10 w-10 place-items-center rounded-xl border ${isFav ? "border-primary bg-primary/10" : "border-border/60 bg-card"}`}>
          <Heart className={`h-4 w-4 ${isFav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
        </button>
      </div>
    </div>
  );
}

function Row({ title, subtitle, items, onOpen, onSave, isFav }: {
  title: string; subtitle: string; items: Recipe[];
  onOpen: (r: Recipe) => void; onSave: (r: Recipe) => void; isFav: (id: string) => boolean;
}) {
  if (!items.length) return null;
  return (
    <section className="mb-6">
      {title && (
        <div className="mb-3">
          <h2 className="text-lg font-semibold leading-tight">{title}</h2>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      )}
      <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-3 snap-x snap-mandatory">
          {items.map((r) => {
            const fav = isFav(r.id);
            return (
              <li key={r.id} className="snap-start shrink-0 w-[78%] sm:w-[48%] lg:w-[32%]">
                <div className="group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-card transition hover:border-primary/50">
                  <button onClick={() => onOpen(r)} className="block w-full text-left active:scale-[0.99]">
                    <div className="relative aspect-video overflow-hidden bg-muted">
                      <img
                        src={thumbForRecipe(r)}
                        alt={r.title}
                        loading="lazy"
                        decoding="async"
                        onError={(e) => { const img = e.currentTarget; const fb = thumbFallbackForRecipe(r); if (img.src !== fb) img.src = fb; }}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent" />
                      <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
                        {r.meal_type}
                      </div>
                      <div className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-glow">
                        {(r.prep_minutes + r.cook_minutes)}m
                      </div>
                      <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md ring-1 ring-white/25">
                        <Play className="h-3 w-3 fill-current" /> Prep video
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    aria-label={fav ? "Remove favorite" : "Save meal"}
                    onClick={(e) => { e.stopPropagation(); onSave(r); }}
                    className="absolute right-2 bottom-[60px] z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 shadow-card backdrop-blur transition hover:scale-110"
                  >
                    <Heart className={`h-4 w-4 ${fav ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                  </button>
                  <button onClick={() => onOpen(r)} className="block w-full p-3 text-left">
                    <div className="line-clamp-1 text-sm font-semibold">{r.title}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{r.calories} kcal · {Math.round(r.protein_g)}g protein</div>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
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
            title={recipe.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
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
