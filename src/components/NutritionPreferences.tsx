import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export type BodyweightGoal = "lose_fat" | "build_muscle" | "maintain" | "recomp";

export type NutritionPrefs = {
  diets: string[];
  allergies: string[];
  allergiesNotes: string;
  calorieMode: "auto" | "custom";
  calorieGoal?: number | null;
  mealsPerDay: number;
  mealTiming?: string;
  bodyweightGoal?: BodyweightGoal | null;
  targetWeight?: number | null;
};

export const BODYWEIGHT_GOALS: { id: BodyweightGoal; label: string; sub: string }[] = [
  { id: "lose_fat", label: "Lose fat / cut", sub: "Calorie deficit, preserve muscle" },
  { id: "build_muscle", label: "Build muscle / bulk", sub: "Lean surplus, hit protein every meal" },
  { id: "maintain", label: "Maintain", sub: "Hold current weight & performance" },
  { id: "recomp", label: "Recomp", sub: "Lose fat & gain muscle simultaneously" },
];

export const DIET_OPTIONS = [
  "No Preference",
  "Vegetarian",
  "Vegan",
  "Keto",
  "Low-Carb",
  "High-Protein",
  "Gluten-Free",
  "Dairy-Free",
  "Mediterranean",
  "Paleo",
];

export const ALLERGY_OPTIONS = [
  "Peanuts",
  "Tree Nuts",
  "Shellfish",
  "Fish",
  "Eggs",
  "Dairy/Lactose",
  "Gluten",
  "Soy",
  "Sesame",
];

export const DEFAULT_NUTRITION: NutritionPrefs = {
  diets: [],
  allergies: [],
  allergiesNotes: "",
  calorieMode: "auto",
  calorieGoal: null,
  mealsPerDay: 3,
  mealTiming: "",
  bodyweightGoal: null,
  targetWeight: null,
};

export function NutritionPreferencesForm({
  value,
  onChange,
  weightUnitLabel = "lbs",
}: {
  value: NutritionPrefs;
  onChange: (v: NutritionPrefs) => void;
  weightUnitLabel?: string;
}) {
  const toggle = (key: "diets" | "allergies", item: string) => {
    const set = new Set(value[key]);
    set.has(item) ? set.delete(item) : set.add(item);
    onChange({ ...value, [key]: Array.from(set) });
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-3 text-sm font-bold text-foreground">
          What is your main bodyweight goal?
        </h3>
        <div className="grid grid-cols-2 gap-3">
          {BODYWEIGHT_GOALS.map((g) => {
            const on = value.bodyweightGoal === g.id;
            return (
              <button
                key={g.id}
                type="button"
                onClick={() => onChange({ ...value, bodyweightGoal: g.id })}
                className={cn(
                  "rounded-2xl border bg-gradient-card px-4 py-4 text-left transition-all",
                  on
                    ? "border-primary text-primary shadow-glow"
                    : "border-border text-foreground hover:border-primary/50",
                )}
              >
                <div className="text-sm font-bold">{g.label}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{g.sub}</div>
              </button>
            );
          })}
        </div>
        <Input
          type="number"
          inputMode="decimal"
          placeholder={`Target weight (${weightUnitLabel}) — optional`}
          value={value.targetWeight ?? ""}
          onChange={(e) =>
            onChange({ ...value, targetWeight: e.target.value ? Number(e.target.value) : null })
          }
          className="mt-3 h-12 font-semibold text-foreground placeholder:text-muted-foreground"
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-foreground">Dietary preferences</h3>
        <div className="flex flex-wrap gap-2">
          {DIET_OPTIONS.map((d) => {
            const on = value.diets.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggle("diets", d)}
                className={cn(
                  "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all",
                  on
                    ? "border-primary bg-primary/15 text-primary shadow-glow"
                    : "border-border bg-surface text-foreground hover:border-primary/50",
                )}
              >
                {on && <Check className="mr-1.5 inline h-3.5 w-3.5" />}
                {d}
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-foreground">Allergies & intolerances</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          {ALLERGY_OPTIONS.map((a) => {
            const on = value.allergies.includes(a);
            return (
              <button
                key={a}
                type="button"
                onClick={() => toggle("allergies", a)}
                className={cn(
                  "rounded-full border px-4 py-2.5 text-sm font-semibold transition-all",
                  on
                    ? "border-destructive/70 bg-destructive/15 text-destructive"
                    : "border-border bg-surface text-foreground hover:border-destructive/50",
                )}
              >
                {on && <Check className="mr-1.5 inline h-3.5 w-3.5" />}
                {a}
              </button>
            );
          })}
        </div>
        <Textarea
          placeholder="Other allergies or foods to avoid (optional)"
          value={value.allergiesNotes}
          onChange={(e) => onChange({ ...value, allergiesNotes: e.target.value })}
          className="min-h-20 font-semibold text-foreground placeholder:text-muted-foreground"
        />
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-foreground">Daily calorie goal</h3>
        <div className="mb-3 grid grid-cols-2 gap-3">
          {(["auto", "custom"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onChange({ ...value, calorieMode: m })}
              className={cn(
                "rounded-2xl border bg-gradient-card px-4 py-4 text-left text-sm font-bold transition-all",
                value.calorieMode === m
                  ? "border-primary text-primary shadow-glow"
                  : "border-border text-foreground hover:border-primary/50",
              )}
            >
              {m === "auto" ? "Auto-calculate from my plan" : "Set my own"}
            </button>
          ))}
        </div>
        {value.calorieMode === "custom" && (
          <Input
            type="number"
            inputMode="numeric"
            placeholder="e.g. 2400"
            value={value.calorieGoal ?? ""}
            onChange={(e) =>
              onChange({ ...value, calorieGoal: e.target.value ? Number(e.target.value) : null })
            }
            className="h-12 font-semibold text-foreground placeholder:text-muted-foreground"
          />
        )}
      </section>

      <section>
        <h3 className="mb-3 text-sm font-bold text-foreground">Meals per day</h3>
        <div className="flex flex-wrap gap-2">
          {[2, 3, 4, 5, 6].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange({ ...value, mealsPerDay: n })}
              className={cn(
                "h-12 w-12 rounded-full border text-base font-bold transition-all",
                value.mealsPerDay === n
                  ? "border-primary bg-primary/15 text-primary shadow-glow"
                  : "border-border bg-surface text-foreground hover:border-primary/50",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <Input
          placeholder="Meal timing notes (e.g. intermittent fasting 12–8pm)"
          value={value.mealTiming ?? ""}
          onChange={(e) => onChange({ ...value, mealTiming: e.target.value })}
          className="mt-3 h-12 font-semibold text-foreground placeholder:text-muted-foreground"
        />
      </section>
    </div>
  );
}
