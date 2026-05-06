import { Sparkles, Crown, AlertTriangle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useSubscription } from "@/hooks/useSubscription";

/** Top-of-app banner: trial countdown, dunning, or grace period notice. */
export function SubscriptionBanner() {
  const { sub, isActive, isTrialing, loading } = useSubscription();
  if (loading || !sub) return null;

  // Past due — payment retrying
  if (sub.status === "past_due") {
    return (
      <Banner tone="warning" icon={AlertTriangle}>
        <span>
          <strong>Payment issue.</strong> Update your card to keep your coach access.
        </span>
        <Link to="/profile" className="ml-auto shrink-0 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold">
          Fix it
        </Link>
      </Banner>
    );
  }

  // Canceled but still in grace period
  if (sub.status === "canceled" && sub.current_period_end && new Date(sub.current_period_end) > new Date()) {
    const days = Math.ceil((new Date(sub.current_period_end).getTime() - Date.now()) / 86400000);
    return (
      <Banner tone="warning" icon={AlertTriangle}>
        <span>Subscription canceled — access ends in {days} day{days === 1 ? "" : "s"}.</span>
        <Link to="/profile" className="ml-auto shrink-0 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold">
          Resume
        </Link>
      </Banner>
    );
  }

  // Trialing with cancel-at-period-end → end-of-trial reminder
  if (isTrialing && sub.trial_end) {
    const days = Math.max(0, Math.ceil((new Date(sub.trial_end).getTime() - Date.now()) / 86400000));
    if (days <= 7) {
      return (
        <Banner tone="primary" icon={Crown}>
          <span>
            <strong>Trial:</strong> {days === 0 ? "ends today" : `${days} day${days === 1 ? "" : "s"} left`} — full access.
          </span>
          <Link to="/profile" className="ml-auto shrink-0 rounded-full bg-foreground/10 px-3 py-1 text-xs font-semibold">
            Manage
          </Link>
        </Banner>
      );
    }
  }

  // Active premium → no banner (they're happy)
  if (isActive) return null;
  return null;
}

function Banner({ tone, icon: Icon, children }: { tone: "primary" | "warning"; icon: typeof Sparkles; children: React.ReactNode }) {
  const cls = tone === "primary"
    ? "border-primary/40 bg-gradient-to-r from-primary/15 to-primary/5 text-foreground"
    : "border-warning/40 bg-warning/10 text-foreground";
  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2 text-sm ${cls}`}>
      <Icon className="h-4 w-4 shrink-0 text-primary" />
      {children}
    </div>
  );
}
