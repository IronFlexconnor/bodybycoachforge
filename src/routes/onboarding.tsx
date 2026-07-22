import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, Flame, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MeasurementSystemPicker } from "@/components/MeasurementSystemPicker";
import { HeightPicker, cmToFtIn, ftInToCm, type HeightUnit } from "@/components/HeightPicker";
import { InjuryAssessment, parseInjuries, serializeInjuries } from "@/components/InjuryAssessment";
import {
  NutritionPreferencesForm,
  DEFAULT_NUTRITION,
  type NutritionPrefs,
} from "@/components/NutritionPreferences";
import {
  DEFAULT_UNITS,
  type Units,
  fromMetricWeight,
  unitsToWeightUnit,
  weightLabel,
  toMetricWeight,
} from "@/lib/units";
import { GOAL_CARDS } from "@/components/GoalSelector";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Get Started — Body Forge AI Coach" },
      {
        name: "description",
        content: "Build your personalized AI coaching profile in under 2 minutes.",
      },
    ],
  }),
  component: Onboarding,
});

const goals = [
  "Fat Loss",
  "Build Muscle",
  "Get Stronger",
  "Endurance",
  "Mobility",
  "General Health",
  "Sport-Specific",
];
const levels = ["Beginner", "Intermediate", "Advanced"];
const genders = ["Male", "Female", "Other"];
const equipmentOptions = [
  "Bodyweight",
  "Dumbbells",
  "Barbell",
  "Resistance Bands",
  "Pull-up Bar",
  "Full Gym",
  "Cardio Machines",
];
const diets = ["No Preference", "High Protein", "Vegetarian", "Vegan", "Keto", "Mediterranean"];

type Data = {
  name?: string;
  age?: string;
  gender?: string;
  level?: string;
  goal?: string;
  daysPerWeek?: number;
  sessionLength?: number;
  equipment?: string[];
  diet?: string;
  injuries?: string;
  weight?: string;
  heightUnit?: HeightUnit;
  heightFeet?: number | null;
  heightInches?: number | null;
  heightCm?: number | null;
  injurySelected?: string[];
  injuryNotes?: string;
  nutrition?: NutritionPrefs;
  agreedToDisclaimer?: boolean;
};

function Onboarding() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [step, setStep] = useState(0);
  const [building, setBuilding] = useState(false);
  const [data, setData] = useState<Data>({
    daysPerWeek: 4,
    sessionLength: 45,
    equipment: [],
    heightUnit: "imperial",
    nutrition: DEFAULT_NUTRITION,
  });
  const [units, setUnits] = useState<Units>(DEFAULT_UNITS);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  // Hydrate from existing profile if present
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data: p }) => {
        if (p) {
          const u: Units = p.units === "metric" ? "metric" : "imperial";
          setUnits(u);
          const ft = cmToFtIn(p.height);
          const hu: HeightUnit = (p as any).height_unit === "metric" ? "metric" : "imperial";
          setData({
            name: p.name ?? "",
            age: p.age?.toString() ?? "",
            gender: p.gender ?? undefined,
            level: p.level ?? undefined,
            goal: p.goal ?? undefined,
            daysPerWeek: p.days_per_week ?? 4,
            sessionLength: p.session_length ?? 45,
            equipment: p.equipment ?? [],
            diet: p.diet ?? undefined,
            injuries: p.injuries ?? "",
            injurySelected: parseInjuries(p.injuries).selected,
            injuryNotes: parseInjuries(p.injuries).notes,
            agreedToDisclaimer: !!(p as any).agreed_to_disclaimer,
            nutrition: { ...DEFAULT_NUTRITION, ...((p as any).nutrition_preferences ?? {}) },
            weight: fromMetricWeight(p.weight, u),
            heightUnit: hu,
            heightFeet: ft.feet,
            heightInches: ft.inches,
            heightCm: p.height != null ? Math.round(Number(p.height)) : null,
          });
          if (p.onboarded) navigate({ to: "/" });
        }
      });
  }, [user, navigate]);

  const switchUnits = (next: Units) => {
    if (next === units) return;
    setData((d) => {
      const wKg = toMetricWeight(d.weight ?? "", units);
      return {
        ...d,
        weight: wKg != null ? fromMetricWeight(wKg, next) : d.weight,
      };
    });
    setUnits(next);
  };

  const update = <K extends keyof Data>(k: K, v: Data[K]) => setData((d) => ({ ...d, [k]: v }));

  const toggleEquip = (e: string) => {
    const set = new Set(data.equipment ?? []);
    set.has(e) ? set.delete(e) : set.add(e);
    update("equipment", Array.from(set));
  };

  const steps = useMemo(
    () => [
      {
        title: "Measurement System",
        subtitle: "Preferred Measurement System for Tracking Exercises",
        valid: true,
        body: (
          <MeasurementSystemPicker
            value={unitsToWeightUnit(units)}
            onChange={(w) => switchUnits(w === "lbs" ? "imperial" : "metric")}
            compact
          />
        ),
      },
      {
        title: "What is your height?",
        subtitle: "Pick your preferred format and enter your height.",
        valid:
          (data.heightUnit ?? "imperial") === "imperial"
            ? data.heightFeet != null && data.heightInches != null
            : data.heightCm != null && data.heightCm >= 100 && data.heightCm <= 250,
        body: (
          <HeightPicker
            unit={data.heightUnit ?? "imperial"}
            onUnitChange={(u) => setData((d) => ({ ...d, heightUnit: u }))}
            feet={data.heightFeet ?? null}
            inches={data.heightInches ?? null}
            cm={data.heightCm ?? null}
            onChange={(v) =>
              setData((d) => ({ ...d, heightFeet: v.feet, heightInches: v.inches, heightCm: v.cm }))
            }
            compact
          />
        ),
      },
      {
        title: "Any Injuries or Limitations?",
        subtitle:
          "Do you have any current or past injuries, pain, or limitations the AI coach should work around or progress safely?",
        valid: (data.injurySelected?.length ?? 0) > 0 || !!data.injuryNotes?.trim(),
        body: (
          <InjuryAssessment
            value={{ selected: data.injurySelected ?? [], notes: data.injuryNotes ?? "" }}
            onChange={(v) =>
              setData((d) => ({ ...d, injurySelected: v.selected, injuryNotes: v.notes }))
            }
            compact
          />
        ),
      },
      {
        title: "What should your coach call you?",
        subtitle: "Let's make this personal.",
        valid: !!data.name?.trim(),
        body: (
          <Input
            autoFocus
            placeholder="Your name"
            value={data.name ?? ""}
            onChange={(e) => update("name", e.target.value)}
            className="h-14 text-lg font-semibold text-white placeholder:text-white/80"
          />
        ),
      },
      {
        title: "Tell us about you",
        subtitle: "Helps us calibrate intensity & recovery.",
        valid: !!data.age && !!data.gender,
        body: (
          <div className="space-y-4">
            <Input
              type="number"
              placeholder="Age"
              value={data.age ?? ""}
              onChange={(e) => update("age", e.target.value)}
              className="h-14 text-lg font-semibold text-white placeholder:text-white/80"
            />
            <Chips options={genders} value={data.gender} onSelect={(v) => update("gender", v)} />
            <Input
              inputMode="decimal"
              placeholder={`Weight (${weightLabel(units)})`}
              value={data.weight ?? ""}
              onChange={(e) => update("weight", e.target.value)}
              className="h-14 font-semibold text-white placeholder:text-white/80"
            />
          </div>
        ),
      },
      {
        title: "Your experience level",
        subtitle: "Be honest — your coach adapts every week.",
        valid: !!data.level,
        body: (
          <ChipsLarge options={levels} value={data.level} onSelect={(v) => update("level", v)} />
        ),
      },
      {
        title: "What's your #1 goal?",
        subtitle: "Pick a goal — Coach designs the whole program around it.",
        valid: !!data.goal,
        body: <GoalGrid value={data.goal} onSelect={(v) => update("goal", v)} />,
      },
      {
        title: "Your schedule",
        subtitle: "Quality over quantity — every session counts.",
        valid: true,
        body: (
          <div className="space-y-6">
            <Slider
              label="Training days / week"
              value={data.daysPerWeek ?? 4}
              min={2}
              max={7}
              onChange={(v) => update("daysPerWeek", v)}
              suffix="days"
            />
            <Slider
              label="Session length"
              value={data.sessionLength ?? 45}
              min={15}
              max={120}
              step={5}
              onChange={(v) => update("sessionLength", v)}
              suffix="min"
            />
          </div>
        ),
      },
      {
        title: "What equipment do you have?",
        subtitle: "Pick everything available to you.",
        valid: (data.equipment?.length ?? 0) > 0,
        body: (
          <div className="flex flex-wrap gap-2">
            {equipmentOptions.map((e) => {
              const on = data.equipment?.includes(e);
              return (
                <button
                  key={e}
                  onClick={() => toggleEquip(e)}
                  className={cn(
                    "rounded-full border px-4 py-2.5 text-sm font-medium transition-all",
                    on
                      ? "border-primary bg-primary/15 text-primary shadow-glow"
                      : "border-border bg-surface hover:border-primary/50",
                  )}
                >
                  {on && <Check className="mr-1.5 inline h-3.5 w-3.5" />}
                  {e}
                </button>
              );
            })}
          </div>
        ),
      },
      {
        title: "Diet preference",
        subtitle: "Used for nutrition & meal suggestions.",
        valid: !!data.diet,
        body: <ChipsLarge options={diets} value={data.diet} onSelect={(v) => update("diet", v)} />,
      },
      {
        title: "Tell us about your nutrition needs",
        subtitle:
          "Allergies, dietary restrictions, and bodyweight goal — your AI nutrition coach uses this to plan meals that match your training.",
        valid: !!data.nutrition?.bodyweightGoal,
        body: (
          <NutritionPreferencesForm
            value={data.nutrition ?? DEFAULT_NUTRITION}
            onChange={(v) => setData((d) => ({ ...d, nutrition: v }))}
            weightUnitLabel={weightLabel(units)}
          />
        ),
      },
      {
        title: "Important Legal Agreement & Disclaimer",
        subtitle: "Please read carefully before continuing.",
        valid: !!data.agreedToDisclaimer,
        body: (
          <div className="space-y-4">
            <div className="max-h-72 overflow-y-auto rounded-2xl border border-border bg-surface p-4 text-sm font-semibold leading-relaxed text-white">
              <p className="mb-3">
                Body Forge and its AI coach provide general fitness guidance only.
              </p>
              <p className="mb-3">
                This app is <span className="font-bold text-white">NOT</span> a licensed medical
                professional, doctor, physical therapist, nutritionist, or dietitian.
              </p>
              <p className="mb-3">
                It does <span className="font-bold text-white">NOT</span> provide medical advice,
                diagnose injuries, or guarantee any results.
              </p>
              <p className="mb-3">
                You assume all risk for any injury, illness, or harm that may result from using the
                workouts, programs, or advice provided by the app.
              </p>
              <p>
                By proceeding, you agree that Body Forge, its creators, and its AI coach are not
                liable for any injury, loss, or damage of any kind.
              </p>
            </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border-2 border-border bg-gradient-card p-4 transition-all hover:border-primary/50 has-[:checked]:border-primary has-[:checked]:bg-primary/10 has-[:checked]:shadow-glow">
              <input
                type="checkbox"
                checked={!!data.agreedToDisclaimer}
                onChange={(e) => update("agreedToDisclaimer", e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[oklch(0.78_0.17_165)]"
              />
              <span className="text-sm font-bold text-white">
                I have read, understood, and fully agree to the disclaimer and liability waiver
                above. I release Body Forge from all liability and acknowledge this forms a binding
                agreement.
              </span>
            </label>
          </div>
        ),
      },
    ],
    [data, units],
  );

  const current = steps[step];
  const isLast = step === steps.length - 1;
  const progress = ((step + 1) / steps.length) * 100;

  const finish = async () => {
    if (!user) return;
    setBuilding(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          name: data.name,
          age: data.age ? parseInt(data.age) : null,
          gender: data.gender,
          level: data.level,
          goal: data.goal,
          days_per_week: data.daysPerWeek,
          session_length: data.sessionLength,
          equipment: data.equipment ?? [],
          diet: data.diet,
          injuries: serializeInjuries({
            selected: data.injurySelected ?? [],
            notes: data.injuryNotes ?? "",
          }),
          units,
          weight: toMetricWeight(data.weight ?? "", units),
          height_unit: data.heightUnit ?? "imperial",
          height:
            (data.heightUnit ?? "imperial") === "imperial"
              ? data.heightFeet != null && data.heightInches != null
                ? ftInToCm(data.heightFeet, data.heightInches)
                : null
              : (data.heightCm ?? null),
          agreed_to_disclaimer: true,
          nutrition_preferences: data.nutrition ?? DEFAULT_NUTRITION,
          agreed_to_disclaimer_at: new Date().toISOString(),
          onboarded: true,
        })
        .eq("user_id", user.id);
      if (error) throw error;

      toast.loading("Coach Forge is designing your program…", { id: "gen" });
      const { data: gen, error: genErr } = await supabase.functions.invoke("generate-program");
      toast.dismiss("gen");
      if (genErr) throw genErr;
      if ((gen as any)?.error) throw new Error((gen as any).message ?? (gen as any).error);
      // Auto-calc macro targets so the meal plan generator works instantly
      try {
        await supabase.functions.invoke("nutrition-coach", { body: { action: "calc_macros" } });
      } catch {}
      toast.success("Your program is ready 💪");
      navigate({ to: "/" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBuilding(false);
    }
  };

  const next = () => {
    if (!current.valid) return;
    if (isLast) finish();
    else setStep((s) => s + 1);
  };

  return (
    <div className="dark min-h-dvh bg-gradient-hero text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-10 pb-8">
        <div className="mb-8 flex items-center gap-3">
          <button
            onClick={() => (step > 0 ? setStep((s) => s - 1) : navigate({ to: "/welcome" }))}
            className="grid h-9 w-9 place-items-center rounded-full bg-surface text-white hover:text-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className="h-full bg-gradient-primary transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="text-xs font-bold text-white tabular-nums">
            {step + 1}/{steps.length}
          </span>
        </div>

        <div className="flex-1">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Flame className="h-3.5 w-3.5" /> Step {step + 1}
          </div>
          <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">{current.title}</h1>
          <p className="mb-8 text-base font-semibold text-white">{current.subtitle}</p>
          <div>{current.body}</div>
        </div>

        <Button
          onClick={next}
          disabled={!current.valid || building}
          size="lg"
          className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-extrabold text-primary-foreground shadow-glow disabled:opacity-40"
        >
          {building ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Building your program…
            </>
          ) : isLast ? (
            "Build my program"
          ) : (
            "Continue"
          )}
          {!building && <ArrowRight className="ml-1 h-5 w-5" />}
        </Button>
      </div>
    </div>
  );
}

function Chips({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value?: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          className={cn(
            "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all",
            value === o
              ? "border-primary bg-primary/15 text-primary"
              : "border-border bg-surface text-white hover:border-primary/50",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function ChipsLarge({
  options,
  value,
  onSelect,
}: {
  options: string[];
  value?: string;
  onSelect: (v: string) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {options.map((o) => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          className={cn(
            "rounded-2xl border bg-gradient-card px-4 py-5 text-left text-base font-bold transition-all",
            value === o
              ? "border-primary text-primary shadow-glow"
              : "border-border text-white hover:border-primary/50",
          )}
        >
          {o}
        </button>
      ))}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  suffix: string;
}) {
  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-semibold text-white">{label}</span>
        <span className="text-2xl font-bold text-primary tabular-nums">
          {value}
          <span className="ml-1 text-sm font-semibold text-white">{suffix}</span>
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-surface accent-[oklch(0.78_0.17_165)]"
      />
    </div>
  );
}

function GoalGrid({ value, onSelect }: { value?: string; onSelect: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {GOAL_CARDS.map((g) => {
        const on = value === g.title;
        return (
          <button
            key={g.id}
            type="button"
            onClick={() => onSelect(g.title)}
            className={cn(
              "rounded-2xl border bg-gradient-to-br p-4 text-left transition-all active:scale-[0.98]",
              g.accent,
              on ? "border-primary shadow-glow" : "border-border/60 hover:border-primary/50",
            )}
          >
            <div className="text-3xl">{g.emoji}</div>
            <div className="mt-2 text-sm font-bold leading-tight text-white">{g.title}</div>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-white">{g.blurb}</p>
          </button>
        );
      })}
    </div>
  );
}
