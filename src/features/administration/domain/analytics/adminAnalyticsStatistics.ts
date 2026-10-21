/** A presentation threshold, not a causal claim or a guarantee of adequate precision. */
export const ADMIN_ANALYTICS_MIN_SAMPLE_SIZE = 30;

export type AdminAnalyticsRateStatus =
  | 'ready'
  | 'insufficient'
  | 'immature'
  | 'unavailable'
  | 'empty';

export interface AdminAnalyticsRate {
  numerator: number | null;
  denominator: number | null;
  rate: number | null;
  interval95: { lower: number; upper: number } | null;
  status: AdminAnalyticsRateStatus;
}

function validateCount(value: number | null): void {
  if (value !== null && (!Number.isSafeInteger(value) || value < 0)) {
    throw new RangeError('Analytics counts must be nonnegative safe integers or unknown.');
  }
}

/**
 * Wilson score interval under a binomial model; never inferred from loaded UI rows.
 * https://www.itl.nist.gov/div898/handbook/prc/section2/prc241.htm
 * Repeated runs from the same player do not become independent player observations.
 */
export function describeAdminAnalyticsRate(
  numerator: number | null,
  denominator: number | null,
  { mature = true, coverageComplete = true }: { mature?: boolean; coverageComplete?: boolean } = {},
): AdminAnalyticsRate {
  validateCount(numerator);
  validateCount(denominator);
  if (numerator !== null && denominator !== null && numerator > denominator) {
    throw new RangeError('Analytics numerator cannot exceed its denominator.');
  }
  const unavailable = { numerator, denominator, rate: null, interval95: null };
  if (!coverageComplete || numerator === null || denominator === null)
    return { ...unavailable, status: 'unavailable' };
  if (!mature) return { ...unavailable, status: 'immature' };
  if (denominator === 0) return { ...unavailable, status: 'empty' };
  const rate = numerator / denominator;
  const z = 1.959963984540054;
  const zSquared = z ** 2;
  const divisor = 1 + zSquared / denominator;
  const center = (rate + zSquared / (2 * denominator)) / divisor;
  const margin =
    (z * Math.sqrt((rate * (1 - rate)) / denominator + zSquared / (4 * denominator ** 2))) /
    divisor;
  return {
    numerator,
    denominator,
    rate,
    interval95: {
      lower: numerator === 0 ? 0 : Math.max(0, center - margin),
      upper: numerator === denominator ? 1 : Math.min(1, center + margin),
    },
    status: denominator < ADMIN_ANALYTICS_MIN_SAMPLE_SIZE ? 'insufficient' : 'ready',
  };
}
