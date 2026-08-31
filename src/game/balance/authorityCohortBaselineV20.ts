import baselineJson from '../../../config/authority-cohort-baselines-v20.json';
import { loadAuthorityCohortBaseline } from './authorityCohortBaseline';
import { AUTHORITY_COHORT_BASELINE_V20_IDENTITY } from './authorityCohortBaselineV20Fixture';

/** Strictly validated ten-champion smoke baseline for the current v20 authority engine. */
export const AUTHORITY_COHORT_BASELINE_V20 = loadAuthorityCohortBaseline(
  baselineJson,
  AUTHORITY_COHORT_BASELINE_V20_IDENTITY,
);
