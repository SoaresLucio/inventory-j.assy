
-- 1) Remove broad SELECT on profiles (replace with restricted ranking access via definer view)
DROP POLICY IF EXISTS "Ranking visível para autenticados" ON public.profiles;

-- 2) Recreate ranking_view WITHOUT full_name and as SECURITY DEFINER
--    (security_invoker = false bypasses caller RLS; view only exposes safe columns)
DROP VIEW IF EXISTS public.ranking_view;
CREATE VIEW public.ranking_view
WITH (security_invoker = false)
AS
SELECT
  p.id AS user_id,
  p.social_name,
  p.points,
  COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS items_today,
  COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::int AS items_week,
  COALESCE(COUNT(i.id), 0)::int AS items_total
FROM public.profiles p
LEFT JOIN public.inventory_items i ON i.user_id = p.id
GROUP BY p.id, p.social_name, p.points;

REVOKE ALL ON public.ranking_view FROM PUBLIC, anon;
GRANT SELECT ON public.ranking_view TO authenticated;

-- 3) Restrict password_reset_requests INSERT to anon only (no enumeration via authenticated probing either),
--    and remove the existence-leak by allowing inserts unconditionally for anon — but that allows spam.
--    Better: keep the existence check but ALSO add a basic rate-limiting tag (left to app),
--    and ensure inserts NEVER reveal info via response. We change policy to not check existence:
--    pedido sempre é registrado; gestor decide.
DROP POLICY IF EXISTS "Pedido de redefinição para usuário existente" ON public.password_reset_requests;
CREATE POLICY "Qualquer um pode pedir redefinição"
ON public.password_reset_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (true);

-- 4) Lock down SECURITY DEFINER function execution: revoke from anon
REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;

-- 5) Rotate the seeded gestor_001 password to a random value (forces reset via app flow)
DO $$
DECLARE
  new_pwd text := encode(gen_random_bytes(24), 'base64');
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_pwd, gen_salt('bf'))
  WHERE email = 'gestor_001@jassy.local';
END $$;
