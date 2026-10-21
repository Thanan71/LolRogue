import { getAuthorityGameplayVersionLabel } from '@/game/authority/versionRegistry';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { formatAdminNumber } from '../adminPageUtils';
import {
  diagnosticsDate,
  DiagnosticsPagination,
  DiagnosticsSection,
  DiagnosticsTable,
} from './diagnostics/DiagnosticsSection';
import type { AdminDiagnostics } from './diagnostics/useAdminDiagnostics';
import { diagnosticsRejectionCategory } from './diagnostics/adminDiagnosticsIncidents';

/** Authority keeps its existing entry point and server source; no parallel rejection channel. */
export function AdminAuthorityPanel({ diagnostics }: { diagnostics: AdminDiagnostics }) {
  const copy = getAdminDiagnosticsCopy(locale);
  const state = diagnostics.authority;
  const data = state.data?.data;
  const enabled = diagnostics.enabled && !state.loading && !state.stale;
  return (
    <DiagnosticsSection
      id="diagnostics-authority"
      title={copy.attempts}
      help={copy.attemptsHelp}
      state={state}
      enabled={diagnostics.enabled}
    >
      {data && (
        <>
          <dl className="admin-diagnostics__metrics">
            {Object.entries(data.counts).map(([status, count]) => (
              <div key={status}>
                <dt>
                  {status === 'started'
                    ? copy.started
                    : status === 'finished'
                      ? copy.finished
                      : status === 'verified'
                        ? copy.verified
                        : status === 'rejected'
                          ? copy.rejected
                          : copy.expired}
                </dt>
                <dd>{formatAdminNumber(count)}</dd>
              </div>
            ))}
          </dl>
          <DiagnosticsPagination
            section="authority"
            page={diagnostics.authorityPage}
            total={data.total}
            displayed={data.rows.length}
            next={data.nextCursor !== null}
            diagnostics={{ ...diagnostics, enabled }}
          />
          {data.rows.length === 0 ? (
            <p role="status">{copy.noAttempts}</p>
          ) : (
            <DiagnosticsTable label={copy.attemptsTable}>
              <thead>
                <tr>
                  {[
                    copy.createdAt,
                    copy.attemptId,
                    copy.status,
                    copy.engine,
                    copy.ruleset,
                    copy.code,
                  ].map((label) => (
                    <th key={label} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.id}>
                    <td>{diagnosticsDate(row.startedAt)}</td>
                    <td>
                      <code>{row.id}</code>
                      <Button
                        variant="secondary"
                        disabled={!enabled}
                        onClick={() => diagnostics.select(row.id)}
                      >
                        {copy.correlate}
                      </Button>
                    </td>
                    <td>
                      <span
                        className={`admin-diagnostics__badge admin-diagnostics__badge--${row.status}`}
                      >
                        {copy[row.status]}
                      </span>
                    </td>
                    <td>{row.engineVersion}</td>
                    <td>{getAuthorityGameplayVersionLabel(row.gameplayRulesetVersion)}</td>
                    <td>
                      <code>{row.rejectionCode ?? copy.unavailable}</code>
                      {row.status === 'rejected' && (
                        <p>
                          {diagnosticsRejectionCategory(row.rejectionCode) === 'technical'
                            ? copy.technical
                            : diagnosticsRejectionCategory(row.rejectionCode) === 'contract'
                              ? copy.contract
                              : diagnosticsRejectionCategory(row.rejectionCode) === 'missing'
                                ? copy.missingCode
                                : copy.unknownCode}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </DiagnosticsTable>
          )}
        </>
      )}
    </DiagnosticsSection>
  );
}
