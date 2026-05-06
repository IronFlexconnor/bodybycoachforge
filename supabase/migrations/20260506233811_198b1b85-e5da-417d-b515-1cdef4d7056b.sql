ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS agreed_to_disclaimer boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS agreed_to_disclaimer_at timestamptz;