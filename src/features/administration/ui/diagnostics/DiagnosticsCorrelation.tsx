import { useEffect, useRef } from 'react';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { DiagnosticsLogTable } from './DiagnosticsLogs';
import { DiagnosticsSection } from './DiagnosticsSection';
import type { AdminDiagnostics } from '../../hooks/diagnostics/useAdminDiagnostics';

export function DiagnosticsCorrelation({
  diagnostics,
  active,
}: {
  diagnostics: AdminDiagnostics;
  active: boolean;
}) {
  const copy = getAdminDiagnosticsCopy(locale);
  const heading = useRef<HTMLHeadingElement>(null);
  const previousSelection = useRef<string | null>(null);
  useEffect(() => {
    if (active && diagnostics.selected && diagnostics.selected !== previousSelection.current)
      heading.current?.focus();
    previousSelection.current = diagnostics.selected;
  }, [active, diagnostics.selected]);
  if (!diagnostics.selected) return null;
  const data = diagnostics.correlation.data?.data;
  return (
    <div>
      <h2 ref={heading} tabIndex={-1}>
        {copy.correlation}
      </h2>
      <p>
        <code>{diagnostics.selected}</code>
      </p>
      <Button
        variant="secondary"
        onClick={() => {
          diagnostics.select(null);
          window.requestAnimationFrame(() =>
            document
              .getElementById(
                diagnostics.logs.hasData
                  ? 'diagnostics-logs-heading'
                  : 'diagnostics-authority-heading',
              )
              ?.focus(),
          );
        }}
        disabled={!diagnostics.enabled}
      >
        {copy.closeCorrelation}
      </Button>
      <DiagnosticsSection
        id="diagnostics-correlation"
        title={copy.correlation}
        help={copy.correlationHelp}
        state={diagnostics.correlation}
        enabled={diagnostics.enabled}
      >
        {data && (
          <>
            {data.attempt && (
              <p>
                {data.attempt.engineVersion} · {copy[data.attempt.status]} ·{' '}
                <code>{data.attempt.rejectionCode ?? copy.unavailable}</code>
              </p>
            )}
            <p className="admin-diagnostics__note">{copy.clientSource}</p>
            <DiagnosticsLogTable data={data.logs} diagnostics={diagnostics} correlation />
          </>
        )}
      </DiagnosticsSection>
    </div>
  );
}
