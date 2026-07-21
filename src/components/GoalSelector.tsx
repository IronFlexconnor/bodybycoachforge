import { useState } from "react";
import { Sparkles, Loader2, Check, ArrowRight, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { celebrate } from "@/lib/celebrate";

export type GoalCard = {
  id: string;
  title: string;
  emoji: string;
  blurb: string;
  prompt: string; // sent to AI as the user's goal
  accent: string; // tailwind gradient classes
};

export const GOAL_CARDS: GoalCard[] = [
  { id: "geriatric-strength", title: "Geriatric Strength & Mobility", emoji: "🌿", blurb: "Safe seated + standing strength for 60+.", prompt: "Geriatric strength & mobility — chair-supported squats, seated rows, wall push-ups, gentle mobility for adults 60+.", accent: "from-teal-500/30 to-emerald-500/10" },
  { id: "fall-prevention", title: "Fall Prevention & Balance", emoji: "🦶", blurb: "Stay steady. Build balance + reactive strength.", prompt: "Fall prevention & balance — single-leg stands with support, heel-to-toe walks, tandem stance, ankle/hip strategy drills for seniors.", accent: "from-cyan-500/30 to-sky-500/10" },
  { id: "senior-muscle", title: "Senior Muscle Maintenance", emoji: "🛡️", blurb: "Preserve lean muscle past 60.", prompt: "Senior muscle maintenance — light-resistance full-body 2–3x/week with bands, dumbbells, sit-to-stands, wall push-ups, protein-paced progression.", accent: "from-amber-500/30 to-yellow-500/10" },
  { id: "bone-health", title: "Post-60 Bone Health & Joint Care", emoji: "🦴", blurb: "Bone density + joint care.", prompt: "Post-60 bone health & joint care — weight-bearing step-ups with support, standing marches, light loaded carries, joint-friendly mobility.", accent: "from-stone-500/30 to-orange-500/10" },
  { id: "post-rehab", title: "Gentle Post-Rehab Recovery", emoji: "🩹", blurb: "Easing back after injury or surgery.", prompt: "Gentle post-rehab recovery — pain-free range, isometric holds, banded mobility, light progressive loading, careful weekly progression.", accent: "from-rose-500/30 to-pink-500/10" },
  { id: "active-aging", title: "Active Aging for 65+", emoji: "🌅", blurb: "Energy, independence, vitality.", prompt: "Active aging for 65+ — chair-based warm-ups, gentle bodyweight strength, balance circuits, low-impact cardio walks, daily mobility.", accent: "from-indigo-500/30 to-violet-500/10" },
  { id: "glute-growth", title: "Glute Growth", emoji: "🍑", blurb: "Sculpt round, strong glutes — activation + hypertrophy.", prompt: "Glute growth program for women — dedicated Glute Day with activation, heavy hip thrusts, abduction & shape work, plus glute-focused leg day.", accent: "from-pink-500/30 to-rose-500/10" },
  { id: "muscle-fat", title: "Build Muscle & Lose Fat", emoji: "🔥", blurb: "Recomp — gain muscle, drop body fat at the same time.", prompt: "Body recomposition — build lean muscle while losing fat with hypertrophy + metabolic finishers.", accent: "from-emerald-500/30 to-teal-500/10" },
  { id: "strength", title: "Strength & Power", emoji: "💪", blurb: "Squat, bench, deadlift PRs — pure force.", prompt: "Strength & power — heavy compound lifts (squat/bench/deadlift), low reps, progressive overload, conjugate accessories.", accent: "from-amber-500/30 to-orange-500/10" },
  { id: "sport", title: "Sport Performance", emoji: "⚡", blurb: "Speed, explosiveness, agility, conditioning.", prompt: "Sport performance — speed, plyometrics, rotational power, repeat-sprint conditioning.", accent: "from-blue-500/30 to-cyan-500/10" },
  { id: "postpartum", title: "Postpartum Rebuild", emoji: "🌸", blurb: "Core re-connection, pelvic floor, gradual rebuild.", prompt: "Postpartum rebuild — diastasis-safe core, pelvic floor, gradual full-body strength progression.", accent: "from-fuchsia-500/30 to-pink-500/10" },
  { id: "arms", title: "Arm Definition", emoji: "💥", blurb: "Sleeve-busting biceps, triceps, shoulders.", prompt: "Arm definition — biceps, triceps, shoulders hypertrophy with high-frequency arm specialization.", accent: "from-violet-500/30 to-purple-500/10" },
  { id: "posture", title: "Posture Correction", emoji: "🧍", blurb: "Fix rounded shoulders & forward head.", prompt: "Posture correction — upper back, scap, deep core, T-spine mobility, anti-extension work.", accent: "from-sky-500/30 to-indigo-500/10" },
  { id: "fat-loss", title: "Fat Loss Circuits", emoji: "🏃", blurb: "High-intensity circuits, big calorie burn.", prompt: "Fat loss circuits — full-body strength supersets + metabolic conditioning, 4–5 days/week.", accent: "from-red-500/30 to-orange-500/10" },
  { id: "mobility", title: "Mobility & Longevity", emoji: "🧘", blurb: "Move better, feel younger, train pain-free.", prompt: "Mobility & longevity — joint CARs, tissue prep, low-load strength, balance, anti-aging conditioning.", accent: "from-lime-500/30 to-emerald-500/10" },
];

type Props = {
  onBuilt?: () => void;
  compact?: boolean;
};

export function GoalSelector({ onBuilt, compact }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [building, setBuilding] = useState(false);

  const build = async (goalPrompt: string, label: string) => {
    setBuilding(true);
    try {
      // Persist the goal label on the profile so the rest of the app sees the change
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from("profiles").update({ goal: label }).eq("user_id", user.id);
      }
      toast.loading("Coach Forge is designing your program…", { id: "build-goal" });
      const { data, error } = await supabase.functions.invoke("generate-program", {
        body: { goal_override: goalPrompt, goal_label: label },
      });
      toast.dismiss("build-goal");
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      celebrate();
      const summary = (data as any)?.summary as string | undefined;
      toast.success(`Your ${label} program is ready 💪`, {
        description: summary ? `Here's what changed: ${summary}` : undefined,
        duration: 8000,
      });
      onBuilt?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the program");
    } finally {
      setBuilding(false);
    }
  };

  return (
    <div>
      <div className={cn("grid gap-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>
        {GOAL_CARDS.map((g) => {
          const on = selected === g.id;
          return (
            <button
              key={g.id}
              disabled={building}
              onClick={() => { setSelected(g.id); build(g.prompt, g.title); }}
            className={cn(
                "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all active:scale-[0.98]",
                "bg-gradient-to-br", g.accent,
                g.id.includes("geriatric") || g.id.includes("fall") || g.id.includes("senior") || g.id.includes("bone") || g.id.includes("rehab") || g.id.includes("aging") ? "min-h-[150px] border-primary/30" : "",
              on ? "border-primary shadow-glow" : "border-border/60 hover:border-primary/50",
            )}
          >
            <div className="text-3xl">{g.emoji}</div>
            <div className="mt-2 font-bold leading-tight text-white">{g.title}</div>
            <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-white">{g.blurb}</p>
            {on && building && (
              <div className="absolute inset-0 grid place-items-center bg-background/70 backdrop-blur-sm">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              </div>
            )}
          </button>
        );
      })}

      <button
        disabled={building}
        onClick={() => setShowCustom((s) => !s)}
        className={cn(
          "rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 text-left transition-all hover:border-primary",
          showCustom && "border-primary bg-primary/10",
        )}
      >
        <div className="text-3xl">🎯</div>
        <div className="mt-2 font-bold leading-tight text-white">Custom Goal</div>
        <p className="mt-1 text-[11px] font-semibold text-white">Type anything — Coach builds it.</p>
      </button>
      </div>

      {showCustom && (
        <div className="mt-4 rounded-2xl border border-primary/30 bg-gradient-card p-4">
          <div className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <Target className="h-3.5 w-3.5" /> Tell Coach exactly what you want
          </div>
          <Textarea
            placeholder="e.g. Bigger glutes + smaller waist, sport-specific for soccer, postpartum rebuild after C-section…"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="min-h-[90px] text-sm"
          />
          <Button
            disabled={!custom.trim() || building}
            onClick={() => build(custom.trim(), "Custom Goal")}
            className="mt-3 h-11 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow"
          >
            {building ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Build my custom program
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
