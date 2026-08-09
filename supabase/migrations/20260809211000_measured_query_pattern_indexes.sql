-- P2-DB-01: partial indexes for the two measured report workflows. Keeping the
-- constant status predicate outside the index key produces smaller indexes than
-- a composite (status, timestamp) index while matching the application queries.

CREATE INDEX daily_score_reports_open_created_idx
  ON public.daily_score_reports (created_at)
  WHERE status = 'open';

CREATE INDEX daily_score_reports_reviewed_retention_idx
  ON public.daily_score_reports (reviewed_at)
  WHERE status IN ('dismissed', 'actioned');
