import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminAnalyticsFilters } from './AdminAnalyticsFilters';
import { AdminAnalyticsSection } from './AdminAnalyticsSection';
import { AdminFunnelPanel } from './AdminFunnelPanel';
import { AdminRetentionPanel } from './AdminRetentionPanel';
import { AdminTimeSeries } from './AdminTimeSeries';
import { analyticsDay } from './adminAnalyticsDisplay';
import type { AdminAnalytics } from '../../hooks/analytics/useAdminAnalytics';

export function AdminAnalyticsPanel({ analytics }: { analytics: AdminAnalytics }) {
  const copy = getAdminAnalyticsCopy(locale);
  const applied = analytics.appliedDraft;
  return (
    <section
      role="tabpanel"
      id="admin-panel-analytics"
      aria-labelledby="admin-tab-analytics"
      className="admin-analytics"
    >
      <div className="admin-analytics__heading">
        <h2>{copy.title}</h2>
        <Button
          onClick={analytics.refresh}
          disabled={
            !analytics.enabled ||
            analytics.series.loading ||
            analytics.retention.loading ||
            analytics.funnel.loading
          }
        >
          {copy.refresh}
        </Button>
      </div>
      <p>{copy.intro}</p>
      {analytics.permissionDenied && <p role="alert">{copy.permissionDenied}</p>}
      <AdminAnalyticsFilters analytics={analytics} />
      <details className="admin-details">
        <summary>{copy.applied}</summary>
        <dl className="admin-profile-facts">
          <div>
            <dt>{copy.period}</dt>
            <dd>
              {analyticsDay(applied.from)} – {analyticsDay(applied.to)} · {copy.utc}
            </dd>
          </div>
          <div>
            <dt>{copy.granularity}</dt>
            <dd>{copy[applied.granularity]}</dd>
          </div>
          <div>
            <dt>{copy.mode}</dt>
            <dd>{copy[applied.mode]}</dd>
          </div>
          <div>
            <dt>{copy.difficulty}</dt>
            <dd>{applied.difficulty === 'normal' ? copy.standard : copy[applied.difficulty]}</dd>
          </div>
          <div>
            <dt>{copy.playerAge}</dt>
            <dd>
              {applied.accountAge === 'all'
                ? copy.all
                : applied.accountAge === 'new'
                  ? copy.newPlayers
                  : copy.returningPlayers}
            </dd>
          </div>
          {(
            [
              'engineVersion',
              'gameplayVersion',
              'progressionVersion',
              'commandVersion',
              'contentHash',
            ] as const
          ).map((key) => (
            <div key={key}>
              <dt>
                {
                  {
                    engineVersion: copy.engine,
                    gameplayVersion: copy.gameplay,
                    progressionVersion: copy.progression,
                    commandVersion: copy.command,
                    contentHash: copy.contentHash,
                  }[key]
                }
              </dt>
              <dd>{applied[key] || copy.all}</dd>
            </div>
          ))}
        </dl>
      </details>
      <AdminAnalyticsSection
        id="admin-analytics-series"
        title={copy.seriesTitle}
        description={copy.seriesHelp}
        state={analytics.series}
        onRetry={analytics.series.reload}
        disabled={analytics.permissionDenied}
      >
        {analytics.series.data && (
          <AdminTimeSeries
            data={analytics.series.data}
            metric={analytics.metric}
            onMetricChange={analytics.selectMetric}
          />
        )}
      </AdminAnalyticsSection>
      <AdminAnalyticsSection
        id="admin-analytics-retention"
        title={copy.retentionTitle}
        description={copy.retentionHelp}
        state={analytics.retention}
        onRetry={analytics.retention.reload}
        disabled={analytics.permissionDenied}
      >
        {analytics.retention.data && <AdminRetentionPanel data={analytics.retention.data} />}
      </AdminAnalyticsSection>
      <AdminAnalyticsSection
        id="admin-analytics-funnel"
        title={copy.funnelTitle}
        description={copy.funnelHelp}
        state={analytics.funnel}
        onRetry={analytics.funnel.reload}
        disabled={analytics.permissionDenied}
      >
        {analytics.funnel.data && <AdminFunnelPanel data={analytics.funnel.data} />}
      </AdminAnalyticsSection>
    </section>
  );
}
