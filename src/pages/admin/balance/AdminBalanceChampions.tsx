import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminNumber, formatAdminPercent } from '../../adminPageUtils';
import { AdminBalanceContext, type BalanceSelection } from './AdminBalanceContext';
import { AdminBalancePicks } from './AdminBalancePicks';
import { AdminBalanceRate } from './AdminBalanceRate';
import type { BalanceChampionReport } from './balanceTypes';

export function AdminBalanceChampions({
  report,
  contextSelection,
  pickSelection,
}: {
  report: BalanceChampionReport;
  contextSelection?: BalanceSelection;
  pickSelection?: BalanceSelection;
}) {
  const copy = getAdminBalanceCopy(locale);
  const mean = (value: number | null) =>
    value === null ? copy.unavailable : formatAdminNumber(value, { maximumFractionDigits: 1 });
  return (
    <>
      <AdminBalancePicks report={report} selection={pickSelection} />
      <h4>{copy.finalPerformance}</h4>
      <p className="admin-balance__note">{copy.noRanking}</p>
      {!report.contexts.length && <p>{copy.empty}</p>}
      <p className="admin-balance__note">{copy.unsupported}</p>
      <AdminBalanceContext
        report={report}
        id="admin-balance-champions"
        selection={contextSelection}
      >
        {(context) => (
          <div
            id="admin-balance-final-champions"
            className="admin-balance__scroll"
            role="region"
            aria-label={copy.champions}
            tabIndex={0}
          >
            <table className="admin-balance__table">
              <caption>{copy.champions}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.champion}</th>
                  <th scope="col">{copy.presence}</th>
                  <th scope="col">{copy.outcome}</th>
                  <th scope="col">{copy.survivability}</th>
                  <th scope="col">{copy.damage}</th>
                  <th scope="col">{copy.healing}</th>
                  <th scope="col">{copy.ledgerRuns}</th>
                </tr>
              </thead>
              <tbody>
                {report.rows
                  .filter((row) => row.contextId === context.id)
                  .map((row) => (
                    <tr key={row.championId}>
                      <th scope="row">
                        <code>{row.championId}</code>
                        {row.catalogStatus === 'unknown' && <small>{copy.unknown}</small>}
                      </th>
                      <td>
                        <strong>
                          {row.cohortRuns
                            ? formatAdminPercent(row.runs / row.cohortRuns)
                            : copy.unavailable}
                        </strong>
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
                      <td>
                        {row.runs ? formatAdminPercent(row.survived / row.runs) : copy.unavailable}
                        <small>
                          {formatAdminNumber(row.survived)} / {formatAdminNumber(row.runs)}
                        </small>
                      </td>
                      <td>{mean(row.meanDamageDealt)}</td>
                      <td>{mean(row.meanHealingDone)}</td>
                      <td>
                        {formatAdminNumber(row.ledgerRuns)} / {formatAdminNumber(row.runs)}
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
