import baselineJson from '../../../config/authority-cohort-baselines-v16.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V16_IDENTITY } from './authorityCohortBaselineV16Fixture';

/** Strictly validated, committed smoke baseline for the current v16 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V16 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V16_IDENTITY,
);
