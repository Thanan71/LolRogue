import baselineJson from '../../../config/authority-cohort-baselines-v18.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V18_IDENTITY } from './authorityCohortBaselineV18Fixture';

/** Strictly validated, committed smoke baseline for the current v18 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V18 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V18_IDENTITY,
);
