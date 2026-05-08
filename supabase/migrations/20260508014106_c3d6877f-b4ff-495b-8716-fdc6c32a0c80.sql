
CREATE TABLE IF NOT EXISTS public.usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  ref_id text,
  ref_label text,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS usage_events_user_idx ON public.usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_type_idx ON public.usage_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS usage_events_ref_idx ON public.usage_events(event_type, ref_id);

ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_usage_events_select ON public.usage_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY own_usage_events_insert ON public.usage_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE VIEW public.popular_content AS
SELECT event_type, ref_id, ref_label,
       COUNT(*)::int AS uses,
       COUNT(DISTINCT user_id)::int AS users,
       MAX(created_at) AS last_used
FROM public.usage_events
WHERE created_at > now() - interval '30 days'
  AND ref_id IS NOT NULL
GROUP BY event_type, ref_id, ref_label;

GRANT SELECT ON public.popular_content TO authenticated;
