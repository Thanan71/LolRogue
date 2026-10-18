import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { formatAdminNumber, formatAdminPercent } from '../../adminPageUtils';
import { diagnosticsDate, DiagnosticsSection, DiagnosticsTable } from './DiagnosticsSection';
import type { AdminDiagnostics } from './useAdminDiagnostics';

export function DiagnosticsService({ diagnostics }: { diagnostics: AdminDiagnostics }) {
  const copy = getAdminDiagnosticsCopy(locale);
  const data = diagnostics.service.data?.data;
  return (
    <DiagnosticsSection
      id="diagnostics-service"
      title={copy.service}
      help={copy.serviceHelp}
      state={diagnostics.service}
      enabled={diagnostics.enabled}
    >
      {data && (
        <>
          <p className="admin-diagnostics__badge">{copy.serverSource}</p>
          <p>{copy.sloHelp}</p>
          <dl className="admin-diagnostics__metrics">
            <div>
              <dt>{copy.requestErrorRate}</dt>
              <dd>{copy.notInstrumented}</dd>
            </div>
            <div>
              <dt>{copy.availability}</dt>
              <dd>{copy.notInstrumented}</dd>
            </div>
            <div>
              <dt>{copy.requestLatency}</dt>
              <dd>{copy.notInstrumented}</dd>
            </div>
            <div>
              <dt>{copy.sealLatency}</dt>
              <dd>
                {data.summary.sealToTerminalP95Ms === null
                  ? copy.unavailable
                  : `${formatAdminNumber(data.summary.sealToTerminalP95Ms)} ${copy.milliseconds}`}
              </dd>
            </div>
            <div>
              <dt>{copy.sealSli}</dt>
              <dd>
                {data.summary.sealToTerminalSli === null
                  ? copy.unavailable
                  : formatAdminPercent(data.summary.sealToTerminalSli)}
              </dd>
            </div>
            <div>
              <dt>{copy.pendingBacklog}</dt>
              <dd>{formatAdminNumber(data.pendingBacklog)}</dd>
            </div>
            <div>
              <dt>{copy.count}</dt>
              <dd>{formatAdminNumber(data.summary.eligibleSeals)}</dd>
            </div>
          </dl>
          {!data.buckets.some((bucket) => bucket.hasSignal) && (
            <p role="status">{copy.noService}</p>
          )}
          <DiagnosticsTable label={copy.serviceTable}>
            <thead>
              <tr>
                {[
                  copy.bucket,
                  copy.coverage,
                  copy.started,
                  copy.verified,
                  copy.rejected,
                  copy.expired,
                  copy.nonterminalAttempts,
                  copy.sealLatency,
                  copy.sealSli,
                ].map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.buckets.map((bucket) => (
                <tr key={bucket.at}>
                  <td>{diagnosticsDate(bucket.at)}</td>
                  <td>{bucket.hasSignal ? copy.observed : copy.missing}</td>
                  {[
                    bucket.started,
                    bucket.verified,
                    bucket.rejected,
                    bucket.expired,
                    bucket.pending,
                  ].map((value, index) => (
                    <td key={`${bucket.at}-${index}`}>
                      {bucket.hasSignal ? formatAdminNumber(value) : copy.unavailable}
                    </td>
                  ))}
                  <td>
                    {bucket.sealToTerminalP95Ms === null
                      ? copy.unavailable
                      : `${formatAdminNumber(bucket.sealToTerminalP95Ms)} ${copy.milliseconds}`}
                  </td>
                  <td>
                    {bucket.sealToTerminalSli === null
                      ? copy.unavailable
                      : formatAdminPercent(bucket.sealToTerminalSli)}
                  </td>
                </tr>
              ))}
            </tbody>
          </DiagnosticsTable>
        </>
      )}
    </DiagnosticsSection>
  );
}
