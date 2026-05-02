-- 1. Rotate gestor_001 password to a random, unknowable value.
--    The seed account remains protected by triggers; admin must use password reset to set a new one.
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'gestor_001@jassy.local';
  IF v_uid IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf')),
        updated_at = now()
    WHERE id = v_uid;
  END IF;
END $$;

-- 2. Revoke anon access to ranking_view and get_ranking()
REVOKE SELECT ON public.ranking_view FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

-- 3. Lock down SECURITY DEFINER helper functions — only callable internally / by authenticated where needed
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_points_on_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.protect_seed_gestor() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_points_tampering() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_password_reset_request() FROM anon, authenticated, public;

-- 4. Tighten password_reset_requests INSERT policy: only anon (the public reset form) — signed-in users
--    don't need to flood reset requests. Keep validation trigger in place.
DROP POLICY IF EXISTS "Pedido de redefinição com nome válido" ON public.password_reset_requests;
CREATE POLICY "Pedido de redefinição com nome válido"
ON public.password_reset_requests
FOR INSERT
TO anon
WITH CHECK (
  length(social_name) >= 2
  AND length(social_name) <= 60
  AND (reason IS NULL OR length(reason) <= 500)
);