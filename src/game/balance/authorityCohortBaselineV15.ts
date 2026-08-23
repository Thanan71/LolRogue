import baselineJson from '../../../config/authority-cohort-baselines-v15.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V15_IDENTITY } from './authorityCohortBaselineV15Fixture';

/** Strictly validated, immutable smoke baseline for the archived v15 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V15 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V15_IDENTITY,
);
