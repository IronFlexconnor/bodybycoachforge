CREATE TABLE public.coach_memories (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  summary text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.coach_memories TO authenticated;
GRANT ALL ON public.coach_memories TO service_role;

ALTER TABLE public.coach_memories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own memory" ON public.coach_memories
  FOR SELECT USING (auth.uid() = user_id);