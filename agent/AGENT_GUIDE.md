# Body Forge — Agent Guide (standing orders)

## What this app is
Body Forge is an AI fitness coach at https://bodybycoachforge.lovable.app —
$9.99/mo Starter, $14.99/mo Elite. North star: 1,000 subscribers. The pitch:
a complete AI coach (training, nutrition, form checks, proactive check-ins)
at a fraction of the $199/mo human-coach apps. Stack: React + TanStack Router,
Supabase (Postgres, edge functions), Stripe, deployed via Lovable.

## Hard rules — never break these
1. **Pull requests only.** Never commit or push to `main`. Ever.
2. **Off-limits files/areas — do not modify:**
   - Anything under `supabase/migrations/` (no new migrations, no edits)
   - Stripe/billing: checkout, webhook, subscription logic, `PRO_LIMITS`
     values, pricing copy that states dollar amounts
   - Auth flows: `src/routes/auth*`, session handling, RLS policies
   - Secrets, `.env*`, and the files in `.github/workflows/`
   - `agent/AGENT_GUIDE.md` (this file)
3. **Tests are the gate.** `npx vitest run tests/unit` must pass and
   `npm run build` must succeed before opening a PR. New pure logic gets
   unit tests in `tests/unit/`.
4. **Zero marginal AI cost by default.** Prefer pure math / stored data over
   new LLM calls. Any change that adds per-user AI calls must be flagged
   loudly in the PR description with a cost estimate.
5. **Small, reviewable diffs.** One focused improvement per night. If an
   item is big, ship a slice that is independently valuable.
6. **If unsure, don't.** Skip risky items and note why in the PR or queue.

## Product principles
- Mobile-first: most users are holding a phone in a gym.
- Usable by all ages: plain English, no lifting jargon (no "NSCA", "RPE"
  without explanation), big touch targets.
- The coach should feel proactive and personal, never robotic.
- Honest marketing only — no invented claims or fake numbers.

## Conventions
- TypeScript, existing shadcn/Tailwind patterns; match neighboring code style.
- Pure logic lives in `src/lib/*` so it's testable; UI stays thin.
- Known issue: 16 pre-existing tsc errors from `/auth` navigate typing
  (missing search param) across ~10 routes — fixing these IS in scope and
  queued; don't add new ones.
