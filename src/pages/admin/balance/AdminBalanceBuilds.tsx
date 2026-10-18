import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminNumber, formatAdminPercent } from '../../adminPageUtils';
import { AdminBalanceContext, type BalanceSelection } from './AdminBalanceContext';
import { AdminBalanceRate } from './AdminBalanceRate';
import type { BalanceBuildReport } from './balanceTypes';

export function AdminBalanceBuilds({
  report,
  selection,
}: {
  report: BalanceBuildReport;
  selection?: BalanceSelection;
}) {
  const copy = getAdminBalanceCopy(locale);
  return (
    <>
      <p className="admin-balance__note">{copy.itemCatalog}</p>
      <p className="admin-balance__note">{copy.noRanking}</p>
      <AdminBalanceContext report={report} id="admin-balance-builds" selection={selection}>
        {(context) => (
          <div
            className="admin-balance__scroll"
            role="region"
            aria-label={copy.builds}
            tabIndex={0}
          >
            <table className="admin-balance__table">
              <caption>{copy.builds}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.context}</th>
                  <th scope="col">{copy.frequency}</th>
                  <th scope="col">{copy.outcome}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows
                  .filter((row) => row.contextId === context.id)
                  .map((row) => (
                    <tr key={JSON.stringify([row.kind, row.championId, row.ids, row.state])}>
                      <th scope="row">
                        {copy[row.kind]}
                        {row.championId && (
                          <small>
                            <code>{row.championId}</code>
                          </small>
                        )}
                        <small>
                          {row.state === 'partial'
                            ? copy.partial
                            : row.state === 'empty'
                              ? copy.emptyBuild
                              : copy.observed}
                        </small>
                        {row.ids.length > 0 && <code>{row.ids.join(', ')}</code>}
                        {row.unknownIds.length > 0 && (
                          <small>
                            {copy.unknown}: <code>{row.unknownIds.join(', ')}</code>
                          </small>
                        )}
                      </th>
                      <td>
                        {row.cohortRuns
                          ? formatAdminPercent(row.runs / row.cohortRuns)
                          : copy.unavailable}
                        <small>
                          {formatAdminNumber(row.runs)} / {formatAdminNumber(row.cohortRuns)}{' '}
                          {copy.runs}
                        </small>
                        <small>
                          {formatAdminNumber(row.players)} / {formatAdminNumber(row.cohortPlayers)}{' '}
                          {copy.players}
                        </small>
                      </td>
                      <td>
                        <AdminBalanceRate wins={row.wins} runs={row.runs} players={row.players} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminBalanceContext>
    </>
  );
}
