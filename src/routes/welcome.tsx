import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Video, MessageCircle, ChefHat, ChevronRight, Check, Zap, Heart, Play, Flame, TrendingUp, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";

function useHeroParallax() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const el = ref.current;
        if (!el) return;
        const y = Math.min(window.scrollY, 600);
        el.style.setProperty("--pFar", `${y * 0.08}px`);
        el.style.setProperty("--pMid", `${y * 0.16}px`);
        el.style.setProperty("--pNear", `${y * 0.26}px`);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return ref;
}

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "Body Forge AI Coach — Your 24/7 Personal Trainer" },
      { name: "description", content: "Custom plans. Real-time form feedback. Nutrition that actually tastes good. Start your free 7-day trial." },
      { property: "og:title", content: "Body Forge AI Coach — Your 24/7 Personal Trainer" },
      { property: "og:description", content: "Custom plans. Real-time form feedback. Nutrition that actually tastes good." },
    ],
  }),
  component: Welcome,
});

const SLIDES = [
  {
    icon: Zap,
    badge: "Day 1",
    title: "Tell us your goal",
    desc: "Lose fat, gain muscle, train for a sport — Coach builds your plan in 30 seconds.",
    bullets: ["Picks 4–6 best exercises today", "Macros tuned to your body", "Adapts every single day"],
  },
  {
    icon: Video,
    badge: "Anytime",
    title: "Record. Get pro feedback.",
    desc: "Hit a set, film it, get NSCA-grade form cues in seconds — like having a coach beside you.",
    bullets: ["Frame-by-frame breakdown", "Spot weak links instantly", "Fix it next set"],
  },
  {
    icon: ChefHat,
    badge: "Every day",
    title: "Meals you'll actually crave",
    desc: "2,000+ recipes with prep videos. One tap to swap. Always hits your macros.",
    bullets: ["Surprise Me — fresh picks daily", "Prep videos under 60s", "Diet & allergens respected"],
  },
];

function Welcome() {
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const parallaxRef = useHeroParallax();

  if (showOnboarding) {
    const slide = SLIDES[step];
    const Icon = slide.icon;
    const isLast = step === SLIDES.length - 1;
    return (
      <div className="min-h-dvh bg-gradient-hero">
        <div className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 pt-14 pb-8">
          <div className="mb-6 flex items-center justify-between">
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 rounded-full transition-all ${i === step ? "w-8 bg-primary" : i < step ? "w-4 bg-primary/60" : "w-4 bg-border"}`}
                />
              ))}
            </div>
            <button onClick={() => navigate({ to: "/auth" })} className="text-xs font-bold text-white hover:text-white">
              Skip
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center animate-fade-in" key={step}>
            <div className="mx-auto mb-8 grid h-28 w-28 place-items-center rounded-3xl bg-gradient-primary text-primary-foreground shadow-glow animate-scale-in">
              <Icon className="h-14 w-14" strokeWidth={1.8} />
            </div>
            <div className="mb-3 inline-flex w-fit mx-auto items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="h-3 w-3" /> {slide.badge}
            </div>
            <h2 className="text-center text-3xl font-bold leading-tight tracking-tight text-white">{slide.title}</h2>
            <p className="mx-auto mt-3 max-w-sm text-center text-base font-semibold leading-relaxed text-white">
              {slide.desc}
            </p>

            <ul className="mx-auto mt-7 w-full max-w-sm space-y-2.5">
              {slide.bullets.map((b) => (
                <li key={b} className="flex items-center gap-3 rounded-2xl border border-border/60 bg-gradient-card px-4 py-3 text-sm font-semibold text-white shadow-card">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          <Button
            onClick={() => (isLast ? navigate({ to: "/auth" }) : setStep(step + 1))}
            size="lg"
            className="h-14 w-full rounded-2xl bg-gradient-primary text-base font-semibold text-primary-foreground shadow-glow"
          >
            {isLast ? "Start my free 7-day trial" : "Try it now"}
            <ChevronRight className="ml-1 h-5 w-5" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden bg-gradient-hero">
      {/* Ambient depth — layered teal glows with a navy vignette that protects headline contrast */}
      <div
        ref={parallaxRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 [--pFar:0px] [--pMid:0px] [--pNear:0px]"
      >
        {/* Top-right teal aurora — near layer, moves most */}
        <div
          className="absolute -top-40 -right-28 h-[22rem] w-[22rem] rounded-full bg-[oklch(0.72_0.15_190/0.28)] blur-[110px] motion-safe:animate-pulse [animation-duration:9s] will-change-transform"
          style={{ transform: "translate3d(0, calc(var(--pNear) * -1), 0)" }}
        />
        {/* Bottom-left cyan wash — mid layer */}
        <div
          className="absolute -bottom-40 -left-28 h-[26rem] w-[26rem] rounded-full bg-[oklch(0.62_0.13_205/0.22)] blur-[120px] will-change-transform"
          style={{ transform: "translate3d(0, var(--pMid), 0)" }}
        />
        {/* Mid accent spark — far layer, drifts slowly */}
        <div
          className="absolute top-1/3 left-1/2 h-64 w-64 rounded-full bg-[oklch(0.82_0.16_190/0.10)] blur-[90px] will-change-transform"
          style={{ transform: "translate3d(-50%, calc(var(--pFar) * -1), 0)" }}
        />
        {/* Readability vignette — stays anchored so headline contrast never drops */}
        <div className="absolute inset-x-0 top-0 h-[62%] bg-[radial-gradient(120%_70%_at_50%_0%,oklch(0.14_0.05_250/0.55)_0%,oklch(0.14_0.05_250/0.25)_45%,transparent_75%)]" />
        {/* Fine grain / edge fade for premium finish */}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent_0%,transparent_55%,oklch(0.12_0.045_250/0.35)_100%)]" />
      </div>


      <div className="relative mx-auto flex min-h-dvh max-w-lg flex-col px-5 pt-10 pb-6 sm:px-6 sm:pt-14 sm:pb-8">
        <div className="flex flex-1 flex-col">
          <div className="mb-4 inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary animate-fade-in sm:mb-5 sm:text-xs">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
            </span>
            Trusted by 50,000+ athletes
          </div>

          <h1
            className="text-display text-[2.75rem] leading-[0.92] tracking-tightest text-white animate-fade-in [text-wrap:balance] sm:text-[4.5rem] md:text-[5.25rem]"
            style={{ textShadow: "0 2px 28px oklch(0.14 0.05 250 / 55%)" }}
          >
            <span className="block">Body Forge</span>
            <span className="block text-white/85">AI Coach</span>
            <span className="mt-1.5 block bg-gradient-to-r from-white via-[oklch(0.94_0.1_195)] to-[oklch(0.78_0.17_190)] bg-clip-text text-transparent sm:mt-2">
              Your 24/7 Trainer
            </span>
          </h1>
          <p className="mt-5 max-w-md text-[16px] font-semibold leading-[1.5] text-white animate-fade-in [text-wrap:pretty] sm:mt-6 sm:text-[1.35rem] sm:leading-[1.5]">
            Custom plans. Real-time form feedback. Nutrition that actually tastes good.
          </p>

          {/* Quick value props */}
          <div className="mt-6 grid grid-cols-3 gap-2 sm:mt-8 sm:gap-3">
            <ValueChip icon={Zap} label="Plans in 30s" />
            <ValueChip icon={Video} label="Form analysis" />
            <ValueChip icon={ChefHat} label="2,000+ meals" />
          </div>


          {/* Hero feature card */}
          <div className="relative mt-7 overflow-hidden rounded-3xl border border-primary/30 bg-gradient-card p-5 shadow-card animate-fade-in">
            <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/25 blur-3xl" />
            <div className="relative flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
                <MessageCircle className="h-6 w-6" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-white">Coach Forge</span>
                  <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white">Online</span>
                </div>
                <p className="mt-1.5 text-sm font-semibold leading-relaxed text-white">
                  "Hey! I just built tomorrow's session for you — 4 lifts, 38 minutes, and I swapped in higher-protein dinners. Tap below to get started 💪"
                </p>
              </div>
            </div>
          </div>
          {/* Live app preview — interactive cards mirroring the dashboard */}
          <div className="mt-6 space-y-3 animate-fade-in">
            <div className="flex items-center justify-between px-1">
              <div className="text-[11px] font-bold uppercase tracking-wider text-white">A peek inside</div>
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-primary">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" /> Live
              </div>
            </div>

            {/* Today's session preview */}
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="group w-full overflow-hidden rounded-2xl border border-primary/30 bg-gradient-card p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <Dumbbell className="h-3 w-3" /> Today · Push
                </span>
                <span className="text-[10px] font-semibold text-white">38 min</span>
              </div>
              <div className="mt-2 font-bold leading-tight text-white">Bench · OHP · Incline DB · Triceps</div>
              <div className="mt-2 flex items-center gap-2 text-[11px] font-semibold text-white">
                <Flame className="h-3.5 w-3.5 text-primary" /> Auto-tuned to RPE 7 · 4 lifts
                <span className="ml-auto inline-flex items-center gap-0.5 font-bold text-primary">
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </button>

            {/* Fresh meal preview */}
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="group w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-card p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl">🍳</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                      <Play className="h-2.5 w-2.5 fill-current" /> Prep video
                    </span>
                    <span className="text-[10px] font-semibold text-white">42g protein</span>
                  </div>
                  <div className="mt-1 truncate font-bold text-white">Honey-Garlic Salmon Bowl</div>
                  <div className="text-[11px] font-semibold text-white">Fresh today · 18 min</div>
                </div>
                <ChevronRight className="h-4 w-4 text-white" />
              </div>
            </button>

            {/* Insight preview */}
            <button
              onClick={() => navigate({ to: "/auth" })}
              className="group w-full overflow-hidden rounded-2xl border border-border/60 bg-gradient-card p-4 text-left shadow-card transition active:scale-[0.99]"
            >
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                  <TrendingUp className="h-3 w-3" /> Latest insight
                </span>
                <span className="text-[10px] font-semibold text-white">2 min read</span>
              </div>
              <div className="mt-2 font-bold leading-snug text-white">Lengthened-bias work grows muscle ~12% faster</div>
              <p className="mt-1 line-clamp-2 text-[11px] font-semibold text-white">New 2026 meta finds stretch-position reps drive more hypertrophy at matched effort.</p>
            </button>
          </div>

          {/* Testimonials */}
          <div className="mt-5 grid grid-cols-1 gap-2.5 animate-fade-in">
            {[
              { name: "Sarah K.", role: "Lost 18 lbs in 12 weeks", quote: "Feels like having a coach in my pocket. The form feedback is unreal." },
              { name: "Marcus T.", role: "Added 40 lbs to squat", quote: "Plans adapt to me. I've never been this consistent." },
            ].map((t) => (
              <div key={t.name} className="flex items-start gap-3 rounded-2xl border border-border/60 bg-gradient-card p-3.5 shadow-card">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-primary text-xs font-bold text-primary-foreground shadow-glow">
                  {t.name.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[11px] text-amber-400">{"★★★★★"}</div>
                  <p className="mt-0.5 text-[13px] font-semibold leading-snug text-white">"{t.quote}"</p>
                  <div className="mt-1 text-[11px] font-semibold text-white">{t.name} · {t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 space-y-3 sm:mt-8">
          <Button
            onClick={() => navigate({ to: "/auth" })}
            size="lg"
            className="h-16 w-full rounded-2xl bg-gradient-primary text-base font-extrabold tracking-tight text-primary-foreground shadow-glow transition-transform hover:scale-[1.01] sm:h-[68px] sm:text-lg"
          >
            <Sparkles className="mr-2 h-5 w-5" />
            Start My Free 7-Day Trial
          </Button>
          <p className="text-center text-[12px] font-bold text-white">
            Then $14.99/mo · cancel anytime
          </p>
          <button
            onClick={() => setShowOnboarding(true)}
            className="flex w-full items-center justify-center gap-1.5 py-1 text-sm font-bold text-white transition-colors hover:text-white"
          >
            See how it works <ChevronRight className="h-4 w-4" />
          </button>
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 pt-0.5 text-[11px] font-semibold text-white">
            <span className="inline-flex items-center gap-1"><Heart className="h-3 w-3 text-primary" /> No credit card</span>
            <span aria-hidden>·</span>
            <span>Cancel anytime</span>
            <span aria-hidden>·</span>
            <Link to="/auth" className="font-bold text-primary hover:underline">Sign in</Link>
          </div>
        </div>

      </div>
    </div>
  );
}

function ValueChip({ icon: Icon, label }: { icon: typeof Zap; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-2 py-3.5 text-center backdrop-blur-md shadow-card">
      <Icon className="h-5 w-5 text-[oklch(0.84_0.18_188)]" strokeWidth={2.4} />
      <span className="text-[12px] font-bold leading-tight tracking-tight text-white">{label}</span>
    </div>
  );
}
