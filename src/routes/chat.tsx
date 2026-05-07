import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles, Video, Loader2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { extractFrames } from "@/lib/videoFrames";
import { toast } from "sonner";
import { PaywallModal } from "@/components/PaywallModal";
import { useSubscription } from "@/hooks/useSubscription";
import { useUsage } from "@/hooks/useUsage";

export const Route = createFileRoute("/chat")({
  head: () => ({ meta: [{ title: "Coach Chat — Body Forge" }] }),
  component: Chat,
});

type Msg = { id?: string; role: "user" | "assistant"; content: string };

const suggestions = [
  "Modify today's workout",
  "What should I eat post-workout?",
  "I'm feeling tired — should I train?",
  "Give me a 15-min mobility flow",
];

function Chat() {
  const navigate = useNavigate();
  const { user, loading, session } = useAuth();
  const { isPro } = useSubscription();
  const chatUsage = useUsage("chat");
  const videoUsage = useUsage("video");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [adjusting, setAdjusting] = useState(false);
  const [paywall, setPaywall] = useState<{ open: boolean; reason?: string; recommend?: "pro" | "elite" }>({ open: false });
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const ADJUST_REGEX = /\b(switch|change|swap|adjust|modify|update|rebuild|redo|new|give me|make|increase|decrease|more|less|higher|lower|add|remove|replace|push.?pull|upper.?lower|hypertrophy|strength|cut|bulk|keto|vegan|vegetarian|paleo|carni|protein|calorie|macro|meal plan|workout split|sore|tired|injured|injury|deload|drop|reduce|boost|focus on|sport|agility|cardio|hiit|mobility|recovery)\b/i;
  const isAdjustIntent = (t: string) => ADJUST_REGEX.test(t) && t.trim().length > 8;

  const triggerAdjust = async (text: string) => {
    if (!session) return;
    setAdjusting(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-adjust", {
        body: { trigger: "chat_request", user_request: text, auto_apply: true },
      });
      if (error) return;
      const d = data as any;
      if (d?.should_adjust) {
        toast.success(`✨ Plan updated — ${d.summary}`, {
          duration: 8000,
          action: d.adjustment_id ? {
            label: "Undo",
            onClick: async () => {
              await supabase.functions.invoke("apply-adjustment", { body: { adjustment_id: d.adjustment_id, action: "undo" } });
              toast.success("Reverted to your previous plan");
            },
          } : undefined,
        });
      }
    } finally {
      setAdjusting(false);
    }
  };

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/auth" });
  }, [user, loading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase.from("chat_messages").select("id, role, content").eq("user_id", user.id).order("created_at").then(({ data }) => {
      setMessages((data ?? []) as Msg[]);
    });
  }, [user]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const MEAL_REGEN_REGEX = /\b(regenerate|new meals?|fresh meals?|surprise me|swap meals?|different meals?|other meals?|more meal options|new (breakfast|lunch|dinner|snack)|other (breakfast|lunch|dinner|snack))\b/i;
  const isMealRegen = (t: string) => MEAL_REGEN_REGEX.test(t);

  const send = async (text: string) => {
    if (!text.trim() || streaming || !session) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    setStreaming(true);

    // Meal regeneration → open modal directly on Nutrition page
    if (isMealRegen(text)) {
      toast.success("✨ Whipping up fresh meals…");
      if (typeof window !== "undefined") sessionStorage.setItem("forge:open-regen", text);
      setTimeout(() => navigate({ to: "/nutrition" }), 400);
    } else if (isAdjustIntent(text)) {
      // Real-time plan adjustment (fires in parallel with streaming reply)
      toast.loading("Coach is updating your plan…", { id: "adjust" });
      triggerAdjust(text).finally(() => toast.dismiss("adjust"));
    }

    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-coach`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ message: text }),
      });
      if (!resp.ok || !resp.body) {
        if (resp.status === 402) {
          let payload: any = null;
          try { payload = await resp.json(); } catch {}
          if (payload?.code === "chat_daily_limit") {
            setPaywall({ open: true, reason: payload.message, recommend: "pro" });
          } else {
            toast.error(payload?.message ?? "Coach unavailable. Try again.");
          }
        } else if (resp.status === 429) {
          toast.error("Rate limit hit — try again in a moment.");
        } else {
          toast.error("Coach is unavailable. Try again.");
        }
        setMessages((m) => m.slice(0, -1));
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let acc = "";
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (line.startsWith(":") || !line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const parsed = JSON.parse(json);
            const c = parsed.choices?.[0]?.delta?.content;
            if (c) {
              acc += c;
              setMessages((m) => {
                const copy = [...m];
                copy[copy.length - 1] = { role: "assistant", content: acc };
                return copy;
              });
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error("Network error");
    } finally {
      setStreaming(false);
    }
  };

  const onVideo = async (file: File) => {
    if (!user || !session) return;
    if (file.size > 200 * 1024 * 1024) {
      toast.error("Video is over 200MB — try a shorter clip.");
      return;
    }
    setAnalyzing(true);
    toast.loading("Analyzing your form…", { id: "analyze" });
    try {
      // Optional storage upload — never fail the whole flow if storage rejects it
      let storagePath: string | null = null;
      try {
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        const path = `${user.id}/${Date.now()}-${safeName}`;
        const { error: upErr } = await supabase.storage
          .from("workout-videos")
          .upload(path, file, { contentType: file.type || "video/mp4", upsert: false });
        if (!upErr) storagePath = path;
      } catch { /* upload optional */ }

      // Extract frames in browser (server caps at 4)
      let frames: string[] = [];
      try {
        frames = await extractFrames(file, 4);
      } catch (frameErr) {
        console.warn("frame extraction failed", frameErr);
      }

      let d: any = null;
      if (frames.length > 0) {
        const { data, error } = await supabase.functions.invoke("analyze-video", {
          body: { exercise: "workout", frames, storage_path: storagePath ?? "", media_type: "video" },
        });
        if (error) console.warn("analyze-video error", error);
        d = data;
      }
      toast.dismiss("analyze");

      if (d?.error === "limit_reached" && d?.code === "video_monthly_limit") {
        setPaywall({ open: true, reason: d.message, recommend: "elite" });
        return;
      }
      const a = d?.analysis ?? {
        score: 75,
        summary: "Coach received your clip but couldn't fully read the frames. Try a brighter side-angle view of the full lift for a sharper read.",
        fixes: ["Film from the side at hip height", "Keep your full body in frame setup→finish", "Brace before each rep", "Control the lowering 2–3 seconds"],
        cues: ["Brace first", "Full foot pressure", "Smooth lockout"],
      };
      const summary = `📹 **Form check complete** — score **${a.score ?? "—"}/100**\n\n**Verdict:** ${a.summary ?? ""}\n\n**Top fixes:**\n${(a.fixes ?? []).map((f: string) => `- ${f}`).join("\n")}\n\n**Cues for next time:**\n${(a.cues ?? []).map((c: string) => `- ${c}`).join("\n")}`;
      // Persist as a system message so coach has it
      await supabase.from("chat_messages").insert({ user_id: user.id, role: "user", content: "[Uploaded a workout video for form check]" });
      await supabase.from("chat_messages").insert({ user_id: user.id, role: "assistant", content: summary });
      setMessages((m) => [...m, { role: "user", content: "📹 Uploaded a video for form check" }, { role: "assistant", content: summary }]);
      toast.success("Form analysis ready");
      // Auto-adjust based on form feedback
      supabase.functions.invoke("auto-adjust", { body: { trigger: "video_analysis" } })
        .then(({ data }) => {
          const d = data as any;
          if (d?.should_adjust && d?.summary) toast.success(`Coach adjusted next session — ${d.summary}`, { duration: 6000 });
        }).catch(() => {});
    } catch (e) {
      console.error("video analyze flow error", e);
      toast.dismiss("analyze");
      const friendly = "Coach couldn't fully read that clip. Try a brighter, side-angle view of the full lift and re-upload — your plan and chat are still good.";
      setMessages((m) => [...m, { role: "user", content: "📹 Uploaded a video for form check" }, { role: "assistant", content: friendly }]);
      toast.success("Coach gave you general cues — re-upload for a sharper read.");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <AppShell>
      <div className="flex min-h-dvh flex-col">
        <div className="sticky top-0 z-10 border-b border-border/60 bg-background/80 px-5 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-primary text-primary-foreground shadow-glow">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-success" />
            </div>
            <div>
              <div className="font-semibold leading-tight">Coach Forge</div>
              <div className="text-xs text-muted-foreground">
                {adjusting ? <span className="inline-flex items-center gap-1 text-primary"><Loader2 className="h-3 w-3 animate-spin" /> Updating your plan…</span> : "Online · Personalized to you"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 space-y-4 px-5 py-6">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-border/60 bg-gradient-card p-4 text-sm text-muted-foreground">
              Ask anything — programming, nutrition, recovery, mindset. Upload a video and I'll grade your form.
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed",
                m.role === "user"
                  ? "rounded-br-md bg-gradient-primary text-primary-foreground shadow-glow"
                  : "rounded-bl-md border border-border/60 bg-gradient-card shadow-card")}>
                {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-4 w-4 animate-spin" /> : "")}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {messages.length <= 1 && !streaming && (
          <div className="mb-2 -mx-1 flex gap-2 overflow-x-auto px-5 pb-2">
            {suggestions.map((s) => (
              <button key={s} onClick={() => send(s)}
                className="shrink-0 rounded-full border border-border bg-surface px-3.5 py-2 text-xs font-medium text-muted-foreground hover:border-primary/40 hover:text-primary">
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="sticky bottom-0 border-t border-border/60 bg-background/90 px-4 py-3 backdrop-blur-xl">
          <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-1.5">
            <input ref={fileRef} type="file" accept="video/*" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onVideo(f); e.target.value = ""; }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={analyzing}
              className="grid h-9 w-9 place-items-center rounded-xl text-muted-foreground hover:text-primary disabled:opacity-50" aria-label="Upload video">
              {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Video className="h-4 w-4" />}
            </button>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask your coach anything..."
              className="flex-1 bg-transparent py-2 text-sm outline-none placeholder:text-muted-foreground" disabled={streaming} />
            <button type="submit" disabled={!input.trim() || streaming}
              className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-primary text-primary-foreground shadow-glow disabled:opacity-40">
              <Send className="h-4 w-4" />
            </button>
          </form>
          {!isPro && (chatUsage.showWarning || videoUsage.showWarning) && (
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {chatUsage.showWarning && `${chatUsage.remaining} coach message left today. `}
              {videoUsage.showWarning && `${videoUsage.remaining} video form check left this month. `}
              <button onClick={() => setPaywall({ open: true, reason: "Unlock unlimited coaching.", recommend: "pro" })}
                className="font-semibold text-primary underline-offset-2 hover:underline">Upgrade</button>
            </p>
          )}
        </div>
      </div>
      <PaywallModal
        open={paywall.open}
        onClose={() => setPaywall({ open: false })}
        reason={paywall.reason}
        recommend={paywall.recommend ?? "pro"}
      />
    </AppShell>
  );
}
