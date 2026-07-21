import { Ruler, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type HeightUnit = "imperial" | "metric";

/**
 * Height picker with format toggle (Feet & Inches OR Centimeters).
 * Imperial: Feet (4–7) + Inches (0–11), both required.
 * Metric: single cm input (100–250).
 */
export function HeightPicker({
  unit,
  onUnitChange,
  feet,
  inches,
  cm,
  onChange,
  className,
  compact = false,
}: {
  unit: HeightUnit;
  onUnitChange: (u: HeightUnit) => void;
  feet: number | null;
  inches: number | null;
  cm: number | null;
  onChange: (v: { feet: number | null; inches: number | null; cm: number | null }) => void;
  className?: string;
  compact?: boolean;
}) {
  return (
    <section className={cn("space-y-4", className)} aria-labelledby="height-title">
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <Ruler className="h-5 w-5" />
          </div>
          <div>
            <h2 id="height-title" className="text-lg font-bold tracking-tight text-white">
              What is your height?
            </h2>
            <p className="text-sm font-semibold text-white">
              Pick your preferred format and enter your height.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <UnitButton
          selected={unit === "imperial"}
          onClick={() => onUnitChange("imperial")}
          label="Feet & Inches"
          sub="ft / in"
        />
        <UnitButton
          selected={unit === "metric"}
          onClick={() => onUnitChange("metric")}
          label="Centimeters"
          sub="cm"
        />
      </div>

      {unit === "imperial" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Feet">
            <Select
              value={feet != null ? String(feet) : undefined}
              onValueChange={(v) => onChange({ feet: parseInt(v, 10), inches, cm })}
            >
              <SelectTrigger className="h-14 rounded-2xl border-2 bg-gradient-card text-lg font-bold text-white placeholder:text-white/80">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {[4, 5, 6, 7].map((f) => (
                  <SelectItem key={f} value={String(f)}>{f} ft</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Inches">
            <Select
              value={inches != null ? String(inches) : undefined}
              onValueChange={(v) => onChange({ feet, inches: parseInt(v, 10), cm })}
            >
              <SelectTrigger className="h-14 rounded-2xl border-2 bg-gradient-card text-lg font-bold text-white placeholder:text-white/80">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => i).map((i) => (
                  <SelectItem key={i} value={String(i)}>{i} in</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      ) : (
        <Field label="Centimeters">
          <Input
            type="number"
            inputMode="numeric"
            min={100}
            max={250}
            placeholder="e.g. 178"
            value={cm ?? ""}
            onChange={(e) => {
              const n = e.target.value === "" ? null : parseInt(e.target.value, 10);
              onChange({ feet, inches, cm: Number.isFinite(n as number) ? (n as number) : null });
            }}
            className="h-14 rounded-2xl border-2 text-lg font-bold text-white placeholder:text-white/80"
          />
        </Field>
      )}

      {!compact && (
        <p className="text-xs font-semibold text-white">
          You can change this anytime in Settings.
        </p>
      )}
    </section>
  );
}

function UnitButton({ selected, onClick, label, sub }: { selected: boolean; onClick: () => void; label: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "relative flex flex-col items-center justify-center gap-1 rounded-2xl border-2 px-4 py-5 text-center transition-all",
        selected ? "border-primary bg-primary/10 shadow-glow" : "border-border bg-gradient-card hover:border-primary/50",
      )}
    >
      {selected && (
        <span className="absolute left-3 top-3 grid h-5 w-5 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
          <Check className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <div className={cn("text-base font-bold", selected ? "text-primary" : "text-white")}>{label}</div>
      <div className="text-xs font-semibold text-white">{sub}</div>
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-xs font-bold uppercase tracking-wider text-white">{label}</div>
      {children}
    </div>
  );
}

export const ftInToCm = (ft: number, inches: number) => (ft * 12 + inches) * 2.54;
export const cmToFtIn = (cm: number | null | undefined): { feet: number | null; inches: number | null } => {
  if (cm == null || isNaN(Number(cm))) return { feet: null, inches: null };
  const totalIn = Math.round(Number(cm) / 2.54);
  return { feet: Math.floor(totalIn / 12), inches: totalIn % 12 };
};
export const formatHeight = (cm: number | null | undefined, unit: HeightUnit): string => {
  if (cm == null) return "—";
  if (unit === "metric") return `${Math.round(Number(cm))} cm`;
  const { feet, inches } = cmToFtIn(cm);
  if (feet == null || inches == null) return "—";
  return `${feet}′ ${inches}″`;
};
