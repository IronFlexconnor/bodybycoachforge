import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSubscription } from "@/hooks/useSubscription";
import { celebrate } from "@/lib/celebrate";

export const Route = createFileRoute("/checkout/return")({
  head: () => ({ meta: [{ title: "Welcome to Body Forge Coach" }] }),
  validateSearch: (search: Record<string, unknown>): { session_id?: string } => ({
    session_id: typeof search.session_id === "string" ? search.session_id : undefined,
  }),
  component: CheckoutReturn,
});

function CheckoutReturn() {
  const navigate = useNavigate();
  const { session_id } = Route.useSearch();
  const { isActive, refetch, loading } = useSubscription();

  useEffect(() => {
    if (isActive) celebrate();
  }, [isActive]);

  useEffect(() => {
    // Poll a few times — webhook may take a couple seconds to land.
    let n = 0;
    const t = setInterval(() => {
      refetch();
      n += 1;
      if (n > 8 || isActive) clearInterval(t);
    }, 1500);
    return () => clearInterval(t);
  }, [refetch, isActive]);

  return (
    <div className="min-h-dvh bg-gradient-hero px-6 py-16">
      <div className="mx-auto max-w-md text-center">
        <div className="mx-auto mb-6 grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-primary-foreground shadow-glow">
          {isActive ? (
            <CheckCircle2 className="h-10 w-10" />
          ) : (
            <Loader2 className="h-10 w-10 animate-spin" />
          )}
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {isActive ? (
            <>
              You're <span className="text-gradient-primary">in</span>.
            </>
          ) : (
            "Setting up your access…"
          )}
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          {isActive
            ? "Your 7-day free trial has started. Coach Forge is unlocked — let's go."
            : "Hang tight, we're activating your account. This usually takes a few seconds."}
        </p>
        {session_id && (
          <p className="mt-4 text-[10px] text-muted-foreground/60">Ref: {session_id.slice(-8)}</p>
        )}
        <Button
          onClick={() => navigate({ to: "/" })}
          disabled={loading}
          className="mt-8 h-13 w-full rounded-xl bg-gradient-primary font-semibold text-primary-foreground shadow-glow"
        >
          Go to my dashboard
        </Button>
      </div>
    </div>
  );
}
