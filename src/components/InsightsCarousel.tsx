import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type InsightCard = {
  category: string;
  emoji: string;
  headline: string;
  summary: string;
  why_it_matters: string;
  apply_action: string;
  read_minutes: number;
};

let inflight: Promise<InsightCard[]> | null = null;

export async function loadInsights(force = false): Promise<InsightCard[]> {
  const today = new Date().toISOString().slice(0, 10);
  const cacheKey = `forge:insights:${today}`;
  if (!force && typeof window !== "undefined") {
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch {}
  }
  if (inflight && !force) return inflight;
  inflight = (async () => {
    // Try cached row in DB first (free + instant)
    const { data: row } = await supabase
      .from("daily_insights")
      .select("cards")
      .eq("insight_date", today)
      .maybeSingle();
    if (row?.cards && Array.isArray(row.cards) && row.cards.length) {
      try { sessionStorage.setItem(cacheKey, JSON.stringify(row.cards)); } catch {}{}
      return row.cards as InsightCard[];
    }
    // Otherwise call the function which generates & caches
    const { data, error } = await supabase.functions.invoke("daily-insights", { body: {} });
    if (error || !data?.cards) return [];
    try { sessionStorage.setItem(cacheKey, JSON.stringify(data.cards)); } catch {}{}
    return data.cards as InsightCard[];
  })();
  try { return await inflight; } finally { inflight = null; }
}

export function InsightsCarousel() {
  const [cards, setCards] = useState<InsightCard[] | null>(null);

  useEffect(() => {
    loadInsights().then(setCards).catch(() => setCards([]));
  }, []);

  return (
    <div className="mb-6">
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> Latest Insights
          </div>
          <h3 className="mt-1.5 text-lg font-semibold leading-tight">What's new in performance science</h3>
        </div>
        <Link to="/insights" className="flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
          Open feed <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!cards ? (
          <div className="grid h-32 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : cards.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-4 text-sm text-muted-foreground shadow-card">
            New insights are brewing — check back in a moment.
          </div>
        ) : (
          <ul className="flex gap-3 snap-x snap-mandatory">
            {cards.slice(0, 6).map((c, i) => (
              <li key={i} className="snap-start shrink-0 w-[78%] sm:w-[52%]">
                <Link
                  to="/insights"
                  className="block h-full rounded-2xl border border-primary/25 bg-gradient-card p-4 shadow-card transition hover:border-primary/60 active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      {c.emoji} {c.category}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{c.read_minutes} min</span>
                  </div>
                  <h4 className="mt-2 text-base font-bold leading-tight line-clamp-2">{c.headline}</h4>
                  <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground line-clamp-3">{c.summary}</p>
                  <div className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-primary">
                    Read & apply <ChevronRight className="h-3.5 w-3.5" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
