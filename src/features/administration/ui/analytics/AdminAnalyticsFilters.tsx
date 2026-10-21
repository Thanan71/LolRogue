import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import type { AdminAnalyticsDraft } from '../../domain/analytics/adminAnalyticsFilterDraft';
import type { AdminAnalytics } from '../../hooks/analytics/useAdminAnalytics';

export function AdminAnalyticsFilters({ analytics }: { analytics: AdminAnalytics }) {
  const copy = getAdminAnalyticsCopy(locale);
  const input = (field: keyof AdminAnalyticsDraft, label: string, type = 'text') => (
    <label className="admin-analytics__field" key={field}>
      {label}
      <input
        disabled={!analytics.enabled}
        type={type}
        value={analytics.draft[field]}
        onChange={(event) =>
          analytics.changeDraft(field, event.target.value as AdminAnalyticsDraft[typeof field])
        }
        aria-describedby={analytics.filterError ? 'admin-analytics-filter-error' : undefined}
        aria-invalid={analytics.filterError ? true : undefined}
      />
    </label>
  );
  const select = <K extends keyof AdminAnalyticsDraft>(
    field: K,
    label: string,
    options: readonly (readonly [AdminAnalyticsDraft[K], string])[],
  ) => (
    <label className="admin-analytics__field">
      {label}
      <select
        disabled={!analytics.enabled}
        value={analytics.draft[field]}
        onChange={(event) =>
          analytics.changeDraft(field, event.target.value as AdminAnalyticsDraft[K])
        }
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        analytics.apply();
      }}
      aria-label={copy.filters}
    >
      <h3>{copy.filters}</h3>
      <div className="admin-analytics__filters">
        {input('from', copy.from, 'date')}
        {input('to', copy.to, 'date')}
        {select('granularity', copy.granularity, [
          ['day', copy.day],
          ['week', copy.week],
        ])}
        {select('mode', copy.mode, [
          ['all', copy.all],
          ['normal', copy.normal],
          ['daily', copy.daily],
        ])}
        {select('difficulty', copy.difficulty, [
          ['all', copy.all],
          ['easy', copy.easy],
          ['normal', copy.standard],
          ['hard', copy.hard],
        ])}
        {select('accountAge', copy.playerAge, [
          ['all', copy.all],
          ['new', copy.newPlayers],
          ['existing', copy.returningPlayers],
        ])}
        {input('engineVersion', copy.engine)}
      </div>
      <details className="admin-details">
        <summary>{copy.advanced}</summary>
        <div className="admin-analytics__filters">
          {input('gameplayVersion', copy.gameplay, 'number')}
          {input('progressionVersion', copy.progression, 'number')}
          {input('commandVersion', copy.command, 'number')}
          {input('contentHash', copy.contentHash)}
        </div>
      </details>
      <p className="admin-analytics__note">{copy.weekHelp}</p>
      <p className="admin-analytics__note">{copy.newPlayersHelp}</p>
      <p className="admin-analytics__note">{copy.filterLimits}</p>
      {analytics.filterError && (
        <p id="admin-analytics-filter-error" role="alert">
          {analytics.filterError}
        </p>
      )}
      {analytics.dirty && <p role="status">{copy.unapplied}</p>}
      <div className="admin-analytics__actions">
        <Button type="submit" disabled={!analytics.enabled}>
          {copy.apply}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={analytics.reset}
          disabled={!analytics.enabled}
        >
          {copy.reset}
        </Button>
      </div>
    </form>
  );
}
