import { cn } from "@/lib/utils";
import { Check, Scale } from "lucide-react";

export type WeightUnit = "lbs" | "kg";

/**
 * Dedicated "Measurement System" section.
 * Title, question, and option labels match product spec exactly.
 * Pounds (lbs) is the default / primary recommended choice.
 */
export function MeasurementSystemPicker({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: WeightUnit;
  onChange: (u: WeightUnit) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cn("space-y-4", className)} aria-labelledby="measurement-system-title">
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Scale className="h-5 w-5" />
          </div>
          <div>
            <h2 id="measurement-system-title" className="text-lg font-bold tracking-tight text-white">
              Measurement System
            </h2>
            <p className="text-sm font-semibold text-white">
              Preferred Measurement System for Tracking Exercises
            </p>
          </div>
        </div>
      )}

      <p className={cn("text-sm font-semibold", compact ? "text-white" : "text-white")}>
        What measurement system do you prefer for tracking your exercises?
      </p>

      <div className="grid grid-cols-2 gap-3">
        <UnitButton
          selected={value === "lbs"}
          onClick={() => onChange("lbs")}
          label="Pounds"
          unit="lbs"
          recommended
        />
        <UnitButton
          selected={value === "kg"}
          onClick={() => onChange("kg")}
          label="Kilograms"
          unit="kg"
        />
      </div>

      {!compact && (
        <p className="text-xs font-semibold text-white">
          You can change this anytime in Settings. Past logged workouts keep the unit they were recorded in.
        </p>
      )}
    </section>
  );
}

function UnitButton({
  selected,
  onClick,
  label,
  unit,
  recommended,
}: {
  selected: boolean;
  onClick: () => void;
  label: string;
  unit: string;
  recommended?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-6 text-center transition-all",
        selected
          ? "border-primary bg-primary/10 shadow-glow"
          : "border-border bg-gradient-card hover:border-primary/50",
      )}
    >
      {recommended && (
        <span className="absolute -top-2 right-3 rounded-full bg-gradient-primary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-foreground shadow-glow">
          Default
        </span>
      )}
      {selected && (
        <span className="absolute left-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <div className={cn("text-xl font-bold", selected ? "text-primary" : "text-white")}>
        {label}
      </div>
      <div className="text-sm font-semibold text-white">({unit})</div>
    </button>
  );
}
