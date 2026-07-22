import { ShieldAlert, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";

export const COMMON_INJURIES = [
  "Lower back pain / disc issues",
  "Knee pain / ACL / meniscus",
  "Shoulder impingement / rotator cuff",
  "Wrist / elbow pain (tennis elbow, golfer's elbow)",
  "Hip / sciatica issues",
  "Ankle / Achilles issues",
  "Neck / upper back tightness",
  "None / No current issues",
] as const;

const NONE = "None / No current issues";

export type InjuryState = { selected: string[]; notes: string };

/** Serialize selections + notes into the single `profiles.injuries` text column. */
export function serializeInjuries(s: InjuryState): string {
  const parts: string[] = [];
  if (s.selected.length) parts.push(s.selected.join("; "));
  if (s.notes.trim()) parts.push(`Notes: ${s.notes.trim()}`);
  return parts.join(" | ");
}

/** Best-effort parse from the stored string for editing later. */
export function parseInjuries(raw: string | null | undefined): InjuryState {
  if (!raw) return { selected: [], notes: "" };
  const [head, ...rest] = raw.split(" | ");
  let notes = "";
  let selected: string[] = [];
  const notesIdx = rest.findIndex((p) => p.startsWith("Notes:"));
  if (head?.startsWith("Notes:")) {
    notes = head.replace(/^Notes:\s*/, "");
  } else if (head) {
    selected = head
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => COMMON_INJURIES.includes(s as any));
  }
  if (notesIdx >= 0) notes = rest[notesIdx].replace(/^Notes:\s*/, "");
  return { selected, notes };
}

export function InjuryAssessment({
  value,
  onChange,
  className,
  compact = false,
}: {
  value: InjuryState;
  onChange: (v: InjuryState) => void;
  className?: string;
  compact?: boolean;
}) {
  const toggle = (item: string) => {
    let selected = value.selected.slice();
    if (item === NONE) {
      selected = selected.includes(NONE) ? [] : [NONE];
    } else {
      selected = selected.filter((s) => s !== NONE);
      selected = selected.includes(item) ? selected.filter((s) => s !== item) : [...selected, item];
    }
    onChange({ ...value, selected });
  };

  return (
    <section className={cn("space-y-4", className)} aria-labelledby="injury-title">
      {!compact && (
        <div className="flex items-start gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
            <ShieldAlert className="h-5 w-5" />
          </div>
          <div>
            <h2 id="injury-title" className="text-lg font-bold tracking-tight text-foreground">
              Any Injuries or Limitations?
            </h2>
            <p className="text-sm text-muted-foreground">
              Do you have any current or past injuries, pain, or limitations the AI coach should
              work around or progress safely?
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        {COMMON_INJURIES.map((item) => {
          const on = value.selected.includes(item);
          return (
            <button
              key={item}
              type="button"
              onClick={() => toggle(item)}
              aria-pressed={on}
              className={cn(
                "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-sm font-semibold transition-all",
                on
                  ? "border-primary bg-primary/10 text-primary shadow-glow"
                  : "border-border bg-gradient-card text-foreground hover:border-primary/50",
              )}
            >
              <span
                className={cn(
                  "grid h-5 w-5 shrink-0 place-items-center rounded-md border-2 transition-all",
                  on
                    ? "border-primary bg-gradient-primary text-primary-foreground"
                    : "border-border bg-background",
                )}
              >
                {on && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              {item}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Other notes (optional)
        </label>
        <Textarea
          value={value.notes}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          placeholder="Describe any other injuries, surgeries, or limitations (e.g. progressing shoulder injury, recovering knee, etc.)"
          rows={4}
          className="text-base font-semibold text-foreground placeholder:text-muted-foreground"
        />
      </div>
    </section>
  );
}
