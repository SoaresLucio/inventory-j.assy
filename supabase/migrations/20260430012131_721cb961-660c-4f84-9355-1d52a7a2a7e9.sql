CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name TEXT;
  v_social_name TEXT;
  v_is_seed_gestor BOOLEAN;
BEGIN
  v_full_name := COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email);
  v_social_name := COALESCE(NEW.raw_user_meta_data->>'social_name', split_part(NEW.email, '@', 1));
  v_is_seed_gestor := (NEW.email IN ('gestor_ol@jassy.local', 'bruno_gestor@jassy.local', 'gestor_geral@jassy.local'));

  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (NEW.id, v_full_name, v_social_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_seed_gestor THEN 'gestor'::app_role ELSE 'inventarista'::app_role END);

  RETURN NEW;
END;
$function$;