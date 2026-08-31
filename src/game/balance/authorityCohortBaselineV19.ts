import baselineJson from '../../../config/authority-cohort-baselines-v19.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V19_IDENTITY } from './authorityCohortBaselineV19Fixture';

/** Strictly validated ten-champion smoke baseline for the archived v19 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V19 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V19_IDENTITY,
);
