import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Play, Sparkles, ChevronRight, Loader2, Heart, RefreshCcw, CalendarClock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { thumbForRecipe, thumbFallbackForRecipe } from "@/lib/mealVideos";
import { useFavorites } from "@/lib/favorites";
import { weekKey, nextRefreshLabel } from "@/lib/weekRefresh";
import { toast } from "sonner";

type Recipe = {
  id: string;
  slug: string;
  title: string;
  meal_type: string;
  calories: number;
  protein_g: number;
  dietary_tags: string[] | null;
  cuisine: string | null;
};

// Hash a string into 32-bit int
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic shuffle using seed (LCG)
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function DailyFreshPicks() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Recipe[] | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [refreshLabel, setRefreshLabel] = useState(nextRefreshLabel());
  const { isFav, toggle } = useFavorites();

  // Keep the "next refresh" countdown honest across day changes without a reload.
  useEffect(() => {
    const t = setInterval(() => setRefreshLabel(nextRefreshLabel()), 60 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const date = weekKey();
      const manualKey = `forge:fresh-meals:manual:${date}`;
      const manualOffset = (() => {
        try { return Number(sessionStorage.getItem(manualKey) || 0) + refreshNonce; } catch { return refreshNonce; }
      })();
      const cacheKey = `forge:fresh-meals:week:${date}:${manualOffset}`;
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) { setItems(JSON.parse(cached)); return; }
      } catch {}

      const { data } = await supabase
        .from("recipes")
        .select("id,slug,title,meal_type,calories,protein_g,dietary_tags,cuisine")
        .limit(300);
      if (cancelled || !data) return;

      const seed = hash(`${date}:${manualOffset}`);
      const shuffled = seededShuffle(data as Recipe[], seed).slice(0, 12);
      try { sessionStorage.setItem(cacheKey, JSON.stringify(shuffled)); } catch {}
      setItems(shuffled);
    })();
    return () => { cancelled = true; };
  }, [refreshNonce]);

  const open = () => { navigate({ to: "/fresh-meals" }); };

  const getNewMeals = () => {
    const date = weekKey();
    try {
      const cur = Number(sessionStorage.getItem(`forge:fresh-meals:manual:${date}`) || 0);
      sessionStorage.setItem(`forge:fresh-meals:manual:${date}`, String(cur + 1));
    } catch {}
    setItems(null);
    setRefreshNonce((n) => n + 1);
    toast.success("Fresh batch served — next auto-refresh still lands Monday");
  };

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Fresh this week
          </div>
          <h3 className="mt-1.5 text-lg font-semibold leading-tight">This Week's Fresh Meals</h3>
          <div className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <CalendarClock className="h-3 w-3" /> {refreshLabel}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <button
            onClick={getNewMeals}
            aria-label="Get new meals now"
            className="inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary hover:bg-primary/20 transition"
          >
            <RefreshCcw className="h-3 w-3" /> Get new meals
          </button>
          <button onClick={open} className="flex items-center gap-0.5 text-sm font-medium text-primary">
            See all <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!items ? (
          <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : (
          <ul className="flex gap-3 snap-x snap-mandatory">
            {items.map((p) => {
              const thumb = thumbForRecipe(p);
              return (
                <li key={p.id} className="snap-start shrink-0 w-[78%] sm:w-[48%] lg:w-[32%]">
                  <div className="group relative w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-card text-left shadow-card transition hover:border-primary/50">
                    <button onClick={open} className="block w-full text-left active:scale-[0.99]">
                      <div className="relative aspect-video overflow-hidden bg-muted">
                        <img
                          src={thumb}
                          alt={p.title}
                          loading="eager"
                          decoding="async"
                          fetchPriority="high"
                          onError={(e) => {
                            const img = e.currentTarget;
                            const fb = thumbFallbackForRecipe(p);
                            if (img.src !== fb) img.src = fb;
                          }}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                        <div className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white backdrop-blur">
                          {p.meal_type}
                        </div>
                        <div className="absolute right-2 top-2 rounded-full bg-primary/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary-foreground shadow-glow">
                          Fresh
                        </div>
                        <div className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-md ring-1 ring-white/25">
                          <Play className="h-3 w-3 fill-current" /> Prep video
                        </div>
                      </div>
                    </button>
                    <button
                      type="button"
                      aria-label={isFav(p.id) ? "Remove favorite" : "Save meal"}
                      onClick={(e) => {
                        e.stopPropagation();
                        const added = toggle({ id: p.id, slug: p.slug, title: p.title, meal_type: p.meal_type });
                        toast.success(added ? "Saved to favorites" : "Removed from favorites");
                      }}
                      className="absolute right-2 bottom-[68px] z-10 grid h-9 w-9 place-items-center rounded-full bg-background/90 shadow-card backdrop-blur transition hover:scale-110"
                    >
                      <Heart className={`h-4 w-4 ${isFav(p.id) ? "fill-primary text-primary" : "text-muted-foreground"}`} />
                    </button>
                    <button onClick={open} className="block w-full p-3 text-left">
                      <div className="line-clamp-1 text-sm font-semibold">{p.title}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{p.calories} kcal · {Math.round(p.protein_g)}g protein</div>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
