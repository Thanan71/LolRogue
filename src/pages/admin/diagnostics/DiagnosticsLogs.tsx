import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { formatAdminNumber } from '../../adminPageUtils';
import type { DiagnosticsLogPage } from './adminDiagnosticsTypes';
import {
  diagnosticsDate,
  DiagnosticsPagination,
  DiagnosticsSection,
  DiagnosticsTable,
} from './DiagnosticsSection';
import type { AdminDiagnostics } from './useAdminDiagnostics';

export function DiagnosticsLogTable({
  data,
  diagnostics,
  correlation = false,
}: {
  data: DiagnosticsLogPage;
  diagnostics: AdminDiagnostics;
  correlation?: boolean;
}) {
  const copy = getAdminDiagnosticsCopy(locale);
  const resource = correlation ? diagnostics.correlation : diagnostics.logs;
  const enabled = diagnostics.enabled && !resource.loading && !resource.stale;
  return (
    <>
      <DiagnosticsPagination
        section={correlation ? 'correlation' : 'logs'}
        page={correlation ? diagnostics.correlationPage : diagnostics.logsPage}
        total={data.total}
        displayed={data.rows.length}
        next={data.nextCursor !== null}
        diagnostics={{ ...diagnostics, enabled }}
      />
      {data.rows.length === 0 ? (
        <p role="status">{correlation ? copy.noCorrelation : copy.noLogs}</p>
      ) : (
        <DiagnosticsTable label={correlation ? copy.correlationTable : copy.logsTable}>
          <thead>
            <tr>
              {[
                copy.createdAt,
                copy.level,
                copy.operation,
                copy.repository,
                copy.duration,
                copy.message,
                copy.correlationId,
                copy.attemptId,
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
                <td>{diagnosticsDate(row.createdAt)}</td>
                <td>
                  <span
                    className={`admin-diagnostics__badge admin-diagnostics__badge--${row.level}`}
                  >
                    {copy[row.level]}
                  </span>
                </td>
                <td>{row.operation}</td>
                <td>
                  {row.repository}
                  <br />
                  {row.method}
                  {row.tableName && (
                    <>
                      <br />
                      {row.tableName}
                    </>
                  )}
                </td>
                <td>
                  {row.durationMs === null
                    ? copy.unavailable
                    : `${formatAdminNumber(row.durationMs)} ${copy.milliseconds}`}
                </td>
                <td>{row.message ?? copy.unavailable}</td>
                <td>
                  <code>{row.correlationId}</code>
                </td>
                <td>
                  {row.attemptId ? (
                    <>
                      <code>{row.attemptId}</code>
                      {!correlation && (
                        <Button
                          variant="secondary"
                          disabled={!enabled}
                          onClick={() => diagnostics.select(row.attemptId)}
                        >
                          {copy.correlate}
                        </Button>
                      )}
                    </>
                  ) : (
                    copy.unavailable
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </DiagnosticsTable>
      )}
    </>
  );
}
export function DiagnosticsLogs({ diagnostics }: { diagnostics: AdminDiagnostics }) {
  const copy = getAdminDiagnosticsCopy(locale);
  return (
    <DiagnosticsSection
      id="diagnostics-logs"
      title={copy.logs}
      help={copy.logsHelp}
      state={diagnostics.logs}
      enabled={diagnostics.enabled}
    >
      {diagnostics.logs.data && (
        <DiagnosticsLogTable data={diagnostics.logs.data.data} diagnostics={diagnostics} />
      )}
    </DiagnosticsSection>
  );
}
