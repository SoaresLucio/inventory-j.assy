DROP VIEW IF EXISTS public.ranking_view;
DROP FUNCTION IF EXISTS public.get_ranking();

CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE(
  user_id uuid,
  social_name text,
  full_name text,
  points integer,
  items_today integer,
  items_week integer,
  items_month integer,
  items_total integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id, p.social_name, p.full_name, p.points,
    COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('month', now()) THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(COUNT(i.id), 0)::integer
  FROM public.profiles p
  LEFT JOIN public.inventory_items i ON i.user_id = p.id
  GROUP BY p.id, p.social_name, p.full_name, p.points
  ORDER BY
    COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('month', now()) THEN 1 ELSE 0 END), 0) DESC,
    p.points DESC,
    COUNT(i.id) DESC;
$$;

CREATE VIEW public.ranking_view
WITH (security_invoker=on) AS
SELECT user_id, social_name, full_name, points, items_today, items_week, items_month, items_total
FROM public.get_ranking();

GRANT SELECT ON public.ranking_view TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;