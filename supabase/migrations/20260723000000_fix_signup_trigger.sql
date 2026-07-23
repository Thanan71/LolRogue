-- Upgrade for databases that already ran the initial schema before the
-- signup collision fix. This migration preserves all existing users and data.

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_username TEXT;
  fallback_username TEXT;
  requested_display_name TEXT;
BEGIN
  requested_username := LEFT(
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'username'), ''),
      'Player_' || SUBSTRING(NEW.id::TEXT, 1, 8)
    ),
    50
  );
  fallback_username :=
    LEFT(requested_username, 41) || '_' || SUBSTRING(NEW.id::TEXT, 1, 8);
  requested_display_name := LEFT(
    COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data ->> 'display_name'), ''),
      requested_username,
      'Player'
    ),
    100
  );

  BEGIN
    INSERT INTO public.players (user_id, username, display_name)
    VALUES (NEW.id, requested_username, requested_display_name)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO public.players (user_id, username, display_name)
      VALUES (NEW.id, fallback_username, requested_display_name)
      ON CONFLICT (user_id) DO NOTHING;
  END;

  RETURN NEW;
END;
$$;

-- Recreating the trigger makes the upgrade safe even if the previous setup
-- left it behind on auth.users.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMIT;
