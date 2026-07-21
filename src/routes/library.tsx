import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Loader2, ExternalLink, Play, X } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { trackEvent } from "@/lib/usage";

export const Route = createFileRoute("/library")({
  head: () => ({
    meta: [
      { title: "Exercise Library — ForgeCoach" },
      { name: "description", content: "Searchable exercise library with demo videos. Browse strength, mobility, cardio and more." },
    ],
  }),
  component: Library,
});

type Exercise = {
  id: string;
  name: string;
  category: string | null;
  primary_muscles: string[] | null;
  secondary_muscles: string[] | null;
  equipment: string[] | null;
  instructions: string | null;
  video_url: string | null;
};

const CATEGORIES = ["all", "strength", "bodyweight", "core", "mobility", "cardio", "plyo", "power", "recovery"] as const;

function ytId(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/(?:v=|youtu\.be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
function ytEmbed(url: string | null): string | null {
  const id = ytId(url);
  return id ? `https://www.youtube.com/embed/${id}?rel=0&modestbranding=1&cc_load_policy=1&cc_lang_pref=en&hl=en` : null;
}
function ytThumb(url: string | null): string | null {
  const id = ytId(url);
  return id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : null;
}

function Library() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [items, setItems] = useState<Exercise[]>([]);
  const [busy, setBusy] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATEGORIES)[number]>("all");
  const [active, setActive] = useState<Exercise | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    supabase.from("exercises").select("*").order("name").then(({ data }) => {
      setItems((data ?? []) as Exercise[]);
      setBusy(false);
    });
  }, [user, loading, navigate]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return items.filter((e) => {
      if (cat !== "all" && e.category !== cat) return false;
      if (!term) return true;
      const hay = [e.name, e.category, ...(e.primary_muscles ?? []), ...(e.secondary_muscles ?? []), ...(e.equipment ?? [])]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(term);
    });
  }, [items, q, cat]);

  if (loading || busy) {
    return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;
  }

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <div className="mb-5">
          <p className="text-sm text-muted-foreground">Reference</p>
          <h1 className="text-2xl font-bold">Exercise Library</h1>
          <p className="mt-1 text-sm text-muted-foreground">{items.length} exercises with demo videos. Coach Forge can reference these.</p>
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, muscle, equipment…"
            className="h-11 pl-9"
          />
        </div>

        <div className="-mx-5 mb-4 flex gap-2 overflow-x-auto px-5 pb-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                cat === c ? "border-primary bg-primary/15 text-primary" : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-border/60 bg-gradient-card p-6 text-center text-sm text-muted-foreground">
            No exercises match.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-6 sm:grid-cols-2">
            {filtered.map((ex) => {
              const thumb = ytThumb(ex.video_url);
              return (
                <button
                  key={ex.id}
                  onClick={() => { trackEvent("exercise_view", { ref_id: ex.id, ref_label: ex.name }); setActive(ex); }}
                  className="group flex w-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-card text-left shadow-card transition-all hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-glow active:scale-[0.99]"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-black">
                    {thumb ? (
                      <img
                        src={thumb}
                        alt={`${ex.name} demo`}
                        loading="lazy"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-emerald-900/40 to-teal-900/40 text-xs uppercase tracking-wider text-emerald-200/80">
                        Tap to find demo
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <div className="absolute inset-0 grid place-items-center">
                      <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-500 text-white shadow-[0_8px_30px_rgba(16,185,129,0.55)] ring-4 ring-emerald-300/30 transition-transform duration-300 group-hover:scale-110">
                        <Play className="ml-0.5 h-6 w-6 fill-current" />
                      </div>
                    </div>
                    <span className="absolute bottom-2 left-2 rounded-full bg-emerald-500/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur">
                      Watch demo
                    </span>
                    {ex.category && (
                      <span className="absolute right-2 top-2 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-semibold capitalize text-foreground backdrop-blur">
                        {ex.category}
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="line-clamp-1 font-semibold leading-tight">{ex.name}</div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {(ex.primary_muscles ?? []).slice(0, 3).map((m) => (
                        <Badge key={m} variant="outline" className="text-[10px] capitalize">{m}</Badge>
                      ))}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {active && <ExerciseSheet ex={active} onClose={() => setActive(null)} />}
    </AppShell>
  );
}

function ExerciseSheet({ ex, onClose }: { ex: Exercise; onClose: () => void }) {
  const embed = ytEmbed(ex.video_url);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl border border-border/60 bg-background p-5 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight">{ex.name}</h2>
            <div className="mt-1 flex flex-wrap gap-1">
              {ex.category && <Badge variant="secondary" className="capitalize">{ex.category}</Badge>}
              {(ex.primary_muscles ?? []).map((m) => (
                <Badge key={m} variant="outline" className="capitalize">{m}</Badge>
              ))}
            </div>
          </div>
          <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface">
            <X className="h-4 w-4" />
          </button>
        </div>

        {embed ? (
          <>
            <div className="mb-2 aspect-video overflow-hidden rounded-xl border border-border/60 bg-black">
              <iframe src={embed} title={`${ex.name} — proper form demo video (captions available via the CC button)`} allow="accelerometer; encrypted-media; picture-in-picture" allowFullScreen className="h-full w-full" />
            </div>
            <a
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + " proper form demo")}`}
              target="_blank"
              rel="noreferrer"
              className="mb-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-primary"
            >
              Video not loading? Find another demo →
            </a>
          </>
        ) : (
          <a
            href={`https://www.youtube.com/results?search_query=${encodeURIComponent(ex.name + " proper form demo")}`}
            target="_blank"
            rel="noreferrer"
            className="mb-4 flex items-center gap-2 rounded-xl border border-border/60 bg-surface p-3 text-sm font-medium hover:border-primary/40"
          >
            <ExternalLink className="h-4 w-4" /> Watch demo
          </a>
        )}

        {ex.equipment && ex.equipment.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Equipment</div>
            <div className="flex flex-wrap gap-1">
              {ex.equipment.map((e) => <Badge key={e} variant="outline" className="capitalize">{e}</Badge>)}
            </div>
          </div>
        )}

        {ex.secondary_muscles && ex.secondary_muscles.length > 0 && (
          <div className="mb-3">
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Secondary muscles</div>
            <div className="flex flex-wrap gap-1">
              {ex.secondary_muscles.map((m) => <Badge key={m} variant="outline" className="capitalize">{m}</Badge>)}
            </div>
          </div>
        )}

        {ex.instructions && (
          <div>
            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">How to perform</div>
            <p className="whitespace-pre-line text-sm text-foreground/90">{ex.instructions}</p>
          </div>
        )}
      </div>
    </div>
  );
}
