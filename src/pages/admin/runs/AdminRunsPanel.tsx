import { useEffect, useRef } from 'react';
import { getAdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import { locale } from '@/i18n/fr';
import { AdminPagination } from '../explorer/AdminPagination';
import { AdminRunDetail } from './AdminRunDetail';
import { AdminRunExportDialog } from './AdminRunExportDialog';
import { AdminRunFilters } from './AdminRunFilterForm';
import { adminRunChampion, adminRunDate, adminRunNumber } from './adminRunDisplay';
import { ADMIN_RUN_EXPORT_CAP } from './adminRunExport';
import { isAdminSavedRun } from './adminRunQueries';
import type { AdminRunExplorer } from './useAdminRunExplorer';

export function AdminRunsPanel({ explorer }: { explorer: AdminRunExplorer }) {
  const copy = getAdminRunExplorerCopy(locale);
  const { section, exporting } = explorer;
  const page = section.data;
  const ready = section.hasData && !section.loading && !section.stale;
  const returnToRun = useRef<string | null>(null);
  const cancelExportButton = useRef<HTMLButtonElement>(null);
  const exportAllButton = useRef<HTMLButtonElement>(null);
  const wasExporting = useRef(false);
  useEffect(() => {
    if (explorer.selectedId !== null || returnToRun.current === null) return;
    const id = returnToRun.current;
    [...document.querySelectorAll<HTMLButtonElement>('[data-admin-run-open]')]
      .find((button) => button.dataset.adminRunOpen === id)
      ?.focus();
    returnToRun.current = null;
  }, [explorer.selectedId]);
  useEffect(() => {
    if (exporting.busy) {
      wasExporting.current = true;
      cancelExportButton.current?.focus();
    } else if (wasExporting.current) {
      wasExporting.current = false;
      if (document.activeElement === document.body && !exportAllButton.current?.disabled)
        exportAllButton.current?.focus();
    }
  }, [exporting.busy]);
  return (
    <section
      className="runs-tab admin-run-explorer"
      role="tabpanel"
      id="admin-panel-runs"
      aria-labelledby="admin-tab-runs"
    >
      <h2>{copy.title}</h2>
      {explorer.selectedId ? (
        <AdminRunDetail explorer={explorer} />
      ) : (
        <>
          <fieldset className="admin-run-population">
            <legend>{copy.exportScope}</legend>
            {(['runs', 'attempts'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="admin-run-population"
                  value={value}
                  checked={explorer.population === value}
                  onChange={() => explorer.changePopulation(value)}
                />
                {value === 'runs' ? copy.persisted : copy.attempts}
              </label>
            ))}
          </fieldset>
          <p className="admin-explorer-help">
            {explorer.population === 'runs' ? copy.persistedHelp : copy.attemptsHelp}
          </p>
          <AdminRunFilters
            filters={explorer.draft}
            population={explorer.population}
            copy={copy}
            busy={section.loading}
            error={explorer.filterError}
            onChange={explorer.changeDraft}
            onApply={explorer.apply}
            onReset={explorer.reset}
          />
          <div className="runs-header">
            <div className="runs-actions">
              <button type="button" onClick={explorer.refresh} disabled={section.loading}>
                {copy.refresh}
              </button>
              <button
                type="button"
                onClick={exporting.exportPage}
                disabled={!ready || page.items.length === 0 || exporting.busy}
              >
                {copy.exportPage}
              </button>
              <button
                ref={exportAllButton}
                type="button"
                onClick={exporting.confirm}
                disabled={
                  !ready || page.total === 0 || page.total > ADMIN_RUN_EXPORT_CAP || exporting.busy
                }
              >
                {copy.exportAll}
              </button>
            </div>
            <p className="admin-explorer-help">{copy.exportCap}</p>
          </div>
          {exporting.busy && (
            <div className="admin-export-progress" role="status">
              <label>
                {copy.exporting}
                <progress value={exporting.completed} max={page.total || 1} />
              </label>
              <button ref={cancelExportButton} type="button" onClick={exporting.cancel}>
                {copy.cancel}
              </button>
            </div>
          )}
          {exporting.message && <p role="status">{exporting.message}</p>}
          {exporting.confirmation && (
            <AdminRunExportDialog
              total={exporting.confirmation.total}
              populationLabel={explorer.population === 'runs' ? copy.persisted : copy.attempts}
              copy={copy}
              onConfirm={() => void exporting.start()}
              onCancel={exporting.cancel}
            />
          )}
          {section.error && (
            <div role="alert">
              <p>{copy.error}</p>
              <button
                type="button"
                onClick={() => void section.reload()}
                disabled={section.loading}
              >
                {copy.retry}
              </button>
            </div>
          )}
          {section.stale && <p role="status">{copy.stale}</p>}
          {section.loading && !section.hasData ? (
            <p role="status">{copy.loading}</p>
          ) : (
            section.hasData && (
              <>
                {page.items.length === 0 ? (
                  <p>{copy.empty}</p>
                ) : (
                  <div
                    className="runs-table-container"
                    role="region"
                    aria-label={explorer.population === 'runs' ? copy.persisted : copy.attempts}
                    tabIndex={0}
                  >
                    <table className="runs-table">
                      <caption className="sr-only">
                        {explorer.population === 'runs' ? copy.persisted : copy.attempts}
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">{copy.date}</th>
                          <th scope="col">{copy.playerColumn}</th>
                          <th scope="col">{copy.status}</th>
                          <th scope="col">{copy.level}</th>
                          <th scope="col">{copy.waves}</th>
                          <th scope="col">{copy.team}</th>
                          <th scope="col">{copy.engine}</th>
                          <th scope="col">{copy.detail}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {page.items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              {adminRunDate(
                                isAdminSavedRun(item) ? item.completedAt : item.startedAt,
                                copy.unavailable,
                              )}{' '}
                              UTC
                            </td>
                            <td>{item.displayName ?? item.username}</td>
                            <td>
                              {isAdminSavedRun(item) ? (
                                <>
                                  {item.won ? copy.won : copy.lost} ·{' '}
                                  {item.verificationStatus === 'verified'
                                    ? copy.verified
                                    : copy.legacy}
                                </>
                              ) : (
                                copy[item.status]
                              )}
                            </td>
                            <td>
                              {isAdminSavedRun(item)
                                ? adminRunNumber(item.runLevel, copy.unavailable)
                                : copy.unavailable}
                            </td>
                            <td>
                              {isAdminSavedRun(item)
                                ? adminRunNumber(item.wavesCompleted, copy.unavailable)
                                : copy.unavailable}
                            </td>
                            <td>
                              {(isAdminSavedRun(item)
                                ? item.team.map((member) => member.championId)
                                : item.initialTeam
                              )
                                .map(adminRunChampion)
                                .join(' · ')}
                            </td>
                            <td>{item.engineVersion ?? copy.unavailable}</td>
                            <td>
                              <button
                                type="button"
                                data-admin-run-open={item.id}
                                onClick={() => {
                                  returnToRun.current = item.id;
                                  explorer.openDetail(item.id);
                                }}
                              >
                                {copy.detail}
                                <span className="sr-only">
                                  {' '}
                                  · {item.displayName ?? item.username}
                                </span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <AdminPagination
                  pageIndex={explorer.pageIndex}
                  pageSize={explorer.pageSize}
                  displayed={page.items.length}
                  total={page.total}
                  hasMore={page.hasMore}
                  busy={section.loading}
                  onNext={explorer.next}
                  onPrevious={explorer.previous}
                  onPageSizeChange={explorer.changePageSize}
                />
              </>
            )
          )}
        </>
      )}
    </section>
  );
}
