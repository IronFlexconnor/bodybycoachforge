-- Storage bucket (private)
INSERT INTO storage.buckets (id, name, public) VALUES ('body-photos', 'body-photos', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "body_photos_select_own" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "body_photos_insert_own" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "body_photos_update_own" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "body_photos_delete_own" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'body-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Body analyses
CREATE TABLE IF NOT EXISTS public.body_analyses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  front_path text,
  side_path text,
  rear_path text,
  bodyfat_estimate numeric,
  muscle_notes text,
  posture_notes text,
  feedback text,
  comparison text,
  weight numeric,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.body_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own_body_analyses_all" ON public.body_analyses FOR ALL
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS body_analyses_user_idx ON public.body_analyses (user_id, created_at DESC);