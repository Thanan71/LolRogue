-- Daily scores are shared competition data. Writes remain protected by the
-- separate owner-only policy.

DROP POLICY IF EXISTS "Daily runs read" ON public.daily_runs;

CREATE POLICY "Daily runs read"
  ON public.daily_runs FOR SELECT TO authenticated
  USING (true);
