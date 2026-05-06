import { createFileRoute, Link } from "@tanstack/react-router";
import { Dumbbell, Sparkles, Video, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Body Forge AI Coach — Your 24/7 Personal Trainer" },
      { name: "description", content: "An elite AI personal trainer in your pocket. Custom programs, real-time form feedback, and unwavering accountability." },
    ],
  }),
  component: Welcome,
});

function Welcome() {
  return (
    <div className="min-h-dvh bg-gradient-hero">
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-16 pb-10">
        <div className="flex flex-1 flex-col">
          <div className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
            <Sparkles className="h-3.5 w-3.5" /> AI-Powered Coaching
          </div>

          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight">
            Your elite <span className="text-gradient-primary">personal trainer</span>, always on.
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Custom programs. Real-time video form feedback. Nutrition guidance. Accountability that never sleeps.
          </p>

          <div className="mt-10 space-y-3">
            <Feature icon={Dumbbell} title="Programs built for you" desc="Adaptive 4–12 week plans for any goal or equipment." />
            <Feature icon={Video} title="Form analysis on demand" desc="Record any lift — get pro cues in seconds." />
            <Feature icon={MessageCircle} title="Coach in your pocket" desc="Ask anything, anytime. We remember everything." />
          </div>
        </div>

        <div className="space-y-3">
          <Button asChild size="lg" className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-glow">
            <Link to="/auth">Get started — 2 minute setup</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 w-full rounded-2xl border-border bg-surface">
            <Link to="/auth">I already have an account</Link>
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            Not medical advice. Always consult your doctor before starting a new program.
          </p>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }: { icon: typeof Dumbbell; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border/60 bg-gradient-card p-4 shadow-card">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="text-sm text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}
