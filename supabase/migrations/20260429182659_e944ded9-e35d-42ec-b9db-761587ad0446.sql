-- Adiciona pontos no profile e tabela auxiliar (opcional já tem inventory_items, soma derivada)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points integer NOT NULL DEFAULT 0;

-- View de ranking agregando pontos e contagens por dia/semana
CREATE OR REPLACE VIEW public.ranking_view
WITH (security_invoker = true)
AS
SELECT
  p.id AS user_id,
  p.social_name,
  p.full_name,
  p.points,
  COALESCE(SUM(CASE WHEN i.created_at::date = CURRENT_DATE THEN 1 ELSE 0 END), 0)::int AS items_today,
  COALESCE(SUM(CASE WHEN i.created_at >= date_trunc('week', now()) THEN 1 ELSE 0 END), 0)::int AS items_week,
  COALESCE(COUNT(i.id), 0)::int AS items_total
FROM public.profiles p
LEFT JOIN public.inventory_items i ON i.user_id = p.id
GROUP BY p.id, p.social_name, p.full_name, p.points;

-- Permite que QUALQUER usuário autenticado veja o ranking (apenas social_name + agregados)
DROP POLICY IF EXISTS "Ranking visível para autenticados" ON public.profiles;
CREATE POLICY "Ranking visível para autenticados"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Trigger para somar 10 pontos a cada item inserido
CREATE OR REPLACE FUNCTION public.add_points_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET points = points + (10 * COALESCE(NEW.quantidade, 1))
  WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_add_points ON public.inventory_items;
CREATE TRIGGER trg_add_points
AFTER INSERT ON public.inventory_items
FOR EACH ROW EXECUTE FUNCTION public.add_points_on_insert();

-- Recalcula pontos para registros existentes
UPDATE public.profiles p
SET points = COALESCE((SELECT SUM(quantidade) * 10 FROM public.inventory_items WHERE user_id = p.id), 0);