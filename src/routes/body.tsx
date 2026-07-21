import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, Loader2, Sparkles, Trash2, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PaywallModal } from "@/components/PaywallModal";

export const Route = createFileRoute("/body")({
  head: () => ({ meta: [{ title: "Body Composition — ForgeCoach" }] }),
  component: BodyAnalysis,
});

type Slot = "front" | "side" | "rear";
const SLOTS: Slot[] = ["front", "side", "rear"];

type Analysis = {
  id: string;
  created_at: string;
  front_path: string | null;
  side_path: string | null;
  rear_path: string | null;
  bodyfat_estimate: number | null;
  muscle_notes: string | null;
  posture_notes: string | null;
  feedback: string | null;
  comparison: string | null;
  raw: any;
};

function BodyAnalysis() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [paths, setPaths] = useState<Record<Slot, string | null>>({ front: null, side: null, rear: null });
  const [previews, setPreviews] = useState<Record<Slot, string | null>>({ front: null, side: null, rear: null });
  const [uploading, setUploading] = useState<Slot | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [signedHistory, setSignedHistory] = useState<Record<string, string>>({});
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string }>({ open: false });
  const [selected, setSelected] = useState<Analysis | null>(null);
  const inputs = { front: useRef<HTMLInputElement>(null), side: useRef<HTMLInputElement>(null), rear: useRef<HTMLInputElement>(null) };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/auth" }); return; }
    void loadHistory();
  }, [user, loading, navigate]);

  const loadHistory = async () => {
    if (!user) return;
    const { data } = await supabase.from("body_analyses").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
    const rows = (data ?? []) as Analysis[];
    setHistory(rows);
    // sign first photo of each for thumbnails
    const map: Record<string, string> = {};
    await Promise.all(rows.map(async (r) => {
      if (r.front_path) {
        const { data: s } = await supabase.storage.from("body-photos").createSignedUrl(r.front_path, 3600);
        if (s?.signedUrl) map[r.id] = s.signedUrl;
      }
    }));
    setSignedHistory(map);
  };

  const pickFile = (slot: Slot) => inputs[slot].current?.click();

  const onFile = async (slot: Slot, file: File | null) => {
    if (!file || !user) return;
    setUploading(slot);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/${Date.now()}-${slot}.${ext}`;
      const { error } = await supabase.storage.from("body-photos").upload(path, file, { upsert: false, contentType: file.type });
      if (error) throw error;
      setPaths((p) => ({ ...p, [slot]: path }));
      setPreviews((p) => ({ ...p, [slot]: URL.createObjectURL(file) }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  const allReady = paths.front && paths.side && paths.rear;

  const analyze = async () => {
    if (!allReady) return;
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("analyze-body", {
        body: { front_path: paths.front, side_path: paths.side, rear_path: paths.rear },
      });
      const d: any = data;
      if (d?.error === "limit_reached") {
        setPaywall({ open: true, reason: d.message });
        return;
      }
      if (error) throw error;
      toast.success("Analysis complete");
      setPaths({ front: null, side: null, rear: null });
      setPreviews({ front: null, side: null, rear: null });
      await loadHistory();
      if (d?.record) setSelected(d.record);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const removeRecord = async (id: string) => {
    const r = history.find((h) => h.id === id);
    if (!r) return;
    const paths = [r.front_path, r.side_path, r.rear_path].filter(Boolean) as string[];
    if (paths.length) await supabase.storage.from("body-photos").remove(paths);
    await supabase.from("body_analyses").delete().eq("id", id);
    setHistory((h) => h.filter((x) => x.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  if (loading) return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;

  return (
    <AppShell>
      <div className="px-5 pt-12">
        <div className="mb-6 flex items-center gap-3">
          <Link to="/profile" className="grid h-10 w-10 place-items-center rounded-full bg-surface"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <p className="text-sm text-muted-foreground">Progress</p>
            <h1 className="page-title">Body Composition</h1>
          </div>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">Upload front, side, and rear photos in good lighting. Coach Forge estimates body-fat %, notes muscle development & posture, and tracks before/after over time.</p>

        <div className="mb-4 grid grid-cols-3 gap-3">
          {SLOTS.map((slot) => (
            <div key={slot}>
              <input
                ref={inputs[slot]}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => onFile(slot, e.target.files?.[0] ?? null)}
              />
              <button
                onClick={() => pickFile(slot)}
                disabled={!!uploading}
                className="aspect-[3/4] w-full overflow-hidden rounded-2xl border border-border/60 bg-surface text-center transition-all hover:border-primary/50"
              >
                {previews[slot] ? (
                  <img src={previews[slot]!} alt={slot} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-2">
                    {uploading === slot ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <Camera className="h-5 w-5 text-primary" />}
                    <div className="text-xs font-semibold capitalize text-foreground">{slot}</div>
                    <div className="text-[10px] text-muted-foreground">Tap to add</div>
                  </div>
                )}
              </button>
            </div>
          ))}
        </div>

        <Button onClick={analyze} disabled={!allReady || analyzing} className="h-12 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow disabled:opacity-40">
          {analyzing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Analyzing…</> : <><Sparkles className="mr-2 h-4 w-4" /> Analyze body composition</>}
        </Button>

        {selected && (
          <div className="mt-5 rounded-3xl border border-primary/30 bg-gradient-card p-5 shadow-card">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-primary">Latest assessment</div>
              {selected.bodyfat_estimate != null && (
                <div className="text-2xl font-bold text-gradient-primary">{Number(selected.bodyfat_estimate).toFixed(1)}% BF</div>
              )}
            </div>
            {selected.muscle_notes && <p className="mb-2 text-sm"><span className="font-semibold">Muscle:</span> {selected.muscle_notes}</p>}
            {selected.posture_notes && <p className="mb-2 text-sm"><span className="font-semibold">Posture:</span> {selected.posture_notes}</p>}
            {selected.feedback && <p className="mb-2 text-sm whitespace-pre-line"><span className="font-semibold">Coach:</span> {selected.feedback}</p>}
            {selected.comparison && <p className="text-sm text-primary"><span className="font-semibold">Progress:</span> {selected.comparison}</p>}
            {selected.raw?.wins?.length > 0 && (
              <div className="mt-3 text-xs text-success"><span className="font-semibold">Wins:</span> {selected.raw.wins.join(" · ")}</div>
            )}
            {selected.raw?.focus_next?.length > 0 && (
              <div className="mt-1 text-xs text-warning"><span className="font-semibold">Focus next:</span> {selected.raw.focus_next.join(" · ")}</div>
            )}
          </div>
        )}

        {history.length > 0 && (
          <div className="mt-6">
            <h3 className="mb-3 text-sm font-semibold">Progress timeline</h3>
            <div className="space-y-2">
              {history.map((h) => (
                <button key={h.id} onClick={() => setSelected(h)} className="flex w-full items-center gap-3 rounded-2xl border border-border/60 bg-gradient-card p-3 text-left shadow-card transition-all hover:border-primary/50">
                  <div className="h-14 w-14 overflow-hidden rounded-xl bg-surface">
                    {signedHistory[h.id] ? <img src={signedHistory[h.id]} alt="thumb" className="h-full w-full object-cover" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{new Date(h.created_at).toLocaleDateString()}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.bodyfat_estimate != null ? `${Number(h.bodyfat_estimate).toFixed(1)}% BF · ` : ""}
                      {h.muscle_notes ? h.muscle_notes.slice(0, 60) + (h.muscle_notes.length > 60 ? "…" : "") : ""}
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); removeRecord(h.id); }} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <PaywallModal open={paywall.open} onClose={() => setPaywall({ open: false })} reason={paywall.reason} recommend="pro" />
    </AppShell>
  );
}
