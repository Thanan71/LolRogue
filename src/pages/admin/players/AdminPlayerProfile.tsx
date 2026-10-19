import { useEffect, useRef } from 'react';
import { fr } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminErrorNotice } from '../AdminErrorNotice';
import { AdminSectionFeedback, AdminTableCount } from '../AdminSectionFeedback';
import { formatAdminMetric } from '../adminMetrics';
import { AdminPlayerHistories } from './AdminPlayerHistories';
import { formatAdminPlayerSignedAmount } from './adminPlayerFormat';
import type { AdminPlayersExplorer } from './useAdminPlayersExplorer';

function Facts({ items }: { items: [string, string][] }) {
  return (
    <dl className="admin-profile-facts">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function AdminPlayerProfile({
  explorer,
  onOpenRuns,
}: {
  explorer: AdminPlayersExplorer;
  onOpenRuns: (playerId: string) => void;
}) {
  const copy = fr.admin.playerExplorer;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
  }, []);
  const detail = explorer.detail.data;
  const number = (value: string | null) => formatAdminMetric(value, 'accounts', copy.unknown);
  const date = (value: string | null) => formatAdminMetric(value, 'timestamp', copy.unknown);
  const boolean = (value: boolean | null) =>
    value === null ? copy.unknown : value ? copy.yes : copy.no;
  return (
    <div className="admin-player-detail">
      <div className="admin-explorer-heading">
        <Button variant="secondary" onClick={explorer.closeProfile}>
          {copy.back}
        </Button>
        <Button onClick={explorer.detail.reload} disabled={explorer.detail.loading}>
          {copy.refresh}
        </Button>
      </div>
      <h3 tabIndex={-1} ref={heading}>
        {copy.profileTitle}
        {detail
          ? ` — ${detail.profile.displayName || detail.profile.username || detail.profile.id}`
          : ''}
      </h3>
      <p className="admin-explorer-note">{copy.readOnly}</p>
      <AdminErrorNotice
        message={explorer.detail.error}
        onRetry={explorer.detail.reload}
        retrying={explorer.detail.loading}
      />
      <AdminSectionFeedback state={explorer.detail} />
      {explorer.detail.loading && !explorer.detail.hasData && (
        <p role="status">{copy.profileLoading}</p>
      )}
      {detail && (
        <>
          <p className="admin-explorer-note">{copy.profileSource}</p>
          <p className="admin-explorer-note">{copy.snapshotNote}</p>
          <Facts
            items={[
              [copy.publicId, detail.profile.id],
              [copy.name, detail.profile.displayName || detail.profile.username || copy.unknown],
              [copy.level, number(detail.profile.level)],
              [copy.createdAt, date(detail.profile.createdAt)],
              [copy.lastLoginAt, date(detail.profile.lastLoginAt)],
              [copy.readAt, date(detail.snapshotAt)],
            ]}
          />
          <Button variant="secondary" onClick={() => onOpenRuns(detail.profile.id)}>
            {copy.openRuns}
          </Button>
          <section aria-label={copy.verifiedStats}>
            <h4>{copy.verifiedStats}</h4>
            <Facts
              items={[
                [copy.verifiedRuns, number(detail.verifiedStats.runs)],
                [copy.verifiedWins, number(detail.verifiedStats.wins)],
                [copy.verifiedWaves, number(detail.verifiedStats.waves)],
                [copy.verifiedCandies, number(detail.verifiedStats.candiesEarned)],
                [copy.lastVerifiedRun, date(detail.verifiedStats.lastCompletedAt)],
              ]}
            />
          </section>
          <p className="admin-explorer-note">{copy.separateCurrencies}</p>
          <section aria-label={copy.candies}>
            <h4>{copy.candies}</h4>
            <Facts
              items={[
                [copy.candiesBalance, number(detail.candies.balance)],
                [copy.openingBalance, number(detail.candies.openingBalance)],
                [copy.historyComplete, boolean(detail.candies.historyComplete)],
                [copy.reconciled, boolean(detail.candies.reconciled)],
                [copy.earnedSinceLedger, number(detail.candies.earnedSinceLedger)],
                [copy.spentSinceLedger, number(detail.candies.spentSinceLedger)],
                [copy.refundedSinceLedger, number(detail.candies.refundedSinceLedger)],
                [
                  copy.unattributedSinceLedger,
                  formatAdminPlayerSignedAmount(detail.candies.unattributedSinceLedger),
                ],
                [copy.ledgerStartedAt, date(detail.candies.ledgerStartedAt)],
              ]}
            />
            {detail.candies.historyComplete === false && <p>{copy.historyIncomplete}</p>}
            {detail.candies.reconciled === false && <p role="status">{copy.unreconciled}</p>}
            {(detail.candies.historyComplete === null || detail.candies.reconciled === null) && (
              <p>{copy.ledgerUnknown}</p>
            )}
          </section>
          <section aria-label={copy.shards}>
            <h4>{copy.shards}</h4>
            <Facts
              items={[
                [copy.shardsBalance, number(detail.shards.balance)],
                [copy.ledgerBalance, formatAdminPlayerSignedAmount(detail.shards.ledgerBalance)],
                [copy.reconciled, boolean(detail.shards.reconciled)],
                [copy.lifetimeEarned, number(detail.shards.lifetimeEarned)],
                [copy.lifetimeSpent, number(detail.shards.lifetimeSpent)],
              ]}
            />
            {detail.shards.reconciled === false && <p role="status">{copy.unreconciled}</p>}
            {detail.shards.reconciled === null && <p>{copy.ledgerUnknown}</p>}
          </section>
          <section aria-label={copy.mastery}>
            <h4>{copy.mastery}</h4>
            <p>
              {copy.masterySource} {copy.progressionLimit}
            </p>
            <AdminTableCount displayed={detail.mastery.items.length} total={detail.mastery.total} />
            {detail.mastery.items.length === 0 ? (
              <p>{copy.noMastery}</p>
            ) : (
              <div
                className="players-table-container"
                tabIndex={0}
                role="region"
                aria-label={copy.mastery}
              >
                <table className="players-table">
                  <caption className="sr-only">{copy.mastery}</caption>
                  <thead>
                    <tr>
                      {[
                        copy.champion,
                        copy.masteryLevel,
                        copy.masteryTotal,
                        copy.masteryCurrent,
                        copy.masteryGames,
                        copy.masteryWins,
                      ].map((label) => (
                        <th scope="col" key={label}>
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.mastery.items.map((mastery) => (
                      <tr key={mastery.championId}>
                        <td>{mastery.championId}</td>
                        <td>{number(mastery.masteryLevel)}</td>
                        <td>{number(mastery.totalCandies)}</td>
                        <td>{number(mastery.currentLevelCandies)}</td>
                        <td>{number(mastery.gamesPlayed)}</td>
                        <td>{number(mastery.gamesWon)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section aria-label={copy.enhancements}>
            <h4>{copy.enhancements}</h4>
            <p>{copy.progressionLimit}</p>
            <AdminTableCount
              displayed={detail.enhancements.items.length}
              total={detail.enhancements.total}
            />
            {detail.enhancements.items.length === 0 ? (
              <p>{copy.noEnhancements}</p>
            ) : (
              <div
                className="players-table-container"
                tabIndex={0}
                role="region"
                aria-label={copy.enhancements}
              >
                <table className="players-table">
                  <caption className="sr-only">{copy.enhancements}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.champion}</th>
                      <th scope="col">
                        {copy.enhancement} / {copy.rank}
                      </th>
                      <th scope="col">{copy.candies}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.enhancements.items.map((tree) => (
                      <tr key={tree.championId}>
                        <td>{tree.championId}</td>
                        <td>
                          {Object.entries(tree.unlockedNodes)
                            .map(([node, rank]) => `${node}: ${number(rank)}`)
                            .join(', ') || copy.noEnhancements}
                        </td>
                        <td>{number(tree.totalCandiesSpent)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <AdminPlayerHistories detail={detail} />
        </>
      )}
    </div>
  );
}
