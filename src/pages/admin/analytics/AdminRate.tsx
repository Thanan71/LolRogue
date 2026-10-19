import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { analyticsInteger, analyticsPercent } from './adminAnalyticsDisplay';
import type { AdminAnalyticsRate } from './adminAnalyticsStatistics';

export function AdminRate({
  value,
  label,
  numeratorLabel,
  denominatorLabel,
}: {
  value: AdminAnalyticsRate;
  label?: string;
  numeratorLabel?: string;
  denominatorLabel?: string;
}) {
  const copy = getAdminAnalyticsCopy(locale);
  const statuses = {
    ready: copy.ready,
    insufficient: copy.insufficient,
    immature: copy.immature,
    unavailable: copy.rateUnavailable,
    empty: copy.emptyRate,
  };
  return (
    <div className="admin-analytics__rate" role="group" aria-label={label ?? copy.rate}>
      <span>
        {numeratorLabel ?? copy.numerator} / {denominatorLabel ?? copy.denominator} :{' '}
        {analyticsInteger(value.numerator)} / {analyticsInteger(value.denominator)}
      </span>
      <strong>
        {copy.rate} : {value.rate === null ? copy.unavailable : analyticsPercent(value.rate)}
      </strong>
      <span>
        {copy.interval} :{' '}
        {value.interval95 === null
          ? copy.unavailable
          : `${analyticsPercent(value.interval95.lower)} – ${analyticsPercent(value.interval95.upper)}`}
      </span>
      <span className="admin-analytics__rate-status" data-status={value.status}>
        {statuses[value.status]}
      </span>
      {value.status === 'insufficient' && <small>{copy.insufficientHelp}</small>}
    </div>
  );
}
