
-- Trigger-only functions: revoke EXECUTE from PUBLIC/anon/authenticated (triggers still run as table owner)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.add_points_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.prevent_points_tampering() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_password_reset_request() FROM PUBLIC, anon, authenticated;

-- Reusable helpers: keep authenticated only
REVOKE EXECUTE ON FUNCTION public.get_ranking() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
