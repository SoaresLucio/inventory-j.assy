
-- Garante apenas 1 pedido pendente por nome social
CREATE UNIQUE INDEX idx_prr_unique_pending
ON public.password_reset_requests (lower(social_name))
WHERE status = 'pending';

-- Trigger de validação para entradas anônimas
CREATE OR REPLACE FUNCTION public.validate_password_reset_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Sanitização de tamanho
  IF length(NEW.social_name) < 2 OR length(NEW.social_name) > 60 THEN
    RAISE EXCEPTION 'Nome social inválido.';
  END IF;
  IF NEW.reason IS NOT NULL AND length(NEW.reason) > 500 THEN
    RAISE EXCEPTION 'Motivo muito longo (máx 500 caracteres).';
  END IF;

  -- Anônimos só podem criar pedidos pendentes, sem definir resolved_*
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'gestor'::app_role) THEN
    NEW.status := 'pending';
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    NEW.user_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_password_reset_request
BEFORE INSERT ON public.password_reset_requests
FOR EACH ROW EXECUTE FUNCTION public.validate_password_reset_request();
