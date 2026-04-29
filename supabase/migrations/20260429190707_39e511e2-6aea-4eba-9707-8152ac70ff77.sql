-- Atualiza trigger para reconhecer também bruno_gestor como gestor
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
  v_is_seed_gestor := (NEW.email IN ('gestor_ol@jassy.local', 'bruno_gestor@jassy.local'));

  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (NEW.id, v_full_name, v_social_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_seed_gestor THEN 'gestor'::app_role ELSE 'inventarista'::app_role END);

  RETURN NEW;
END;
$function$;

-- Cria usuário gestor bruno_gestor
DO $$
DECLARE
  v_uid uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'bruno_gestor@jassy.local') THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    )
    VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated',
      'bruno_gestor@jassy.local',
      crypt('J147258', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Bruno Gestor','social_name','bruno_gestor'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', 'bruno_gestor@jassy.local'),
      'email', v_uid::text, now(), now(), now());
  END IF;
END $$;

-- Garante que o perfil/role existem (caso o trigger não tenha rodado por já existir)
INSERT INTO public.profiles (id, full_name, social_name)
SELECT u.id, 'Bruno Gestor', 'bruno_gestor'
FROM auth.users u
WHERE u.email = 'bruno_gestor@jassy.local'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'gestor'::app_role
FROM auth.users u
WHERE u.email = 'bruno_gestor@jassy.local'
ON CONFLICT DO NOTHING;