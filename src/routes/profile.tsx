import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, Settings, Bell, Heart, Dumbbell, Apple, Shield, LogOut, Sparkles, Loader2, Crown, CreditCard } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useSubscription } from "@/hooks/useSubscription";
import { createPortalSession } from "@/utils/payments.functions";
import { getStripeEnvironment, PLAN_BY_PRICE } from "@/lib/stripe";
import { MeasurementSystemPicker } from "@/components/MeasurementSystemPicker";
import { HeightPicker, ftInToCm, cmToFtIn, formatHeight, type HeightUnit } from "@/components/HeightPicker";
import { InjuryAssessment, parseInjuries, serializeInjuries } from "@/components/InjuryAssessment";
import { NutritionPreferencesForm, DEFAULT_NUTRITION } from "@/components/NutritionPreferences";
import { DEFAULT_UNITS, type Units, displayWeight, unitsToWeightUnit } from "@/lib/units";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Profile — Body Forge" }] }),
  component: Profile,
});

function Profile() {
  const navigate = useNavigate();
  const { user, loading, signOut } = useAuth();
  const [p, setP] = useState<any>(null);
  const [program, setProgram] = useState<any>(null);
  const [regen, setRegen] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const { sub, isActive, tier, isTrialing } = useSubscription();
  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);

  const updateUnits = async (next: Units) => {
    setUnits(next);
    if (!user) return;
    const { error } = await supabase.from("profiles").update({ units: next }).eq("user_id", user.id);
    if (error) toast.error("Could not save unit preference");
  };

  const openPortal = async () => {
    setPortalBusy(true);
    try {
      const url = await createPortalSession({
        data: { environment: getStripeEnvironment(), returnUrl: window.location.href },
      });
      window.open(url, "_blank");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not open billing portal");
    } finally {
      setPortalBusy(false);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate({ to: "/welcome" }); return; }
    supabase.from("profiles").select("*").eq("user_id", user.id).maybeSingle().then(({ data }) => {
      setP(data);
      if (data?.units === "metric" || data?.units === "imperial") setUnits(data.units);
    });
    supabase.from("programs").select("*").eq("user_id", user.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle().then(({ data }) => setProgram(data));
  }, [user, loading, navigate]);

  const regenerate = async () => {
    setRegen(true);
    try {
      toast.loading("Designing a new program…", { id: "gen" });
      const { data, error } = await supabase.functions.invoke("generate-program");
      toast.dismiss("gen");
      if (error || (data as any)?.error) throw new Error((data as any)?.error || error?.message);
      toast.success("Fresh program ready 💪");
      const { data: pr } = await supabase.from("programs").select("*").eq("user_id", user!.id).eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      setProgram(pr);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setRegen(false);
    }
  };

  if (loading || !p) return <AppShell><div className="grid min-h-dvh place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div></AppShell>;

  const name = p.name || "Athlete";
  return (
    <AppShell>
      <div className="px-5 pt-12">
        <h1 className="mb-6 text-2xl font-bold">Profile</h1>

        <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
          <div className="flex items-center gap-4">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-primary text-2xl font-bold text-primary-foreground shadow-glow">
              {name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="text-lg font-semibold">{name}</div>
              <div className="text-sm text-muted-foreground">{p.level || "—"} · {p.goal || "No goal"}</div>
              <div className="text-xs text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 divide-x divide-border/60 rounded-2xl bg-background/40 py-3 text-center">
            <Mini label="Age" value={p.age ?? "—"} />
            <Mini label="Weight" value={displayWeight(p.weight, units)} />
            <Mini label="Height" value={formatHeight(p.height, (p.height_unit === "metric" ? "metric" : "imperial"))} />
          </div>
        </div>

        <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
          <MeasurementSystemPicker
            value={unitsToWeightUnit(units)}
            onChange={(w) => updateUnits(w === "lbs" ? "imperial" : "metric")}
          />
        </div>

        <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
          <HeightPicker
            unit={(p.height_unit === "metric" ? "metric" : "imperial") as HeightUnit}
            onUnitChange={async (u) => {
              if (!user) return;
              const { error } = await supabase.from("profiles").update({ height_unit: u }).eq("user_id", user.id);
              if (error) { toast.error("Could not save height format"); return; }
              setP({ ...p, height_unit: u });
            }}
            feet={cmToFtIn(p.height).feet}
            inches={cmToFtIn(p.height).inches}
            cm={p.height != null ? Math.round(Number(p.height)) : null}
            onChange={async (v) => {
              if (!user) return;
              let cm: number | null = null;
              const hu: HeightUnit = p.height_unit === "metric" ? "metric" : "imperial";
              if (hu === "imperial") {
                if (v.feet == null || v.inches == null) return;
                cm = ftInToCm(v.feet, v.inches);
              } else {
                if (v.cm == null || v.cm < 100 || v.cm > 250) return;
                cm = v.cm;
              }
              const { error } = await supabase.from("profiles").update({ height: cm }).eq("user_id", user.id);
              if (error) { toast.error("Could not save height"); return; }
              setP({ ...p, height: cm });
              toast.success("Height updated");
            }}
          />
        </div>

        <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
          <InjuryAssessment
            value={parseInjuries(p.injuries)}
            onChange={async (v) => {
              if (!user) return;
              const serialized = serializeInjuries(v);
              const { error } = await supabase.from("profiles").update({ injuries: serialized }).eq("user_id", user.id);
              if (error) { toast.error("Could not save injuries"); return; }
              setP({ ...p, injuries: serialized });
            }}
          />
        </div>

        <div className="mb-6 rounded-3xl border border-border/60 bg-gradient-card p-5 shadow-card">
          <h3 className="mb-3 text-sm font-semibold">Nutrition preferences</h3>
          <NutritionPreferencesForm
            value={{ ...DEFAULT_NUTRITION, ...((p as any).nutrition_preferences ?? {}) }}
            onChange={async (v) => {
              if (!user) return;
              const { error } = await supabase.from("profiles").update({ nutrition_preferences: v }).eq("user_id", user.id);
              if (error) { toast.error("Could not save nutrition preferences"); return; }
              setP({ ...p, nutrition_preferences: v });
            }}
          />
        </div>

        <Section title="Training">
          <Row icon={Dumbbell} label="Current program" value={program?.name ?? "—"} />
          <Row icon={Heart} label="Days per week" value={`${p.days_per_week ?? 4}`} />
        </Section>

        <Section title="Nutrition">
          <Row icon={Apple} label="Diet preference" value={p.diet || "Not set"} />
        </Section>

        <Section title="Subscription">
          {isActive && sub ? (
            <>
              <Row
                icon={Crown}
                label={`${tier === "elite" ? "Elite AI Coach" : "Pro Coach"}${isTrialing ? " · Trial" : ""}`}
                value={
                  sub.cancel_at_period_end
                    ? `Ends ${sub.current_period_end ? new Date(sub.current_period_end).toLocaleDateString() : ""}`
                    : sub.current_period_end
                      ? `Renews ${new Date(sub.current_period_end).toLocaleDateString()}`
                      : "Active"
                }
              />
              <button
                onClick={openPortal}
                disabled={portalBusy}
                className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3.5 text-left last:border-0 hover:bg-surface/60 disabled:opacity-50"
              >
                <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">
                  {portalBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                </div>
                <div className="flex-1 text-sm font-medium">Manage subscription</div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate({ to: "/pricing" })}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-surface/60"
            >
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-primary text-primary-foreground shadow-glow">
                <Crown className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold">Upgrade to Pro Coach</div>
                <div className="text-[11px] text-muted-foreground">7-day free trial · Cancel anytime</div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </button>
          )}
        </Section>

        <Button onClick={regenerate} disabled={regen} className="mb-3 h-12 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow">
          {regen ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
          Regenerate program with AI
        </Button>

        <Button variant="outline" onClick={() => navigate({ to: "/onboarding" })} className="mb-3 h-12 w-full rounded-xl border-border bg-surface">
          <Settings className="mr-2 h-4 w-4" /> Edit profile & goals
        </Button>

        <Button variant="outline" onClick={async () => { await signOut(); navigate({ to: "/welcome" }); }}
          className="h-12 w-full rounded-xl border-border bg-surface text-destructive hover:text-destructive">
          <LogOut className="mr-2 h-4 w-4" /> Sign out
        </Button>

        <p className="mt-6 text-center text-[11px] leading-relaxed text-muted-foreground">
          Body Forge AI is not medical advice. Consult your physician before starting a new program.
        </p>
      </div>
    </AppShell>
  );
}

function Mini({ label, value }: { label: string; value: string | number }) {
  return <div><div className="text-base font-bold tabular-nums">{value}</div><div className="text-[11px] text-muted-foreground">{label}</div></div>;
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="mb-6"><h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3><div className="overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-card">{children}</div></div>;
}
function Row({ icon: Icon, label, value }: { icon: typeof Heart; label: string; value: string }) {
  return (
    <div className="flex w-full items-center gap-3 border-b border-border/40 px-4 py-3.5 last:border-0">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary"><Icon className="h-4 w-4" /></div>
      <div className="flex-1 text-sm font-medium">{label}</div>
      <div className="text-sm text-muted-foreground">{value}</div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}
