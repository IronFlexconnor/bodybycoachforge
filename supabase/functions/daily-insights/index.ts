// Returns today's curated 6 health & fitness insight cards.
// Caches by date in public.daily_insights so all users share the same daily feed.
// Falls back to a curated rotating bank if the AI gateway is unavailable, so
// the feed ALWAYS has fresh, high-quality cards.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `You are Coach Forge — a warm, world-class strength, nutrition, and performance coach with PhD-level expertise (NSCA / ISSN / ACSM / sports-psychology).
Generate 7 short, exciting insight cards on the most interesting RECENT discoveries in health & fitness — performance science, nutrition breakthroughs, recovery, training tips, mental training, supplements, and injury prevention.
Each card MUST be readable in 30–60 seconds and feel premium, fresh, and trustworthy. Vary categories every day. Tone: warm, energizing, world-class.`;

const TOOL = {
  type: "function",
  function: {
    name: "publish_insights",
    description: "Publish today's curated insight cards.",
    parameters: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          minItems: 7,
          maxItems: 8,
          items: {
            type: "object",
            properties: {
              category: { type: "string", enum: ["recovery", "training", "nutrition", "supplements", "sleep", "mindset", "performance", "injury_prevention"] },
              emoji: { type: "string" },
              headline: { type: "string" },
              summary: { type: "string" },
              why_it_matters: { type: "string" },
              apply_action: { type: "string" },
              read_minutes: { type: "number" },
            },
            required: ["category", "emoji", "headline", "summary", "why_it_matters", "apply_action", "read_minutes"],
            additionalProperties: false,
          },
        },
      },
      required: ["cards"],
      additionalProperties: false,
    },
  },
};

// Curated bank — rotated deterministically by date so every day looks fresh.
const BANK = [
  { category: "recovery", emoji: "🧊", headline: "Cold plunges may blunt muscle gains post-lift", summary: "Recent meta-analysis shows ice baths within 4 hours of strength training reduce hypertrophy by ~10% over 12 weeks.", why_it_matters: "If you're chasing muscle, save the cold plunge for rest days or 6+ hours after lifting.", apply_action: "Move cold exposure to non-lifting days or mornings.", read_minutes: 1 },
  { category: "training", emoji: "📈", headline: "1 hard set to failure ≈ 3 sets at RPE 7", summary: "New volume-equating studies suggest a single brutal set can match 3 moderate sets for hypertrophy in trained lifters.", why_it_matters: "When time-crunched, swap 3 easy sets for 1 all-out set and keep growing.", apply_action: "Add one true AMRAP finisher to your main lift today.", read_minutes: 1 },
  { category: "nutrition", emoji: "🥩", headline: "Protein per meal cap is higher than we thought", summary: "Updated research shows muscle protein synthesis keeps rising past 40g — up to ~100g in a single feeding for trained adults.", why_it_matters: "Bigger protein meals (especially post-workout) work — you don't have to micro-dose every 3 hours.", apply_action: "Bump your post-workout meal to 50g+ of protein.", read_minutes: 1 },
  { category: "sleep", emoji: "😴", headline: "Even 1 night of bad sleep tanks insulin sensitivity", summary: "Stanford data show 5h of sleep reduces glucose disposal by ~25% the next day — a single rough night dents recovery.", why_it_matters: "Protect your sleep window like training: it directly drives body comp.", apply_action: "Set a hard phone-down alarm 60 min before bed tonight.", read_minutes: 1 },
  { category: "supplements", emoji: "💊", headline: "Creatine timing barely matters — total dose does", summary: "A 2025 review confirms 5g/day of creatine works whether taken pre-, post-, or any time of day. Consistency beats timing.", why_it_matters: "Stop overthinking it — just take it daily, even on rest days.", apply_action: "Stir 5g creatine into your first drink of the day.", read_minutes: 1 },
  { category: "mindset", emoji: "🧠", headline: "Self-talk in 3rd person beats willpower", summary: "Michigan researchers found saying \"You've got this, [name]\" out-performs \"I've got this\" for finishing hard sets.", why_it_matters: "A tiny verbal switch can squeeze out 1–2 more reps and save a session on bad days.", apply_action: "Use 3rd-person cue on your hardest set today.", read_minutes: 1 },
  { category: "performance", emoji: "⚡", headline: "Caffeine 60 min pre-lift > 30 min", summary: "Pharmacokinetic studies put peak plasma caffeine at ~60 min — most lifters dose too late.", why_it_matters: "Earlier timing = stronger lifts and better focus during the working sets.", apply_action: "Take 200mg caffeine 60 min before your next workout.", read_minutes: 1 },
  { category: "training", emoji: "🦵", headline: "Stretching between sets boosts hypertrophy", summary: "Loaded inter-set stretching of the working muscle (~30s) increased growth ~20% in a 12-week trial.", why_it_matters: "Free hypertrophy by using rest periods more intentionally.", apply_action: "After each chest set, do a 30s loaded pec stretch.", read_minutes: 1 },
  { category: "nutrition", emoji: "🌾", headline: "Carbs around training help even on cuts", summary: "Energy availability research shows cutting carbs entirely while in deficit slashes performance and lean mass retention.", why_it_matters: "Keep peri-workout carbs even when dieting to preserve muscle and effort.", apply_action: "Add 30–50g carbs in your pre-workout meal.", read_minutes: 1 },
  { category: "recovery", emoji: "🚶", headline: "10-min walk after meals beats cardio for glucose", summary: "Just 10 min of walking post-meal cuts blood sugar spikes more than a single longer cardio session earlier in the day.", why_it_matters: "Tiny daily walks compound into better body comp than weekend warriors.", apply_action: "Walk 10 min after your biggest meal today.", read_minutes: 1 },
  { category: "sleep", emoji: "🌡️", headline: "Cool room (65°F) = deeper sleep", summary: "Sleep-stage tracking shows core-temp drops drive slow-wave sleep — bedrooms over 70°F cut deep sleep by ~25%.", why_it_matters: "Recovery, GH release, and next-day output all hinge on slow-wave sleep.", apply_action: "Drop your bedroom thermostat to 65–67°F tonight.", read_minutes: 1 },
  { category: "mindset", emoji: "📝", headline: "Writing tomorrow's top 3 wins compliance", summary: "Behavioral data shows journaling 3 micro-tasks for tomorrow doubles next-day workout completion.", why_it_matters: "Decision fatigue kills consistency — pre-decide and you'll show up.", apply_action: "Write 3 wins for tomorrow before bed tonight.", read_minutes: 1 },
];

function rotate<T>(arr: T[], seed: number, count: number): T[] {
  const out: T[] = [];
  const used = new Set<number>();
  let s = seed;
  while (out.length < count && used.size < arr.length) {
    s = (s * 9301 + 49297) % 233280;
    const i = s % arr.length;
    if (!used.has(i)) { used.add(i); out.push(arr[i]); }
  }
  return out;
}

function fallbackCards(today: string) {
  const seed = today.split("-").reduce((a, b) => a + parseInt(b, 10), 0);
  return rotate(BANK, seed || 1, 7);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const apiKey = Deno.env.get("LOVABLE_API_KEY")!;
    const admin = createClient(url, service);

    const today = new Date().toISOString().slice(0, 10);

    // Check cache
    const { data: cached } = await admin
      .from("daily_insights")
      .select("cards")
      .eq("insight_date", today)
      .maybeSingle();
    if (cached?.cards && Array.isArray(cached.cards) && cached.cards.length) {
      return new Response(JSON.stringify({ date: today, cards: cached.cards }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Try AI generation
    let cards: any[] = [];
    try {
      const seed = Math.random().toString(36).slice(2, 8);
      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: `Today is ${today}. Generate 6 brand-new insight cards (variation seed: ${seed}). Vary categories.` },
          ],
          tools: [TOOL],
          tool_choice: { type: "function", function: { name: "publish_insights" } },
        }),
      });
      if (aiResp.ok) {
        const j = await aiResp.json();
        const args = j?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
        cards = args ? (JSON.parse(args).cards ?? []) : [];
      } else {
        console.warn("daily-insights AI status", aiResp.status);
      }
    } catch (e) {
      console.warn("daily-insights AI failed, using fallback", e);
    }

    // Fallback to curated bank if AI didn't deliver
    if (!Array.isArray(cards) || cards.length < 6) {
      cards = fallbackCards(today);
    }

    await admin.from("daily_insights").upsert({ insight_date: today, cards }, { onConflict: "insight_date" });

    return new Response(JSON.stringify({ date: today, cards }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    // Last-resort fallback so the UI is never empty
    const today = new Date().toISOString().slice(0, 10);
    return new Response(JSON.stringify({ date: today, cards: fallbackCards(today) }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
