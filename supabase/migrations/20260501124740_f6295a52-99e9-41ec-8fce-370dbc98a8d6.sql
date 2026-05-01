-- Cria/garante usuário gestor_001 com senha definida
DO $$
DECLARE
  v_uid uuid;
  v_email text := 'gestor_001@jassy.local';
  v_pass text := 'Ja147258@';
BEGIN
  -- Garante extensão pgcrypto
  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  SELECT id INTO v_uid FROM auth.users WHERE email = v_email;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change,
      email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
      v_email, crypt(v_pass, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Gestor Principal','social_name','gestor_001'),
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', v_email),
      'email', v_email, now(), now(), now());
  ELSE
    UPDATE auth.users
      SET encrypted_password = crypt(v_pass, gen_salt('bf')),
          email_confirmed_at = COALESCE(email_confirmed_at, now()),
          updated_at = now()
      WHERE id = v_uid;
  END IF;

  -- Profile
  INSERT INTO public.profiles (id, full_name, social_name)
  VALUES (v_uid, 'Gestor Principal', 'gestor_001')
  ON CONFLICT (id) DO UPDATE SET social_name = 'gestor_001', full_name = 'Gestor Principal';

  -- Role gestor (remove inventarista padrão se existir)
  DELETE FROM public.user_roles WHERE user_id = v_uid AND role = 'inventarista';
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_uid, 'gestor'::app_role)
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;