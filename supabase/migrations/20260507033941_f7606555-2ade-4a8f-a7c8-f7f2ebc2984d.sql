
ALTER TABLE public.program_adjustments
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'training',
  ADD COLUMN IF NOT EXISTS meal_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS macro_changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coach_note text,
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_program_adjustments_user_status
  ON public.program_adjustments (user_id, status, created_at DESC);
