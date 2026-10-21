import type { ReactNode } from 'react';
import { fr } from '@/i18n/fr';
import { AdminTableCount } from '../AdminSectionFeedback';
import { formatAdminMetric } from '../../domain/adminMetrics';
import { formatAdminPlayerSignedAmount } from './adminPlayerFormat';
import type { AdminPlayerDetail } from '../../domain/players/adminPlayerTypes';

function HistorySection({
  title,
  displayed,
  total,
  empty,
  children,
}: {
  title: string;
  displayed: number;
  total: number;
  empty: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title}>
      <h4>{title}</h4>
      <p className="admin-explorer-note">{fr.admin.playerExplorer.historyLimit}</p>
      <AdminTableCount displayed={displayed} total={total} />
      {displayed === 0 ? (
        <p>{empty}</p>
      ) : (
        <div className="players-table-container" tabIndex={0} role="region" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  );
}

export function AdminPlayerHistories({ detail }: { detail: AdminPlayerDetail }) {
  const copy = fr.admin.playerExplorer;
  const date = (value: string | null) => formatAdminMetric(value, 'timestamp', copy.unknown);
  const number = (value: string | null) => formatAdminMetric(value, 'accounts', copy.unknown);
  return (
    <>
      <HistorySection
        title={`${copy.candies} — ${copy.transactions}`}
        displayed={detail.candies.transactions.items.length}
        total={detail.candies.transactions.total}
        empty={copy.noTransactions}
      >
        <table className="players-table">
          <caption className="sr-only">
            {copy.candies} — {copy.transactions}
          </caption>
          <thead>
            <tr>
              <th scope="col">{copy.occurredAt}</th>
              <th scope="col">{copy.kind}</th>
              <th scope="col">{copy.amount}</th>
            </tr>
          </thead>
          <tbody>
            {detail.candies.transactions.items.map((event) => (
              <tr key={event.id}>
                <td>{date(event.createdAt)}</td>
                <td>{copy[event.kind]}</td>
                <td>{formatAdminPlayerSignedAmount(event.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>
      <HistorySection
        title={`${copy.shards} — ${copy.transactions}`}
        displayed={detail.shards.transactions.items.length}
        total={detail.shards.transactions.total}
        empty={copy.noTransactions}
      >
        <table className="players-table">
          <caption className="sr-only">
            {copy.shards} — {copy.transactions}
          </caption>
          <thead>
            <tr>
              <th scope="col">{copy.occurredAt}</th>
              <th scope="col">{copy.amount}</th>
              <th scope="col">{copy.balanceAfter}</th>
              <th scope="col">{copy.reason}</th>
              <th scope="col">{copy.champion}</th>
            </tr>
          </thead>
          <tbody>
            {detail.shards.transactions.items.map((event) => (
              <tr key={event.id}>
                <td>{date(event.createdAt)}</td>
                <td>{formatAdminPlayerSignedAmount(event.amount)}</td>
                <td>{number(event.balanceAfter)}</td>
                <td>{event.reason ?? copy.unknown}</td>
                <td>{event.championId ?? copy.unknown}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>
      <HistorySection
        title={copy.purchases}
        displayed={detail.purchases.items.length}
        total={detail.purchases.total}
        empty={copy.noPurchases}
      >
        <table className="players-table">
          <caption className="sr-only">{copy.purchases}</caption>
          <thead>
            <tr>
              <th scope="col">{copy.champion}</th>
              <th scope="col">{copy.purchaseSource}</th>
              <th scope="col">{copy.purchasePrice}</th>
              <th scope="col">{copy.occurredAt}</th>
            </tr>
          </thead>
          <tbody>
            {detail.purchases.items.map((purchase) => (
              <tr key={purchase.championId}>
                <td>{purchase.championId}</td>
                <td>{copy[purchase.source]}</td>
                <td>{number(purchase.pricePaid)}</td>
                <td>{date(purchase.unlockedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </HistorySection>
    </>
  );
}
