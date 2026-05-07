import { useEffect, useState } from "react";
import { Sparkles, Check, X, Loader2, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { celebrate } from "@/lib/celebrate";

type Adjustment = {
  id: string;
  scope: string;
  trigger: string;
  summary: string;
  coach_note: string | null;
  changes: string[];
  meal_changes: any[];
  macro_changes: Record<string, number>;
  status: string;
  created_at: string;
};

export function AdjustmentsCard() {
  const { user } = useAuth();
  const [items, setItems] = useState<Adjustment[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("program_adjustments")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);
    setItems((data ?? []) as any);
  };

  useEffect(() => { load(); }, [user]);

  const act = async (id: string, action: "approve" | "reject") => {
    setBusyId(id);
    const { data, error } = await supabase.functions.invoke("apply-adjustment", {
      body: { adjustment_id: id, action },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Could not update");
      return;
    }
    toast.success(action === "approve" ? "Plan updated ✨" : "Adjustment dismissed");
    load();
  };

  const generate = async () => {
    setBusyId("gen");
    const { data, error } = await supabase.functions.invoke("auto-adjust", {
      body: { trigger: "manual", auto_apply: true },
    });
    setBusyId(null);
    if (error || (data as any)?.error) {
      toast.error((data as any)?.error || error?.message || "Could not tune right now");
      return;
    }
    const d: any = data ?? {};
    if (!d.should_adjust) {
      toast.success(d.summary ?? "Plan is on track — no changes needed.");
      return;
    }
    const tChanges: string[] = d?.training?.changes ?? [];
    const nChanges: string[] = d?.nutrition?.changes ?? [];
    const all = [...tChanges, ...nChanges].slice(0, 4);
    celebrate();
    toast.success(d.summary ?? "Plan tuned ✨", {
      description: all.length
        ? `Here's what I just tuned for you:\n• ${all.join("\n• ")}`
        : "Applied to your next session and macros.",
      duration: 8000,
    });
    load();
  };

  const pending = items.filter((i) => i.status === "pending");
  const recent = items.filter((i) => i.status !== "pending").slice(0, 2);

  return (
    <div className="mb-6 rounded-3xl border border-primary/30 bg-gradient-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow">
            <Sparkles className="h-4 w-4" />
          </div>
          <h3 className="text-base font-semibold">Latest AI adjustments</h3>
        </div>
        <Button
          onClick={generate}
          disabled={busyId === "gen"}
          variant="ghost"
          className="h-8 text-xs font-semibold text-primary"
        >
          {busyId === "gen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Tune now"}
        </Button>
      </div>

      {pending.length === 0 && recent.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Coach is watching your data. Adjustments appear here when there's a positive tweak to make.
        </p>
      )}

      {pending.map((a) => (
        <div key={a.id} className="mb-3 rounded-2xl border border-primary/40 bg-primary/5 p-4">
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
            {a.scope} · pending
          </div>
          <p className="text-sm font-semibold">{a.summary}</p>
          {a.coach_note && <p className="mt-1 text-xs text-muted-foreground">{a.coach_note}</p>}
          {a.changes?.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              {a.changes.slice(0, 5).map((c, i) => <li key={i}>• {c}</li>)}
            </ul>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              onClick={() => act(a.id, "approve")}
              disabled={busyId === a.id}
              className="h-9 flex-1 rounded-xl bg-gradient-primary text-xs font-semibold text-primary-foreground shadow-glow"
            >
              {busyId === a.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Check className="mr-1 h-3.5 w-3.5" /> Approve</>}
            </Button>
            <Button
              onClick={() => act(a.id, "reject")}
              disabled={busyId === a.id}
              variant="outline"
              className="h-9 rounded-xl text-xs"
            >
              <X className="mr-1 h-3.5 w-3.5" /> Reject
            </Button>
          </div>
        </div>
      ))}

      {recent.map((a) => (
        <div key={a.id} className="mb-2 flex items-start gap-2 rounded-xl border border-border/60 p-3">
          <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>{a.scope}</span>·<span>{a.status}</span>
            </div>
            <p className="text-xs">{a.summary}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
