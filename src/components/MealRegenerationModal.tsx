import { useEffect, useMemo, useState } from "react";
import { X, Sparkles, Loader2, RefreshCcw, Check, PlayCircle, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { videoForRecipe, thumbForRecipe } from "@/lib/mealVideos";
import { cn } from "@/lib/utils";

type Recipe = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  meal_type: string;
  cuisine: string | null;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  prep_minutes: number;
  cook_minutes: number;
  dietary_tags: string[];
  allergens: string[];
  hero_emoji: string | null;
  image_url: string | null;
};

const QUICK_FILTERS: { id: string; label: string }[] = [
  { id: "high-protein", label: "Higher protein" },
  { id: "quick", label: "Under 15 min" },
  { id: "keto", label: "Keto" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "low-carb", label: "Low-carb" },
];

const SLOTS = ["breakfast", "lunch", "dinner", "snack"] as const;

export function MealRegenerationModal({
  open,
  onClose,
  initialPrompt,
  initialSlot,
  userAllergens = [],
  userDiets = [],
  macroTargets,
  onSwapped,
}: {
  open: boolean;
  onClose: () => void;
  initialPrompt?: string;
  initialSlot?: string | null;
  userAllergens?: string[];
  userDiets?: string[];
  macroTargets?: { protein_g?: number; calories?: number } | null;
  onSwapped?: (recipe: Recipe) => void;
}) {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [seed, setSeed] = useState(0);
  const [swappingId, setSwappingId] = useState<string | null>(null);

  const slotFilter = useMemo(() => {
    const t = (initialPrompt || "").toLowerCase();
    if (t.includes("breakfast")) return "breakfast";
    if (t.includes("lunch")) return "lunch";
    if (t.includes("dinner")) return "dinner";
    if (t.includes("snack")) return "snack";
    return initialSlot || null;
  }, [initialPrompt, initialSlot]);

  const loadFresh = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("recipes")
        .select("id,slug,title,description,meal_type,cuisine,calories,protein_g,carbs_g,fat_g,prep_minutes,cook_minutes,dietary_tags,allergens,hero_emoji,image_url");

      if (slotFilter && SLOTS.includes(slotFilter as any)) {
        query = query.eq("meal_type", slotFilter);
      }

      // Active filters
      if (activeFilters.has("high-protein")) {
        const min = Math.max(25, Math.round((macroTargets?.protein_g ?? 120) / 4));
        query = query.gte("protein_g", min);
      }
      if (activeFilters.has("quick")) query = query.lte("prep_minutes", 15);
      if (activeFilters.has("keto")) query = query.contains("dietary_tags", ["keto"]);
      if (activeFilters.has("vegetarian")) query = query.contains("dietary_tags", ["vegetarian"]);
      if (activeFilters.has("vegan")) query = query.contains("dietary_tags", ["vegan"]);
      if (activeFilters.has("low-carb")) query = query.contains("dietary_tags", ["low-carb"]);

      // User dietary preferences
      for (const d of userDiets) {
        const tag = d.toLowerCase();
        if (["vegan", "vegetarian", "keto", "low-carb", "gluten-free", "dairy-free", "paleo", "mediterranean", "high-protein"].includes(tag)) {
          query = query.contains("dietary_tags", [tag]);
        }
      }

      const { data, error } = await query.limit(120);
      if (error) throw error;

      let pool = (data ?? []) as Recipe[];

      // Filter out user's allergens
      if (userAllergens.length) {
        const lowered = userAllergens.map((a) => a.toLowerCase());
        pool = pool.filter((r) => !(r.allergens ?? []).some((a) => lowered.some((u) => u.includes(a.toLowerCase()) || a.toLowerCase().includes(u))));
      }

      // Shuffle deterministically using seed
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      setRecipes(shuffled.slice(0, 12));
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't load fresh meals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setActiveFilters(new Set());
      loadFresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (open) loadFresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed, activeFilters]);

  const swap = async (r: Recipe) => {
    setSwappingId(r.id);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from("meal_logs").insert({
        user_id: user.id,
        name: r.title,
        meal_type: r.meal_type,
        calories: r.calories,
        protein_g: r.protein_g,
        carbs_g: r.carbs_g,
        fat_g: r.fat_g,
      });
      toast.success(`✨ Swapped in ${r.title}`);
      onSwapped?.(r);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't swap meal");
    } finally {
      setSwappingId(null);
    }
  };

  const toggleFilter = (id: string) => {
    setActiveFilters((s) => {
      const ns = new Set(s);
      ns.has(id) ? ns.delete(id) : ns.add(id);
      return ns;
    });
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-xl animate-fade-in">
      <div className="sticky top-0 z-10 border-b border-border/60 bg-background/90 px-5 py-4 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> Fresh from the chef
            </div>
            <h2 className="text-xl font-bold leading-tight">
              Here are {recipes.length || 8} brand-new options for you!
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap any meal to swap it into today's plan — every card has a prep video.
            </p>
          </div>
          <button onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-1">
          <Filter className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          {QUICK_FILTERS.map((f) => {
            const on = activeFilters.has(f.id);
            return (
              <button
                key={f.id}
                onClick={() => toggleFilter(f.id)}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition",
                  on ? "border-primary bg-primary/15 text-primary shadow-glow" : "border-border bg-surface text-muted-foreground hover:border-primary/40",
                )}
              >
                {f.label}
              </button>
            );
          })}
          <button
            onClick={() => setSeed((s) => s + 1)}
            disabled={loading}
            className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold text-primary"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCcw className="h-3 w-3" />} Surprise again
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {loading && recipes.length === 0 && (
          <div className="grid place-items-center py-20"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        )}
        {!loading && recipes.length === 0 && (
          <p className="rounded-2xl border border-border/60 bg-gradient-card p-6 text-center text-sm text-muted-foreground">
            No meals matched these filters. Try removing one.
          </p>
        )}
        <div className="grid gap-3 pb-10">
          {recipes.map((r, i) => (
            <RecipeCard
              key={r.id}
              recipe={r}
              index={i}
              swapping={swappingId === r.id}
              onSwap={() => swap(r)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RecipeCard({ recipe, index, swapping, onSwap }: { recipe: Recipe; index: number; swapping: boolean; onSwap: () => void }) {
  const [showVideo, setShowVideo] = useState(false);
  const video = videoForRecipe({
    slug: recipe.slug,
    title: recipe.title,
    meal_type: recipe.meal_type,
    dietary_tags: recipe.dietary_tags,
    cuisine: recipe.cuisine,
  });
  const thumb = thumbForRecipe({
    slug: recipe.slug,
    title: recipe.title,
    meal_type: recipe.meal_type,
    dietary_tags: recipe.dietary_tags,
    cuisine: recipe.cuisine,
  });

  return (
    <div
      className="overflow-hidden rounded-3xl border border-border/60 bg-gradient-card shadow-card animate-fade-in"
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
    >
      <div className="relative aspect-video w-full bg-black">
        {showVideo ? (
          <iframe
            src={`${video.embedUrl}&autoplay=1`}
            title={`${recipe.title} prep video`}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="absolute inset-0 h-full w-full"
          />
        ) : (
          <button onClick={() => setShowVideo(true)} className="group absolute inset-0 h-full w-full">
            <img src={thumb} alt={recipe.title} className="h-full w-full object-cover" loading="lazy" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="absolute inset-0 grid place-items-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/90 text-primary-foreground shadow-glow transition-transform group-hover:scale-110">
                <PlayCircle className="h-7 w-7" />
              </div>
            </div>
            <div className="absolute bottom-2 left-3 right-3 text-left">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">{recipe.meal_type}</div>
              <div className="text-sm font-bold text-white drop-shadow">{recipe.title}</div>
            </div>
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {recipe.hero_emoji ?? "🍽️"} {recipe.cuisine || recipe.meal_type}
            </div>
            <div className="font-bold leading-tight">{recipe.title}</div>
            <div className="mt-1 text-xs text-muted-foreground tabular-nums">
              {recipe.calories} kcal · {recipe.protein_g}P / {recipe.carbs_g}C / {recipe.fat_g}F · {recipe.prep_minutes + recipe.cook_minutes}min
            </div>
            {recipe.dietary_tags?.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {recipe.dietary_tags.slice(0, 3).map((t) => (
                  <span key={t} className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">{t}</span>
                ))}
              </div>
            )}
          </div>
          <Button size="sm" onClick={onSwap} disabled={swapping} className="shrink-0 rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            {swapping ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Swap in</>}
          </Button>
        </div>
        {!showVideo && (
          <button onClick={() => setShowVideo(true)} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
            <PlayCircle className="h-3.5 w-3.5" /> Watch full prep
          </button>
        )}
      </div>
    </div>
  );
}
