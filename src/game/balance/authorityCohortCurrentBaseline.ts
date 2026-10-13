import baselineJson from '../../../config/authority-cohort-baselines-0.2.5.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY } from './authorityCohortCurrentBaselineFixture';

/** Strictly validated 45-cell, 30-seed PR baseline for the approved current engine. */
export const AUTHORITY_COHORT_CURRENT_BASELINE = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_CURRENT_BASELINE_IDENTITY,
);
