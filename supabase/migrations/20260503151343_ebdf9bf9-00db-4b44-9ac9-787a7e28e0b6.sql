CREATE OR REPLACE FUNCTION public.check_uc_duplicate(_uc text)
RETURNS TABLE(
  exists_already boolean,
  last_full_name text,
  last_social_name text,
  last_created_at timestamptz,
  total_count integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH matches AS (
    SELECT i.created_at, p.full_name, p.social_name
    FROM public.inventory_items i
    LEFT JOIN public.profiles p ON p.id = i.user_id
    WHERE i.uc = _uc
    ORDER BY i.created_at DESC
  )
  SELECT
    EXISTS (SELECT 1 FROM matches),
    (SELECT full_name FROM matches LIMIT 1),
    (SELECT social_name FROM matches LIMIT 1),
    (SELECT created_at FROM matches LIMIT 1),
    (SELECT COUNT(*)::int FROM matches);
$$;

REVOKE EXECUTE ON FUNCTION public.check_uc_duplicate(text) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.check_uc_duplicate(text) TO authenticated;