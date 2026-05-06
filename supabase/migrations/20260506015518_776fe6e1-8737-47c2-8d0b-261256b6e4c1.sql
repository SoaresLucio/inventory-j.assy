REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.add_points_on_insert() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.protect_seed_gestor() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_points_tampering() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_password_reset_request() FROM authenticated;