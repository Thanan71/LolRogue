import baselineJson from '../../../config/authority-cohort-baselines-v17.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V17_IDENTITY } from './authorityCohortBaselineV17Fixture';

/** Strictly validated, immutable smoke baseline for the archived v17 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V17 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V17_IDENTITY,
);
