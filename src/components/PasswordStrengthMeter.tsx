import { useEffect, useState } from "react";
import { ShieldAlert, ShieldCheck } from "lucide-react";

interface Props {
  password: string;
}

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; tone: string };

function scorePassword(pw: string): Strength {
  if (!pw) return { score: 0, label: "", tone: "" };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: "Too short", tone: "bg-destructive" },
    1: { score: 1, label: "Weak", tone: "bg-destructive" },
    2: { score: 2, label: "Fair", tone: "bg-orange-500" },
    3: { score: 3, label: "Strong", tone: "bg-yellow-500" },
    4: { score: 4, label: "Excellent", tone: "bg-green-500" },
  };
  return map[s as 0 | 1 | 2 | 3 | 4];
}

async function sha1Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

export function PasswordStrengthMeter({ password }: Props) {
  const [breached, setBreached] = useState<boolean | null>(null);
  const strength = scorePassword(password);

  useEffect(() => {
    let cancel = false;
    setBreached(null);
    if (password.length < 6) return;
    const t = setTimeout(async () => {
      try {
        const hash = await sha1Hex(password);
        const prefix = hash.slice(0, 5);
        const suffix = hash.slice(5);
        const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
          headers: { "Add-Padding": "true" },
        });
        if (!res.ok) return;
        const text = await res.text();
        const found = text.split("\n").some((line) => line.split(":")[0].trim() === suffix);
        if (!cancel) setBreached(found);
      } catch {
        // network errors: silently ignore — server-side HIBP still blocks signup
      }
    }, 400);
    return () => {
      cancel = true;
      clearTimeout(t);
    };
  }, [password]);

  if (!password) return null;

  return (
    <div className="space-y-1.5 px-1">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i <= strength.score ? strength.tone : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{strength.label}</span>
        {breached === true && (
          <span className="inline-flex items-center gap-1 font-medium text-destructive">
            <ShieldAlert className="h-3 w-3" /> Found in a data breach
          </span>
        )}
        {breached === false && password.length >= 8 && strength.score >= 3 && (
          <span className="inline-flex items-center gap-1 font-medium text-green-500">
            <ShieldCheck className="h-3 w-3" /> Not in known breaches
          </span>
        )}
      </div>
      {breached === true && (
        <p className="text-xs text-destructive">
          This password has appeared in a known data breach. Please choose a different one.
        </p>
      )}
    </div>
  );
}
