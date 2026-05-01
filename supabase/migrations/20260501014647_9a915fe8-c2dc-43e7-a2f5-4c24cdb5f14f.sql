-- 1) Imutabilidade
DROP POLICY IF EXISTS "Apenas gestores editam" ON public.inventory_items;
DROP POLICY IF EXISTS "Apenas gestores excluem" ON public.inventory_items;

-- 2) Protege gestor_001
CREATE OR REPLACE FUNCTION public.protect_seed_gestor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_social text;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    IF (TG_OP = 'DELETE' AND OLD.social_name = 'gestor_001')
       OR (TG_OP = 'UPDATE' AND OLD.social_name = 'gestor_001' AND NEW.social_name <> 'gestor_001') THEN
      RAISE EXCEPTION 'O usuário gestor_001 é protegido.';
    END IF;
  ELSIF TG_TABLE_NAME = 'user_roles' THEN
    SELECT social_name INTO v_social FROM public.profiles WHERE id = OLD.user_id;
    IF v_social = 'gestor_001' AND OLD.role = 'gestor' THEN
      RAISE EXCEPTION 'A role do gestor_001 é protegida.';
    END IF;
  END IF;
  RETURN COALESCE(OLD, NEW);
END;
$$;

DROP TRIGGER IF EXISTS protect_gestor_profile ON public.profiles;
CREATE TRIGGER protect_gestor_profile
  BEFORE UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_seed_gestor();

DROP TRIGGER IF EXISTS protect_gestor_role ON public.user_roles;
CREATE TRIGGER protect_gestor_role
  BEFORE UPDATE OR DELETE ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.protect_seed_gestor();

-- 3) Ranking com full_name (drop view e função primeiro)
DROP VIEW IF EXISTS public.ranking_view;
DROP FUNCTION IF EXISTS public.get_ranking();

CREATE FUNCTION public.get_ranking()
RETURNS TABLE(user_id uuid, social_name text, full_name text, points integer, items_today integer, items_week integer, items_total integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id, p.social_name, p.full_name, p.points,
    COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::integer,
    COALESCE(COUNT(i.id), 0)::integer
  FROM public.profiles p
  LEFT JOIN public.inventory_items i ON i.user_id = p.id
  GROUP BY p.id, p.social_name, p.full_name, p.points
  ORDER BY p.points DESC, COUNT(i.id) DESC;
$$;

CREATE VIEW public.ranking_view AS SELECT * FROM public.get_ranking();
GRANT SELECT ON public.ranking_view TO authenticated, anon;

-- 4) Push subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sent_at timestamptz
);
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários gerenciam próprias subscriptions" ON public.push_subscriptions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Gestores veem todas subscriptions" ON public.push_subscriptions
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'gestor'::app_role));

CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
