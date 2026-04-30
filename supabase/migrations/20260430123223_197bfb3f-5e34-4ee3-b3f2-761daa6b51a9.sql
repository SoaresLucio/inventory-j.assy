-- 1. Remove gestor email whitelist from handle_new_user
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_social_name TEXT;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_social_name := COALESCE(NEW.raw_user_meta_data->>'social_name', split_part(NEW.email, '@', 1));

  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (NEW.id, v_full_name, v_social_name);

  -- Always assign the least-privileged role. Gestores must be promoted explicitly.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'inventarista'::app_role);

  RETURN NEW;
END;
$function$;

-- 2. Reset gestor_001 password (was hardcoded in migration history)
UPDATE auth.users
SET encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf'))
WHERE email = 'gestor_001@jassy.local';

-- 3. Restrict profiles SELECT - remove the broad "Ranking visível para autenticados" policy
DROP POLICY IF EXISTS "Ranking visível para autenticados" ON public.profiles;

-- 4. Replace ranking_view to expose only social_name + points (no full_name).
-- Use security_invoker=false (default) so the view can read profiles regardless of caller RLS.
DROP VIEW IF EXISTS public.ranking_view;
CREATE VIEW public.ranking_view
WITH (security_invoker = false) AS
SELECT
  p.id AS user_id,
  p.social_name,
  p.points,
  COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::integer AS items_today,
  COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::integer AS items_week,
  COALESCE(COUNT(i.id), 0)::integer AS items_total
FROM public.profiles p
LEFT JOIN public.inventory_items i ON i.user_id = p.id
GROUP BY p.id, p.social_name, p.points;

GRANT SELECT ON public.ranking_view TO authenticated;

-- 5. Tighten password_reset_requests INSERT: require social_name to match an existing profile
DROP POLICY IF EXISTS "Qualquer um pode pedir redefinição" ON public.password_reset_requests;

CREATE POLICY "Pedido de redefinição para usuário existente"
ON public.password_reset_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE lower(profiles.social_name) = lower(password_reset_requests.social_name)
  )
);

-- 6. Lock down SECURITY DEFINER helper functions from anon execution
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.add_points_on_insert() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.prevent_points_tampering() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.validate_password_reset_request() FROM anon, authenticated, public;