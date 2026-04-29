
-- 1) Privilege escalation fix: add restrictive INSERT/UPDATE/DELETE policies on user_roles
-- so only gestores can insert/modify roles. The existing ALL policy is permissive, which
-- combined with no other matching policy still allowed self-insert because there was no
-- explicit INSERT policy denying non-gestores. We add a RESTRICTIVE policy to enforce it.

DROP POLICY IF EXISTS "Apenas gestores inserem roles" ON public.user_roles;
CREATE POLICY "Apenas gestores inserem roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Apenas gestores atualizam roles" ON public.user_roles;
CREATE POLICY "Apenas gestores atualizam roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'gestor'::app_role));

DROP POLICY IF EXISTS "Apenas gestores deletam roles" ON public.user_roles;
CREATE POLICY "Apenas gestores deletam roles"
  ON public.user_roles
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'::app_role));

-- 2) Points tampering: prevent users from changing their own points via direct UPDATE.
-- We use a trigger to reject changes to `points` unless performed by a gestor or by
-- the SECURITY DEFINER trigger function (which runs as table owner).
CREATE OR REPLACE FUNCTION public.prevent_points_tampering()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.points IS DISTINCT FROM OLD.points THEN
    -- Allow only gestores to manually change points through direct UPDATEs.
    -- The add_points_on_insert trigger runs as SECURITY DEFINER (table owner),
    -- which bypasses this INVOKER trigger's auth.uid() check appropriately
    -- because auth.uid() returns NULL in that context — we must allow that case.
    IF auth.uid() IS NULL THEN
      RETURN NEW; -- system / definer context
    END IF;
    IF NOT public.has_role(auth.uid(), 'gestor'::app_role) THEN
      RAISE EXCEPTION 'Não é permitido alterar a coluna points diretamente.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_prevent_points_tampering ON public.profiles;
CREATE TRIGGER profiles_prevent_points_tampering
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_points_tampering();

-- 3) Lock down EXECUTE on SECURITY DEFINER functions.
-- has_role is used inside RLS policies — RLS evaluation does not require the
-- caller to have EXECUTE on the function, so we can safely revoke it from
-- anon/authenticated/public to satisfy the linter.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.add_points_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_points_tampering() FROM PUBLIC, anon, authenticated;

-- 4) Rotate the seeded gestor password to a random value.
-- The plaintext password 'J147258' was previously committed in a migration.
-- We invalidate it here. The user must set a new password via the backend UI
-- (Cloud → Users) or password reset flow.
DO $$
DECLARE
  v_uid uuid;
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE email = 'bruno_gestor@jassy.local';
  IF v_uid IS NOT NULL THEN
    UPDATE auth.users
    SET encrypted_password = crypt(gen_random_uuid()::text || gen_random_uuid()::text, gen_salt('bf'))
    WHERE id = v_uid;
  END IF;
END $$;
