import baselineJson from '../../../config/authority-cohort-baselines-v21.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V21_IDENTITY } from './authorityCohortBaselineV21Fixture';

/** Strictly validated 45-cell, 30-seed PR baseline for the current v21 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V21 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V21_IDENTITY,
);
