
-- Recreate ranking_view as a normal (security_invoker) view and back it with the existing
-- SECURITY DEFINER function get_ranking() that returns only safe columns.
DROP VIEW IF EXISTS public.ranking_view;
CREATE VIEW public.ranking_view
WITH (security_invoker = true)
AS
SELECT * FROM public.get_ranking();

REVOKE ALL ON public.ranking_view FROM PUBLIC, anon;
GRANT SELECT ON public.ranking_view TO authenticated;

-- Replace the WITH CHECK (true) policy with one that enforces basic length validation only.
-- The validate_password_reset_request trigger already enforces length and prevents privilege fields.
DROP POLICY IF EXISTS "Qualquer um pode pedir redefinição" ON public.password_reset_requests;
CREATE POLICY "Pedido de redefinição com nome válido"
ON public.password_reset_requests
FOR INSERT
TO anon, authenticated
WITH CHECK (
  length(social_name) BETWEEN 2 AND 60
  AND (reason IS NULL OR length(reason) <= 500)
);
