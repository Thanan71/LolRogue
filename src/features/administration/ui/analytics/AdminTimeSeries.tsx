import { useState } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { AdminAnalyticsChart } from './AdminAnalyticsChart';
import {
  AdminAnalyticsContext,
  AdminAnalyticsSegmentPicker,
  analyticsSegmentLabel,
} from './AdminAnalyticsContext';
import { analyticsInteger, analyticsPeriod } from './adminAnalyticsDisplay';
import type { AnalyticsSeries } from '../../domain/analytics/analyticsTypes';
import type { AdminAnalyticsMetric } from '../../hooks/analytics/useAdminAnalytics';

const METRICS = [
  'acquisitions',
  'activePlayers',
  'starts',
  'verifiedFinishes',
  'wins',
  'dailyStarts',
  'dailyVerifiedFinishes',
] as const;
export function AdminTimeSeries({
  data,
  metric,
  onMetricChange,
}: {
  data: AnalyticsSeries;
  metric: AdminAnalyticsMetric;
  onMetricChange: (metric: AdminAnalyticsMetric) => void;
}) {
  const copy = getAdminAnalyticsCopy(locale);
  const [choice, setChoice] = useState('');
  const segment = data.segments.find((item) => item.id === choice) ?? data.segments[0];
  const labels = {
    acquisitions: copy.acquisitions,
    activePlayers: copy.activeAccounts,
    starts: copy.starts,
    verifiedFinishes: copy.verifiedFinishes,
    wins: copy.wins,
    dailyStarts: copy.dailyStarts,
    dailyVerifiedFinishes: copy.dailyVerifiedFinishes,
  };
  const rows =
    metric === 'acquisitions'
      ? data.acquisitions.map((bucket) => ({
          ...bucket,
          value: bucket.accounts,
          activePlayers: null,
        }))
      : data.buckets
          .filter((bucket) => bucket.segmentId === segment?.id)
          .map((bucket) => ({
            ...bucket,
            value: bucket[metric],
            activePlayers: bucket.activePlayers,
          }));
  const coverageLabels = {
    covered: copy.sourceCovered,
    unknown: copy.sourceUnknown,
    mixed: copy.sourceMixed,
  };
  return (
    <>
      <div className="admin-analytics__filters">
        <label className="admin-analytics__field">
          {copy.metric}
          <select
            value={metric}
            onChange={(event) => onMetricChange(event.target.value as AdminAnalyticsMetric)}
          >
            {METRICS.map((value) => (
              <option key={value} value={value}>
                {labels[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {metric === 'acquisitions' ? (
        <p className="admin-analytics__note">
          {copy.globalAcquisitions}. {copy.acquisitionScope}
        </p>
      ) : segment ? (
        <AdminAnalyticsSegmentPicker
          segments={data.segments}
          selectedId={segment.id}
          onChange={setChoice}
          label={`${copy.segment} — ${copy.seriesTitle}`}
        />
      ) : (
        <p>{copy.noSegment}</p>
      )}
      <p className="admin-analytics__note">{copy.eventClocks}</p>
      {rows.some((row) => row.sourceCoverage !== 'covered') && (
        <p className="admin-analytics__note">{copy.seriesCoverageWarning}</p>
      )}
      {rows.some((row) => row.isPartial) && (
        <p className="admin-analytics__note">{copy.seriesPartialWarning}</p>
      )}
      {rows.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <>
          <AdminAnalyticsChart
            label={labels[metric]}
            points={rows.map((row) => ({
              label: `${analyticsPeriod(row.bucketStartAt, row.bucketEndAt)}${row.isPartial ? ` · ${copy.partial}` : ''}`,
              value: row.value,
            }))}
          />
          <details className="admin-details">
            <summary>{copy.table}</summary>
            <div
              className="admin-analytics__scroll"
              role="region"
              aria-label={`${copy.table} — ${labels[metric]}`}
              tabIndex={0}
            >
              <table className="admin-analytics__table">
                <caption>
                  {labels[metric]} ·{' '}
                  {metric === 'acquisitions'
                    ? copy.globalAcquisitions
                    : segment
                      ? analyticsSegmentLabel(segment)
                      : copy.noSegment}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.period}</th>
                    <th scope="col">{labels[metric]}</th>
                    {metric !== 'acquisitions' && <th scope="col">{copy.observedAccounts}</th>}
                    <th scope="col">{copy.coverage}</th>
                    <th scope="col">{copy.partial}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.bucketStartAt}>
                      <th scope="row">{analyticsPeriod(row.bucketStartAt, row.bucketEndAt)}</th>
                      <td>{analyticsInteger(row.value)}</td>
                      {metric !== 'acquisitions' && <td>{analyticsInteger(row.activePlayers)}</td>}
                      <td>{coverageLabels[row.sourceCoverage]}</td>
                      <td>{row.isPartial ? copy.yes : copy.no}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      <AdminAnalyticsContext data={data} />
    </>
  );
}
