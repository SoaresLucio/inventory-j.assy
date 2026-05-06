CREATE OR REPLACE FUNCTION public.prevent_points_tampering()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    -- Permite alterações feitas por outros triggers (ex.: add_points_on_insert),
    -- detectadas por pg_trigger_depth() > 1 (estamos aninhados em outro trigger).
    IF pg_trigger_depth() > 1 THEN
      RETURN NEW;
    END IF;
    -- Contexto sem usuário autenticado (jobs/admin server-side) também é permitido.
    IF auth.uid() IS NULL THEN
      RETURN NEW;
    END IF;
    -- Caso contrário, apenas gestores podem alterar pontos diretamente.
    IF NOT public.has_role(auth.uid(), 'gestor'::app_role) THEN
      RAISE EXCEPTION 'Não é permitido alterar a coluna points diretamente.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;