-- Backfill profiles para usuarios em auth.users que nao tem profile
INSERT INTO public.profiles (id, full_name, social_name)
SELECT 
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  COALESCE(u.raw_user_meta_data->>'social_name', split_part(u.email, '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill user_roles (todos sem role recebem 'inventarista')
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'inventarista'::app_role
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;