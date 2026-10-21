import { useEffect, useRef } from 'react';
import { fr } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminErrorNotice } from '../AdminErrorNotice';
import { AdminSectionFeedback } from '../AdminSectionFeedback';
import { formatAdminMetric } from '../../domain/adminMetrics';
import { AdminPagination } from '../explorer/AdminPagination';
import { AdminPlayerProfile } from './AdminPlayerProfile';
import type { AdminPlayerFilters } from '../../domain/players/adminPlayerTypes';
import type { AdminPlayersExplorer } from '../../hooks/players/useAdminPlayersExplorer';

export function AdminPlayersPanel({
  explorer,
  onOpenRuns,
}: {
  explorer: AdminPlayersExplorer;
  onOpenRuns: (playerId: string) => void;
}) {
  const copy = fr.admin.playerExplorer;
  const searchId = 'admin-player-search';
  const lastSelected = useRef<string | null>(null);
  useEffect(() => {
    if (explorer.selectedId) lastSelected.current = explorer.selectedId;
    else if (lastSelected.current) {
      const button = document.getElementById(`admin-player-open-${lastSelected.current}`);
      (button ?? document.getElementById(searchId))?.focus();
      lastSelected.current = null;
    }
  }, [explorer.selectedId]);
  const page = explorer.list.data;
  const metric = (value: string | null) => formatAdminMetric(value, 'accounts', copy.unknown);
  const timestamp = (value: string | null) => formatAdminMetric(value, 'timestamp', copy.unknown);
  return (
    <section
      className="players-tab"
      role="tabpanel"
      id="admin-panel-players"
      aria-labelledby="admin-tab-players"
    >
      {explorer.selectedId ? (
        <AdminPlayerProfile explorer={explorer} onOpenRuns={onOpenRuns} />
      ) : (
        <>
          <div className="admin-explorer-heading">
            <h3>{copy.title}</h3>
            <Button
              onClick={explorer.refresh}
              disabled={explorer.list.loading || explorer.searchPending || !explorer.datesValid}
            >
              {copy.refresh}
            </Button>
          </div>
          <div className="admin-explorer-filters">
            <label className="filter-group" htmlFor={searchId}>
              {copy.search}
              <input
                id={searchId}
                type="search"
                value={explorer.filters.search}
                maxLength={100}
                onChange={(event) => explorer.setFilter('search', event.target.value)}
                aria-describedby="admin-player-search-hint"
              />
            </label>
            {(['registeredFrom', 'registeredTo', 'activeFrom', 'activeTo'] as const).map(
              (field) => (
                <label className="filter-group" key={field}>
                  {copy[field]}
                  <input
                    type="date"
                    value={explorer.filters[field]}
                    onChange={(event) => explorer.setFilter(field, event.target.value)}
                    aria-invalid={!explorer.datesValid || undefined}
                    aria-describedby={!explorer.datesValid ? 'admin-player-dates-error' : undefined}
                  />
                </label>
              ),
            )}
            <label className="filter-group">
              {copy.verifiedRuns}
              <select
                value={explorer.filters.verifiedRuns}
                onChange={(event) =>
                  explorer.setFilter(
                    'verifiedRuns',
                    event.target.value as AdminPlayerFilters['verifiedRuns'],
                  )
                }
              >
                <option value="all">{copy.all}</option>
                <option value="some">{copy.withVerifiedRuns}</option>
                <option value="none">{copy.withoutVerifiedRuns}</option>
              </select>
            </label>
            <label className="filter-group">
              {copy.accountState}
              <select
                value={explorer.filters.accountState}
                onChange={(event) =>
                  explorer.setFilter(
                    'accountState',
                    event.target.value as AdminPlayerFilters['accountState'],
                  )
                }
              >
                <option value="all">{copy.all}</option>
                <option value="registered">{copy.registered}</option>
                <option value="guest">{copy.guest}</option>
              </select>
            </label>
            <Button variant="secondary" onClick={explorer.resetFilters}>
              {copy.reset}
            </Button>
          </div>
          <p id="admin-player-search-hint" className="admin-explorer-note">
            {copy.searchHint}
          </p>
          <p className="admin-explorer-note">
            {copy.activityHint} {copy.guestHint}
          </p>
          {!explorer.datesValid && (
            <p role="alert" id="admin-player-dates-error">
              {copy.invalidDates}
            </p>
          )}
          <AdminErrorNotice
            message={explorer.list.error}
            onRetry={explorer.list.reload}
            retrying={explorer.list.loading}
          />
          <AdminSectionFeedback state={explorer.list} />
          {explorer.searchPending ? (
            <p role="status">{copy.searching}</p>
          ) : explorer.list.loading && !explorer.list.hasData ? (
            <p role="status">{copy.loading}</p>
          ) : null}
          <AdminPagination
            pageIndex={explorer.pageIndex}
            pageSize={explorer.pageSize}
            displayed={page?.items.length ?? 0}
            total={page?.total ?? null}
            hasMore={page?.hasMore ?? false}
            busy={
              explorer.list.loading ||
              explorer.list.stale ||
              explorer.searchPending ||
              !explorer.datesValid
            }
            onPrevious={explorer.previous}
            onNext={explorer.next}
            onPageSizeChange={explorer.changePageSize}
          />
          {page && (
            <div
              className="players-table-container"
              tabIndex={0}
              role="region"
              aria-label={copy.caption}
            >
              <table className="players-table">
                <caption className="sr-only">{copy.caption}</caption>
                <thead>
                  <tr>
                    {[
                      copy.name,
                      copy.level,
                      copy.verifiedRuns,
                      copy.verifiedWins,
                      copy.candiesBalance,
                      copy.lastLoginAt,
                      copy.createdAt,
                      copy.openProfile,
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {page.items.map((player) => (
                    <tr key={player.id}>
                      <td>
                        <span className="player-name">
                          {player.displayName || player.username || copy.unknown}
                        </span>
                        <small>
                          {copy.publicId}: {player.id}
                        </small>
                      </td>
                      <td>{metric(player.level)}</td>
                      <td>{metric(player.verifiedRuns)}</td>
                      <td>{metric(player.verifiedWins)}</td>
                      <td>{metric(player.candiesBalance)}</td>
                      <td>{timestamp(player.lastLoginAt)}</td>
                      <td>{timestamp(player.createdAt)}</td>
                      <td>
                        <Button
                          id={`admin-player-open-${player.id}`}
                          variant="secondary"
                          disabled={explorer.list.loading || explorer.list.stale}
                          onClick={() => explorer.openProfile(player.id)}
                          aria-label={`${copy.openProfile} — ${player.displayName || player.username || player.id}`}
                        >
                          {copy.openProfile}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {page.items.length === 0 && <p className="no-data">{copy.noResults}</p>}
            </div>
          )}
        </>
      )}
    </section>
  );
}
