-- Drop the security-definer view and replace with a SECURITY DEFINER function
DROP VIEW IF EXISTS public.ranking_view;

CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE (
  user_id uuid,
  social_name text,
  points integer,
  items_today integer,
  items_week integer,
  items_total integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id AS user_id,
    p.social_name,
    p.points,
    COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::integer AS items_today,
    COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::integer AS items_week,
    COALESCE(COUNT(i.id), 0)::integer AS items_total
  FROM public.profiles p
  LEFT JOIN public.inventory_items i ON i.user_id = p.id
  GROUP BY p.id, p.social_name, p.points
  ORDER BY p.points DESC;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;