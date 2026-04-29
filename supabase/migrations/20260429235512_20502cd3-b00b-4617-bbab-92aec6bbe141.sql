-- Ensure trigger that creates profile + role on signup exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill missing profiles for existing auth users
INSERT INTO public.profiles (id, full_name, social_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email, 'Usuário'),
  COALESCE(u.raw_user_meta_data->>'social_name', split_part(COALESCE(u.email, 'user'), '@', 1))
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL;

-- Backfill roles for users without any role (default inventarista, except seed gestores)
INSERT INTO public.user_roles (user_id, role)
SELECT
  u.id,
  CASE WHEN u.email IN ('gestor_ol@jassy.local', 'bruno_gestor@jassy.local')
       THEN 'gestor'::app_role
       ELSE 'inventarista'::app_role END
FROM auth.users u
LEFT JOIN public.user_roles r ON r.user_id = u.id
WHERE r.user_id IS NULL;

-- Backfill points for existing inventory items (10 pts per quantidade)
UPDATE public.profiles p
SET points = COALESCE((
  SELECT SUM(10 * COALESCE(i.quantidade, 1))::int
  FROM public.inventory_items i
  WHERE i.user_id = p.id
), 0)
WHERE EXISTS (SELECT 1 FROM public.inventory_items i WHERE i.user_id = p.id);