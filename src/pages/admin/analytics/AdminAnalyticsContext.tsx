import { getAdminAnalyticsCopy } from '@/i18n/adminAnalytics';
import { locale } from '@/i18n/fr';
import { analyticsDay, analyticsInstant, analyticsInteger } from './adminAnalyticsDisplay';
import type { AnalyticsBase, AnalyticsSegment } from './analyticsTypes';

export function analyticsSegmentLabel(segment: AnalyticsSegment): string {
  const copy = getAdminAnalyticsCopy(locale);
  if (segment.engineVersion === null) return copy.unassigned;
  const mode = segment.mode === null ? copy.unavailable : copy[segment.mode];
  const difficulty =
    segment.difficulty === null
      ? copy.unavailable
      : segment.difficulty === 'normal'
        ? copy.standard
        : copy[segment.difficulty];
  return `${segment.engineVersion} · ${mode} · ${difficulty} · ${copy.gameplay} ${analyticsInteger(segment.gameplayVersion)} · ${copy.progression} ${analyticsInteger(segment.progressionVersion)} · ${copy.command} ${analyticsInteger(segment.commandVersion)} · ${segment.contentHash ?? copy.unavailable}`;
}

export function AdminAnalyticsSegmentPicker({
  segments,
  selectedId,
  onChange,
  label,
}: {
  segments: readonly AnalyticsSegment[];
  selectedId: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const selected = segments.find((segment) => segment.id === selectedId);
  return (
    <div>
      <label className="admin-analytics__field">
        {label}
        <select value={selectedId} onChange={(event) => onChange(event.target.value)}>
          {segments.map((segment) => (
            <option key={segment.id} value={segment.id}>
              {analyticsSegmentLabel(segment)}
            </option>
          ))}
        </select>
      </label>
      {selected && <p className="admin-analytics__note">{analyticsSegmentLabel(selected)}</p>}
    </div>
  );
}

export function AdminAnalyticsContext({ data }: { data: AnalyticsBase }) {
  const copy = getAdminAnalyticsCopy(locale);
  return (
    <details className="admin-details">
      <summary>{copy.definitions}</summary>
      <dl className="admin-profile-facts">
        <div>
          <dt>{copy.readAt}</dt>
          <dd>{analyticsInstant(data.snapshotAt)}</dd>
        </div>
        <div>
          <dt>{copy.coverageFrom}</dt>
          <dd>{analyticsInstant(data.coverage.startedAt)}</dd>
        </div>
        <div>
          <dt>{copy.firstCompleteCohort}</dt>
          <dd>{analyticsDay(data.coverage.firstCompleteCohortDate)}</dd>
        </div>
      </dl>
      <p>{copy.retainedPopulation}</p>
      <p>{copy.activityDefinition}</p>
      <p>{copy.coverageHelp}</p>
      <p>{copy.comparability}</p>
      <p>{copy.unsupported}</p>
    </details>
  );
}
