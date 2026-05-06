-- Revogar EXECUTE de PUBLIC e anon em funções SECURITY DEFINER e demais funções internas
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.add_points_on_insert() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.protect_seed_gestor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_points_tampering() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.validate_password_reset_request() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM PUBLIC, anon;

-- Garantir que authenticated possa executar o que o app precisa
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;