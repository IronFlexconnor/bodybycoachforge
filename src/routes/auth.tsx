import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Sparkles, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordStrengthMeter } from "@/components/PasswordStrengthMeter";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Sign in — Body Forge" }] }),
  validateSearch: (s: Record<string, unknown>) => ({
    next: typeof s.next === "string" && s.next.startsWith("/") ? s.next : undefined,
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const goNext = () => {
    if (next && next.startsWith("/")) window.location.href = next;
    else navigate({ to: "/" });
  };
  const returnUrl = () => (next && next.startsWith("/") ? window.location.origin + next : window.location.origin);

  useEffect(() => {
    if (!loading && session) goNext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, loading]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: returnUrl(), data: { name } },
        });
        if (error) throw error;
        toast.success("Account created — let's build your program.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: returnUrl() });
      if (r.error) throw r.error;
      if (!r.redirected) goNext();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  };

  const isSignup = mode === "signup";
  return (
    <div className="min-h-dvh bg-[oklch(0.18_0.04_245)] text-white">
      {/* Ambient brand glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-24 h-[26rem] w-[26rem] rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute bottom-[-8rem] right-[-6rem] h-[22rem] w-[22rem] rounded-full bg-primary/15 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-14 pb-8">
        <div className="mb-8 inline-flex w-fit items-center gap-2 rounded-full border border-primary/40 bg-primary/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-white shadow-[0_0_24px_-8px_oklch(0.56_0.17_195/0.6)]">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> IronFlex AI Coach
        </div>

        <h1 className="font-display text-[clamp(2.5rem,8vw,3.75rem)] font-black leading-[1.02] tracking-[-0.03em] text-white drop-shadow-[0_2px_20px_rgba(0,0,0,0.35)]">
          {isSignup ? (
            <>Build your <span className="bg-gradient-to-r from-white via-primary to-primary bg-clip-text text-transparent">program</span>.</>
          ) : (
            <>Welcome <span className="bg-gradient-to-r from-white via-primary to-primary bg-clip-text text-transparent">back</span>.</>
          )}
        </h1>
        <p className="mt-4 text-lg font-medium leading-snug text-white/80">
          {isSignup ? "Create an account — your AI coach starts now." : "Pick up right where you left off."}
        </p>

        <form onSubmit={submit} className="mt-9 space-y-4">
          {isSignup && (
            <div className="space-y-1.5">
              <label htmlFor="name" className="block text-xs font-bold uppercase tracking-wider text-white/90">Your name</label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Alex Carter" className="h-13 border-white/15 bg-white/[0.06] text-base font-semibold text-white placeholder:text-white/40 focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          )}
          <div className="space-y-1.5">
            <label htmlFor="email" className="block text-xs font-bold uppercase tracking-wider text-white/90">Email</label>
            <div className="relative">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
              <Input id="email" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required placeholder="you@ironflex.app" className="h-13 border-white/15 bg-white/[0.06] pl-10 text-base font-semibold text-white placeholder:text-white/40 focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="password" className="block text-xs font-bold uppercase tracking-wider text-white/90">Password</label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
              <Input id="password" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required minLength={isSignup ? 8 : 6} placeholder={isSignup ? "At least 8 characters" : "Your password"} className="h-13 border-white/15 bg-white/[0.06] pl-10 text-base font-semibold text-white placeholder:text-white/40 focus-visible:border-primary focus-visible:ring-primary/40" />
            </div>
          </div>
          {isSignup && <PasswordStrengthMeter password={password} />}
          <Button type="submit" disabled={busy} className="h-13 w-full rounded-xl bg-gradient-primary text-base font-bold tracking-wide text-white shadow-[0_10px_30px_-10px_oklch(0.56_0.17_195/0.7)] hover:brightness-110">
            {busy ? "Working…" : isSignup ? "Create account" : "Sign in"}
          </Button>
        </form>

        <div className="my-6 flex items-center gap-3 text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">
          <div className="h-px flex-1 bg-white/15" /> or <div className="h-px flex-1 bg-white/15" />
        </div>

        <Button onClick={google} disabled={busy} variant="outline" className="h-13 w-full rounded-xl border-white/20 bg-white/[0.06] text-base font-bold text-white hover:bg-white/[0.12] hover:text-white">
          <GoogleIcon /> Continue with Google
        </Button>

        <button onClick={() => setMode((m) => (m === "signup" ? "signin" : "signup"))} className="mt-8 text-center text-sm font-medium text-white/70 hover:text-white">
          {isSignup ? "Already have an account? " : "New here? "}
          <span className="font-bold text-primary underline-offset-4 hover:underline">{isSignup ? "Sign in" : "Create account"}</span>
        </button>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}
