-- Adiciona gestor_001 à lista de seed gestores no trigger
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
  v_is_seed_gestor := (NEW.email IN ('gestor_ol@jassy.local', 'bruno_gestor@jassy.local', 'gestor_geral@jassy.local', 'gestor_001@jassy.local'));

  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (NEW.id, v_full_name, v_social_name);

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, CASE WHEN v_is_seed_gestor THEN 'gestor'::app_role ELSE 'inventarista'::app_role END);

  RETURN NEW;
END;
$function$;

-- Cria o usuário gestor_001 diretamente em auth.users
DO $$
DECLARE
  v_user_id uuid;
  v_existing_id uuid;
BEGIN
  SELECT id INTO v_existing_id FROM auth.users WHERE email = 'gestor_001@jassy.local';

  IF v_existing_id IS NOT NULL THEN
    -- Atualiza senha e garante role de gestor
    UPDATE auth.users
    SET encrypted_password = crypt('Ja147258@', gen_salt('bf')),
        email_confirmed_at = COALESCE(email_confirmed_at, now()),
        updated_at = now()
    WHERE id = v_existing_id;

    DELETE FROM public.user_roles WHERE user_id = v_existing_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_existing_id, 'gestor');

    INSERT INTO public.profiles (id, full_name, social_name)
    VALUES (v_existing_id, 'Gestor 001', 'gestor_001')
    ON CONFLICT (id) DO UPDATE SET social_name = EXCLUDED.social_name, full_name = EXCLUDED.full_name;
  ELSE
    v_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      'gestor_001@jassy.local',
      crypt('Ja147258@', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Gestor 001","social_name":"gestor_001"}'::jsonb,
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (
      id, user_id, identity_data, provider, provider_id,
      last_sign_in_at, created_at, updated_at
    ) VALUES (
      gen_random_uuid(),
      v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', 'gestor_001@jassy.local', 'email_verified', true),
      'email',
      v_user_id::text,
      now(), now(), now()
    );

    -- Garante role de gestor (caso o trigger não tenha rodado antes da atualização da função)
    DELETE FROM public.user_roles WHERE user_id = v_user_id;
    INSERT INTO public.user_roles (user_id, role) VALUES (v_user_id, 'gestor');
  END IF;
END $$;