import { useEffect, useRef } from 'react';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { locale } from '@/i18n/fr';
import { AdminPagination } from '../explorer/AdminPagination';
import { adminRunChampion, adminRunDate, adminRunNumber } from './adminRunDisplay';
import type { AdminRunExplorer } from './useAdminRunExplorer';

export function AdminRunDetail({ explorer }: { explorer: AdminRunExplorer }) {
  const copy = getAdminRunExplorerCopy(locale);
  const backButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    backButton.current?.focus();
  }, []);
  const { detail } = explorer;
  const data = detail.data;
  const run = data?.run;
  const attempt = data?.attempt;
  const number = (value: number | string | null) => adminRunNumber(value, copy.unavailable);
  const date = (value: string | null) => adminRunDate(value, copy.unavailable);
  return (
    <div className="admin-run-detail" aria-busy={detail.loading}>
      <button
        ref={backButton}
        type="button"
        className="admin-back-btn"
        onClick={explorer.closeDetail}
      >
        {copy.back}
      </button>
      <h3>{explorer.population === 'runs' ? copy.detailTitle : copy.attemptTitle}</h3>
      {detail.error && (
        <div role="alert">
          <p>{copy.error}</p>
          <button type="button" onClick={() => void detail.reload()} disabled={detail.loading}>
            {copy.retry}
          </button>
        </div>
      )}
      {detail.loading && !data && <p role="status">{copy.loading}</p>}
      {data && (
        <>
          {detail.stale && <p role="status">{copy.stale}</p>}
          <dl className="admin-explorer-facts">
            <dt>{copy.playerColumn}</dt>
            <dd>
              {run?.displayName ??
                attempt?.displayName ??
                run?.username ??
                attempt?.username ??
                copy.unavailable}
            </dd>
            <dt>{copy.verification}</dt>
            <dd>
              {run
                ? run.verificationStatus === 'verified'
                  ? copy.verified
                  : copy.legacy
                : attempt
                  ? copy[attempt.status]
                  : copy.unavailable}
            </dd>
            <dt>{copy.engine}</dt>
            <dd>{run?.engineVersion ?? attempt?.engineVersion ?? copy.unavailable}</dd>
            <dt>{copy.gameplay}</dt>
            <dd>{number(run?.gameplayVersion ?? attempt?.gameplayVersion ?? null)}</dd>
            <dt>{copy.progression}</dt>
            <dd>{number(run?.progressionVersion ?? attempt?.progressionVersion ?? null)}</dd>
            <dt>{copy.ledger}</dt>
            <dd>{number(run?.ledgerVersion ?? null)}</dd>
            <dt>{copy.mode}</dt>
            <dd>{run?.mode ?? attempt?.mode ?? copy.unavailable}</dd>
            <dt>{copy.difficulty}</dt>
            <dd>{run?.difficulty ?? attempt?.difficulty ?? copy.unavailable}</dd>
            {run && (
              <>
                <dt>{copy.waves}</dt>
                <dd>{number(run.wavesCompleted)}</dd>
                <dt>{copy.nodes}</dt>
                <dd>{number(run.nodesCompleted)}</dd>
              </>
            )}
            {attempt?.rejectionCode && (
              <>
                <dt>{copy.rejection}</dt>
                <dd>
                  <code>{attempt.rejectionCode}</code>
                </dd>
              </>
            )}
          </dl>
          <section aria-labelledby="admin-run-rewards">
            <h4 id="admin-run-rewards">{copy.rewards}</h4>
            {run?.verificationStatus === 'verified' ? (
              <p>
                {copy.candies} : {number(run.candiesEarned)}
              </p>
            ) : (
              <p>{run ? copy.historicalRewards : copy.noRewards}</p>
            )}
          </section>
          <section aria-labelledby="admin-run-team">
            <h4 id="admin-run-team">
              {copy.team} · {copy.builds}
            </h4>
            {run ? (
              <ul className="admin-run-builds">
                {run.team.map((member) => (
                  <li key={member.championId}>
                    <strong>{adminRunChampion(member.championId)}</strong> · {copy.level}{' '}
                    {number(member.finalLevel)}
                    <p>
                      {member.itemsCollected.length
                        ? member.itemsCollected.join(' · ')
                        : copy.noBuilds}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{attempt?.initialTeam.map(adminRunChampion).join(' · ') || copy.unavailable}</p>
            )}
            {run && (
              <>
                <p>
                  {copy.runes} : {run.runeIds.join(' · ') || copy.unavailable}
                </p>
                <p>
                  {copy.augments} : {run.augmentIds.join(' · ') || copy.unavailable}
                </p>
              </>
            )}
          </section>
          <section aria-labelledby="admin-run-timeline">
            <h4 id="admin-run-timeline">{copy.timeline}</h4>
            <ol className="admin-run-timeline">
              {data.timeline.map((event) => (
                <li key={`${event.kind}-${event.at}`}>
                  <strong>{event.kind === 'completed' ? copy.last : copy[event.kind]}</strong> ·{' '}
                  <time dateTime={event.at}>{date(event.at)} UTC</time>
                  {event.code && (
                    <>
                      {' '}
                      · <code>{event.code}</code>
                    </>
                  )}
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="admin-run-actions">
            <h4 id="admin-run-actions">{copy.actions}</h4>
            {data.items.length === 0 ? (
              <p>{copy.noActions}</p>
            ) : (
              <div
                className="runs-table-container"
                role="region"
                aria-label={copy.actions}
                tabIndex={0}
              >
                <table className="runs-table">
                  <caption className="sr-only">{copy.actions}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.sequence}</th>
                      <th scope="col">{copy.type}</th>
                      <th scope="col">{copy.date}</th>
                      <th scope="col">
                        {copy.team} / {copy.builds}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((action) => (
                      <tr key={action.sequence}>
                        <td>{number(action.sequence)}</td>
                        <td>
                          <code>{action.kind}</code>
                          {action.combatMode && <> · {action.combatMode}</>}
                        </td>
                        <td>{date(action.receivedAt)} UTC</td>
                        <td>
                          {[
                            action.championId,
                            action.nodeId,
                            action.itemId,
                            action.augmentId,
                            action.slot,
                          ]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <AdminPagination
              pageIndex={explorer.actionPageIndex}
              pageSize={50}
              displayed={data.items.length}
              total={data.total}
              hasMore={data.hasMore}
              busy={detail.loading}
              onNext={explorer.nextActions}
              onPrevious={explorer.previousActions}
            />
          </section>
        </>
      )}
    </div>
  );
}
