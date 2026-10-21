import { useState } from 'react';
import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { formatAdminNumber } from '../../domain/adminFormatting';
import { AdminBalanceIdentity, type BalanceSelection } from './AdminBalanceContext';
import { AdminBalanceRate } from './AdminBalanceRate';
import type { BalanceChampionReport } from '../../domain/balance/balanceTypes';

export function AdminBalancePicks({
  report,
  selection,
}: {
  report: BalanceChampionReport;
  selection?: BalanceSelection;
}) {
  const copy = getAdminBalanceCopy(locale);
  const [selectedId, setSelectedId] = useState('');
  const selections = report.selections;
  const segment =
    selections.segments.find((entry) => entry.id === (selection?.value ?? selectedId)) ??
    selections.segments[0];
  return (
    <section id="admin-balance-picks" aria-labelledby="admin-balance-picks-heading">
      <h4 id="admin-balance-picks-heading">{copy.picks}</h4>
      <p className="admin-balance__note">{copy.pickHelp}</p>
      <p className="admin-balance__metadata">
        {copy.starts}: {formatAdminNumber(selections.population.starts)} · {copy.players}:{' '}
        {formatAdminNumber(selections.population.uniquePlayers)}
      </p>
      {segment ? (
        <>
          <label className="admin-balance__field" htmlFor="admin-balance-pick-version">
            {copy.pickIdentity}
          </label>
          <select
            className="admin-balance__context"
            id="admin-balance-pick-version"
            value={segment.id}
            onChange={(event) =>
              selection ? selection.onChange(event.target.value) : setSelectedId(event.target.value)
            }
          >
            {selections.segments.map((identity) => (
              <option key={identity.id} value={identity.id}>
                {[
                  identity.engineVersion,
                  identity.mode ? copy[identity.mode] : copy.unavailable,
                  identity.difficulty === 'normal'
                    ? copy.standard
                    : identity.difficulty
                      ? copy[identity.difficulty]
                      : copy.unavailable,
                  identity.id,
                ].join(' · ')}
              </option>
            ))}
          </select>
          <details className="admin-details">
            <summary>{copy.advanced}</summary>
            <dl className="admin-profile-facts admin-balance__facts">
              <AdminBalanceIdentity segment={segment} />
            </dl>
          </details>
          <div className="admin-balance__scroll" role="region" aria-label={copy.picks} tabIndex={0}>
            <table className="admin-balance__table">
              <caption>{copy.picks}</caption>
              <thead>
                <tr>
                  <th scope="col">{copy.champion}</th>
                  <th scope="col">{copy.picks}</th>
                  <th scope="col">{copy.players}</th>
                </tr>
              </thead>
              <tbody>
                {selections.rows
                  .filter((row) => row.segmentId === segment.id)
                  .map((row) => (
                    <tr key={row.championId}>
                      <th scope="row">
                        <code>{row.championId}</code>
                        {row.catalogStatus === 'unknown' && <small>{copy.unknown}</small>}
                      </th>
                      <td>
                        <AdminBalanceRate
                          wins={row.starts}
                          runs={row.cohortStarts}
                          players={row.cohortPlayers}
                        />
                      </td>
                      <td>
                        {formatAdminNumber(row.players)} / {formatAdminNumber(row.cohortPlayers)}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p>{copy.empty}</p>
      )}
    </section>
  );
}
