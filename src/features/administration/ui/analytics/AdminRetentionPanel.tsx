import { useState } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { AdminAnalyticsContext, AdminAnalyticsSegmentPicker } from './AdminAnalyticsContext';
import { AdminRate } from './AdminRate';
import { analyticsDay, analyticsInteger } from './adminAnalyticsDisplay';
import { describeAdminAnalyticsRate } from '../../domain/analytics/adminAnalyticsStatistics';
import type { AnalyticsRetention } from '../../domain/analytics/analyticsTypes';

export function AdminRetentionPanel({ data }: { data: AnalyticsRetention }) {
  const copy = getAdminAnalyticsCopy(locale);
  const [choice, setChoice] = useState('');
  const segment = data.segments.find((item) => item.id === choice) ?? data.segments[0];
  const cohorts = data.cohorts.filter((cohort) => cohort.segmentId === segment?.id);
  const horizonLabels = { 1: copy.d1, 7: copy.d7, 30: copy.d30 };
  return (
    <>
      <p>{copy.retentionComparison}</p>
      <p className="admin-analytics__note">{copy.coverageHelp}</p>
      <p className="admin-analytics__note">{copy.intervalHelp}</p>
      {segment && (
        <AdminAnalyticsSegmentPicker
          segments={data.segments}
          selectedId={segment.id}
          onChange={setChoice}
          label={`${copy.segment} — ${copy.retentionTitle}`}
        />
      )}
      {cohorts.length === 0 ? (
        <p>{copy.empty}</p>
      ) : (
        <div
          className="admin-analytics__scroll"
          role="region"
          aria-label={copy.retentionTitle}
          tabIndex={0}
        >
          <table className="admin-analytics__table">
            <caption>{copy.retentionTitle}</caption>
            <thead>
              <tr>
                <th scope="col">{copy.cohort}</th>
                <th scope="col">{copy.cohortSize}</th>
                {[copy.d1, copy.d7, copy.d30].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.map((cohort) => (
                <tr key={cohort.cohortDate}>
                  <th scope="row">
                    {analyticsDay(cohort.cohortDate)}
                    <p>{cohort.covered ? copy.sourceCovered : copy.sourceUnknown}</p>
                  </th>
                  <td>{analyticsInteger(cohort.cohortSize)}</td>
                  {cohort.horizons.map((horizon) => (
                    <td key={horizon.day}>
                      <p>
                        {copy.observationWindow} :{' '}
                        {analyticsDay(
                          new Date(
                            Date.parse(`${cohort.cohortDate}T00:00:00Z`) + horizon.day * 86_400_000,
                          ).toISOString(),
                        )}
                      </p>
                      <AdminRate
                        label={`${copy.returnedSame} — ${horizonLabels[horizon.day]}`}
                        value={describeAdminAnalyticsRate(horizon.returnedSame, cohort.cohortSize, {
                          mature: horizon.mature,
                          coverageComplete: cohort.covered,
                        })}
                        numeratorLabel={copy.returnedSame}
                        denominatorLabel={copy.cohortSize}
                      />
                      <p>
                        {copy.eligibleN} : {analyticsInteger(horizon.eligibleN)}
                      </p>
                      <p>
                        {copy.returnedAny} : {analyticsInteger(horizon.returnedAny)}
                      </p>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AdminAnalyticsContext data={data} />
    </>
  );
}
