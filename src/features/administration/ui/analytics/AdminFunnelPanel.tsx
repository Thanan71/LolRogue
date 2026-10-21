import { useState } from 'react';
import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { AdminAnalyticsContext, AdminAnalyticsSegmentPicker } from './AdminAnalyticsContext';
import { AdminRate } from './AdminRate';
import { analyticsInteger } from './adminAnalyticsDisplay';
import { describeAdminAnalyticsRate } from '../../domain/analytics/adminAnalyticsStatistics';
import type { AnalyticsFunnel } from '../../domain/analytics/analyticsTypes';

const STEPS = ['signups', 'starts', 'combatRequests', 'verifiedFinishes', 'returnedSame'] as const;

export function AdminFunnelPanel({ data }: { data: AnalyticsFunnel }) {
  const copy = getAdminAnalyticsCopy(locale);
  const [choice, setChoice] = useState('');
  const segment = data.segments.find((item) => item.id === choice) ?? data.segments[0];
  const row = data.rows.find((item) => item.segmentId === segment?.id);
  const labels = {
    signups: copy.registration,
    starts: copy.firstStart,
    combatRequests: copy.firstCombat,
    verifiedFinishes: copy.completion,
    returnedSame: copy.return,
  };
  return (
    <>
      <p>{copy.funnelWindow}</p>
      <p>{copy.funnelRates}</p>
      <p className="admin-analytics__note">{copy.combatHelp}</p>
      <p className="admin-analytics__note">{copy.returnHelp}</p>
      {segment && (
        <AdminAnalyticsSegmentPicker
          segments={data.segments}
          selectedId={segment.id}
          onChange={setChoice}
          label={`${copy.segment} — ${copy.funnelTitle}`}
        />
      )}
      {!row ? (
        <p>{copy.empty}</p>
      ) : (
        <>
          <p>
            {copy.excludedCoverage} : {analyticsInteger(row.excludedUnknownCoverageN)} ·{' '}
            {copy.excludedImmature} : {analyticsInteger(row.excludedImmatureN)}
          </p>
          <ol className="admin-analytics__funnel">
            {STEPS.map((step, index) => (
              <li key={step}>
                <div className="admin-analytics__funnel-step">
                  <h4>{labels[step]}</h4>
                  <p>
                    {copy.observed} : {analyticsInteger(row.observed[step])} · {copy.eligible} :{' '}
                    {analyticsInteger(row.eligible[step])}
                  </p>
                  <progress
                    className="admin-analytics__funnel-bar"
                    value={row.observed[step]}
                    max={row.observed.signups || 1}
                    aria-hidden="true"
                  />
                  {index > 0 && (
                    <AdminRate
                      label={`${copy.fromPrevious} — ${labels[step]}`}
                      value={describeAdminAnalyticsRate(
                        row.eligible[step],
                        row.eligible[STEPS[index - 1]],
                      )}
                    />
                  )}
                </div>
              </li>
            ))}
          </ol>
          <p>
            {copy.returnedAny} : {analyticsInteger(row.observed.returnedAny)} · {copy.eligible} :{' '}
            {analyticsInteger(row.eligible.returnedAny)}
          </p>
        </>
      )}
      <AdminAnalyticsContext data={data} />
    </>
  );
}
