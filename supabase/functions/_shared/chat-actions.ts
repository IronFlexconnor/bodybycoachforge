// Chat-driven plan adjustments: after each coach reply, a small classifier
// decides whether the user said something that should change their training
// or nutrition plan (injury, fatigue, travel, dislikes a meal, wants it
// harder/easier, new goal...). If so, it triggers the existing auto-adjust
// pipeline, which creates a pending "Plan upgrade" card the user can
// Approve / Reject on the Home screen — the coach never silently rewrites
// anyone's plan.

const CLASSIFIER_PROMPT = `You watch a message a user sent to their AI fitness coach, plus the coach's reply. Decide if the user said something that SHOULD trigger a concrete adjustment to their workout program or meal plan.

Trigger (should_adjust=true) ONLY for clear, plan-affecting statements:
- Injury/pain reports ("my shoulder hurts", "knee's acting up")
- Fatigue/illness/overtraining ("exhausted all week", "getting sick")
- Explicit change requests ("make it harder/easier", "swap my meals", "more protein", "I hate burpees, remove them", "shorter sessions")
- Schedule/life changes affecting training ("traveling next week", "can only train 2x now")
- New allergies/dietary changes ("going vegetarian", "turns out I'm lactose intolerant")
- New goal ("I want to focus on my glutes now")

Do NOT trigger for: general questions, chit-chat, asking for information/recipes/tips, progress updates that are going fine, motivation talk, or anything ambiguous. When unsure, do not trigger.

Return ONLY JSON: {"should_adjust": true|false, "reason": "one short sentence describing what to change and why (used to brief the adjustment engine)"}`;

export async function maybeTriggerAdjustment(opts: {
  apiKey: string;
  authHeader: string;
  supabaseUrl: string;
  userMsg: string;
  assistantMsg: string;
}): Promise<void> {
  const { apiKey, authHeader, supabaseUrl, userMsg, assistantMsg } = opts;
  try {
    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: CLASSIFIER_PROMPT },
          { role: "user", content: `USER MESSAGE:\n${userMsg}\n\nCOACH REPLY:\n${assistantMsg.slice(0, 2000)}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!resp.ok) return;
    const json = await resp.json();
    let verdict: { should_adjust?: boolean; reason?: string } = {};
    try { verdict = JSON.parse(json.choices?.[0]?.message?.content ?? "{}"); } catch { return; }
    if (!verdict.should_adjust) return;

    console.log("chat-adjust triggered:", verdict.reason);
    await fetch(`${supabaseUrl}/functions/v1/auto-adjust`, {
      method: "POST",
      headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger: "chat",
        user_request: `The user told their coach: "${userMsg}"\nWhat should change: ${verdict.reason ?? "see message"}`,
      }),
    });
  } catch (e) {
    console.error("chat-action trigger failed:", e);
  }
}
