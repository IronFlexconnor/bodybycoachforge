import { cn } from "@/lib/utils";
import type { Units } from "@/lib/units";

export function UnitToggle({ value, onChange, className }: { value: Units; onChange: (u: Units) => void; className?: string }) {
  return (
    <div className={cn("grid grid-cols-2 gap-2 rounded-2xl border border-border bg-surface/60 p-1", className)}>
      <button
        type="button"
        onClick={() => onChange("imperial")}
        className={cn(
          "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
          value === "imperial"
            ? "bg-gradient-primary text-primary-foreground shadow-glow"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Imperial · lb / in
      </button>
      <button
        type="button"
        onClick={() => onChange("metric")}
        className={cn(
          "rounded-xl px-3 py-2.5 text-sm font-semibold transition-all",
          value === "metric"
            ? "bg-gradient-primary text-primary-foreground shadow-glow"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        Metric · kg / cm
      </button>
    </div>
  );
}
