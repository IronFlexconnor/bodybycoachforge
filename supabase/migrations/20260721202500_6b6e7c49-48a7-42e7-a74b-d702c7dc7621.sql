-- Lock down SECURITY DEFINER function execution and add UPDATE policy on workout-videos storage.

-- Trigger-only functions: no one should call directly
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Helper functions used inside RLS policies: keep authenticated only, revoke anon/public
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid, text, text[]) TO authenticated, service_role;

-- Storage: add UPDATE policy for workout-videos bucket, folder-owner scoped
CREATE POLICY "Users can update own workout videos"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'workout-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
)
WITH CHECK (
  bucket_id = 'workout-videos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
