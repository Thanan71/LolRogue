import baselineJson from '../../../config/authority-cohort-baselines-v22.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V22_IDENTITY } from './authorityCohortBaselineV22Fixture';

/** Strictly validated 45-cell, 30-seed PR baseline for the approved v22 engine. */
export const AUTHORITY_COHORT_BASELINE_V22 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V22_IDENTITY,
);
