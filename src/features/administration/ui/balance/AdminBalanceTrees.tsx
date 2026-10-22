import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { getAdminEnhancementTreesCopy } from '@/i18n/adminEnhancementTrees';
import { getEnhancementBranchContent, getEnhancementNodeContent } from '@/i18n/enhancementContent';
import { locale } from '@/i18n/fr';
import {
  formatAdminDate,
  formatAdminNumber,
  formatAdminPercent,
} from '../../domain/adminFormatting';
import type { BalanceTreeReport } from '../../domain/balance/treeTypes';
import { AdminBalanceContext, type BalanceSelection } from './AdminBalanceContext';
import { AdminBalanceRate } from './AdminBalanceRate';

function label(id: string, branch = false) {
  try {
    return (
      branch ? getEnhancementBranchContent(locale, id) : getEnhancementNodeContent(locale, id)
    ).name;
  } catch {
    return id;
  }
}

export function AdminBalanceTrees({
  report,
  selection,
}: {
  report: BalanceTreeReport;
  selection?: BalanceSelection;
}) {
  const copy = getAdminEnhancementTreesCopy(locale);
  const balance = getAdminBalanceCopy(locale);
  const purchases = report.purchases;
  return (
    <>
      <p className="admin-balance__note">{copy.scope}</p>
      <p className="admin-balance__note">{copy.descriptive}</p>
      <p>{copy.exposure}</p>
      <dl className="admin-profile-facts admin-balance__facts">
        {(
          [
            ['commands', 'commands'],
            ['resets', 'resets'],
            ['uniquePurchasers', 'purchasers'],
            ['spent', 'spent'],
            ['refunded', 'refunded'],
          ] as const
        ).map(([field, name]) => (
          <div key={field}>
            <dt>{copy[name]}</dt>
            <dd>{formatAdminNumber(purchases[field])}</dd>
          </div>
        ))}
      </dl>
      <p role="status">{purchases.ledgerComplete ? copy.reconciled : copy.incomplete}</p>
      <p className="admin-balance__metadata">
        {copy.coverage}: {formatAdminDate(purchases.ledgerCoverageStartedAt)} · {copy.unclassified}:{' '}
        {formatAdminNumber(purchases.unclassifiedCommands)}
      </p>
      {(['nodes', 'branches'] as const).map((kind) => (
        <div
          key={kind}
          className="admin-balance__scroll"
          role="region"
          aria-label={kind === 'nodes' ? copy.purchases : copy.branches}
          tabIndex={0}
        >
          <table className="admin-balance__table">
            <caption>{kind === 'nodes' ? copy.purchases : copy.branches}</caption>
            <thead>
              <tr>
                <th scope="col">{kind === 'nodes' ? copy.node : copy.branch}</th>
                <th scope="col">{copy.champion}</th>
                <th scope="col">{copy.count}</th>
                <th scope="col">{copy.share}</th>
              </tr>
            </thead>
            <tbody>
              {purchases[kind].map((row) => {
                const id = 'nodeId' in row ? row.nodeId : row.branchId;
                return (
                  <tr key={JSON.stringify([row.catalogVersion, row.championId, id])}>
                    <th scope="row">
                      {label(id, kind === 'branches')}
                      <small>
                        <code>{id}</code> · v{row.catalogVersion}
                      </small>
                    </th>
                    <td>{row.championId}</td>
                    <td>
                      {formatAdminNumber(row.purchases)}
                      <small>
                        {copy.players}: {formatAdminNumber(row.players)}
                      </small>
                    </td>
                    <td>
                      {row.purchaserShare === null
                        ? balance.unavailable
                        : formatAdminPercent(row.purchaserShare)}
                      {row.insufficientSample && <small>{copy.purchaseInsufficient}</small>}
                    </td>
                  </tr>
                );
              })}
              {!purchases[kind].length && (
                <tr>
                  <td colSpan={4}>{copy.empty}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ))}
      <h4>{copy.builds}</h4>
      {report.cardinality.buildsTruncated && <p role="status">{copy.truncated}</p>}
      <AdminBalanceContext report={report} id="admin-balance-trees" selection={selection}>
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
                  <th scope="col">{copy.champion}</th>
                  <th scope="col">{copy.ranks}</th>
                  <th scope="col">{copy.outcome}</th>
                </tr>
              </thead>
              <tbody>
                {report.builds
                  .filter((row) => row.contextId === context.id)
                  .map((row) => (
                    <tr key={JSON.stringify([row.championId, row.snapshotHash])}>
                      <th scope="row">
                        {row.championId}
                        <small>
                          {row.state === 'partial'
                            ? balance.partial
                            : row.state === 'empty'
                              ? balance.emptyBuild
                              : balance.observed}
                        </small>
                      </th>
                      <td>
                        <ul>
                          {row.nodeIds.map((id) => (
                            <li key={id}>
                              {label(id)} : {row.ranks[id]} <code>{id}</code>
                            </li>
                          ))}
                        </ul>
                        <details>
                          <summary>{balance.contentHash}</summary>
                          <code>{row.snapshotHash}</code>
                        </details>
                      </td>
                      <td>
                        {row.insufficientSample ? (
                          <span>
                            {formatAdminNumber(row.wins)} / {formatAdminNumber(row.runs)} ·{' '}
                            {copy.players}: {formatAdminNumber(row.players)}
                          </span>
                        ) : (
                          <AdminBalanceRate wins={row.wins} runs={row.runs} players={row.players} />
                        )}
                        {row.insufficientSample && <small>{copy.insufficient}</small>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminBalanceContext>
      <details className="admin-details">
        <summary>{copy.catalogue}</summary>
        <p>{copy.catalogueHelp}</p>
        <ul>
          {report.catalogue.map((node) => (
            <li key={`${node.catalogVersion}:${node.nodeId}`}>
              {label(node.nodeId)} · {node.championId ?? node.role} · {copy[node.availability]}{' '}
              <code>{node.nodeId}</code>
            </li>
          ))}
        </ul>
      </details>
    </>
  );
}
