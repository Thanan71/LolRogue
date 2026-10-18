import type { ReactNode } from 'react';
import { useState } from 'react';
import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminDate, formatAdminNumber } from '../../adminPageUtils';
import type { AnalyticsSegment } from '../analytics/analyticsTypes';
import type { BalanceContext, BalanceReportBase } from './balanceTypes';

export interface BalanceSelection {
  value: string;
  onChange: (value: string) => void;
}

export function AdminBalanceContext({
  report,
  id,
  children,
  selection,
}: {
  report: BalanceReportBase;
  id: string;
  selection?: BalanceSelection;
  children: (context: BalanceContext) => ReactNode;
}) {
  const copy = getAdminBalanceCopy(locale);
  const [selectedId, setSelectedId] = useState('');
  const selected =
    report.contexts.find((context) => context.id === (selection?.value ?? selectedId)) ??
    report.contexts[0];
  const segment = report.segments.find((entry) => entry.id === selected?.segmentId);
  return (
    <>
      <p className="admin-balance__metadata">
        {copy.readAt}: {formatAdminDate(report.snapshotAt)} · {copy.runs}:{' '}
        {formatAdminNumber(report.population.verifiedRuns)} · {copy.players}:{' '}
        {formatAdminNumber(report.population.uniquePlayers)}
      </p>
      {selected && segment && (
        <>
          <label className="admin-balance__field" htmlFor={`${id}-context`}>
            {copy.context}
          </label>
          <select
            id={`${id}-context`}
            className="admin-balance__context"
            value={selected.id}
            onChange={(event) =>
              selection ? selection.onChange(event.target.value) : setSelectedId(event.target.value)
            }
          >
            {report.contexts.map((context) => {
              const identity = report.segments.find((entry) => entry.id === context.segmentId);
              return (
                <option key={context.id} value={context.id}>
                  {[
                    context.initialComposition.join(' + ') || copy.emptyBuild,
                    identity?.engineVersion,
                    identity?.mode,
                    identity?.difficulty,
                    context.id,
                  ].join(' · ')}
                </option>
              );
            })}
          </select>
          <details className="admin-details" open>
            <summary>{copy.contextDetails}</summary>
            <dl className="admin-profile-facts admin-balance__facts">
              <AdminBalanceIdentity segment={segment} />
              <div>
                <dt>{copy.composition}</dt>
                <dd>{selected.initialComposition.join(' + ') || copy.emptyBuild}</dd>
              </div>
              <div>
                <dt>{copy.runes}</dt>
                <dd>{selected.runeIds.join(', ') || copy.emptyBuild}</dd>
              </div>
              <div>
                <dt>{copy.mastery}</dt>
                <dd>
                  <code>{selected.masteryHash}</code>
                </dd>
              </div>
              <div>
                <dt>{copy.enhancements}</dt>
                <dd>
                  <code>{selected.enhancementHash}</code>
                </dd>
              </div>
            </dl>
          </details>
          {children(selected)}
        </>
      )}
    </>
  );
}

export function AdminBalanceIdentity({ segment }: { segment: AnalyticsSegment }) {
  const copy = getAdminBalanceCopy(locale);
  return (
    <>
      <div>
        <dt>{copy.engine}</dt>
        <dd>
          <code>{segment.engineVersion}</code>
        </dd>
      </div>
      <div>
        <dt>{copy.gameplay}</dt>
        <dd>{segment.gameplayVersion}</dd>
      </div>
      <div>
        <dt>{copy.progression}</dt>
        <dd>{segment.progressionVersion}</dd>
      </div>
      <div>
        <dt>{copy.command}</dt>
        <dd>{segment.commandVersion}</dd>
      </div>
      <div>
        <dt>{copy.contentHash}</dt>
        <dd>
          <code>{segment.contentHash}</code>
        </dd>
      </div>
      <div>
        <dt>{copy.mode}</dt>
        <dd>{segment.mode ? copy[segment.mode] : copy.unavailable}</dd>
      </div>
      <div>
        <dt>{copy.difficulty}</dt>
        <dd>
          {segment.difficulty === 'normal'
            ? copy.standard
            : segment.difficulty
              ? copy[segment.difficulty]
              : copy.unavailable}
        </dd>
      </div>
    </>
  );
}
