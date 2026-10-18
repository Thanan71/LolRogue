import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { dbLogger } from '@/utils/dbLogger';
import { AdminAuthorityPanel } from '../AdminAuthorityPanel';
import { DiagnosticsCorrelation } from './DiagnosticsCorrelation';
import { DiagnosticsFilters } from './DiagnosticsFilters';
import { DiagnosticsLogs } from './DiagnosticsLogs';
import { DiagnosticsIncidents } from './DiagnosticsIncidents';
import { DiagnosticsService } from './DiagnosticsService';
import { useAdminDiagnostics } from './useAdminDiagnostics';
import '@/styles/admin-diagnostics.css';

export default function AdminDiagnosticsWorkspace({
  active = true,
  tab,
}: {
  active?: boolean;
  tab: 'logs' | 'authority';
}) {
  const diagnostics = useAdminDiagnostics(active, tab);
  const copy = getAdminDiagnosticsCopy(locale);
  const logging = dbLogger.getConfig();
  return (
    <section
      role="tabpanel"
      id={`admin-panel-${tab}`}
      aria-labelledby={`admin-tab-${tab}`}
      className="admin-diagnostics"
    >
      <h2>{tab === 'logs' ? copy.logsTitle : copy.authorityTitle}</h2>
      <p>{copy.intro}</p>
      <p className="admin-diagnostics__notice">{copy.privacy}</p>
      <p>
        {copy.collection}:{' '}
        <strong>
          {logging.enabled && logging.logToDatabase ? copy.loggingOn : copy.loggingOff}
        </strong>
        . {copy.collectionHelp}
      </p>
      {diagnostics.permissionDenied ? (
        <p role="alert">{copy.denied}</p>
      ) : (
        <>
          <DiagnosticsFilters diagnostics={diagnostics} tab={tab} />
          <div hidden={tab !== 'logs'}>
            <DiagnosticsLogs diagnostics={diagnostics} />
          </div>
          <div hidden={tab !== 'authority'}>
            <AdminAuthorityPanel diagnostics={diagnostics} />
            <DiagnosticsIncidents diagnostics={diagnostics} />
            <DiagnosticsService diagnostics={diagnostics} />
          </div>
          <DiagnosticsCorrelation diagnostics={diagnostics} active={active} />
          <p className="admin-diagnostics__actions">
            <a
              href="https://github.com/Thanan71/LolRogue/blob/dev/docs/incident-runbooks.md#rejets-authority-anormaux"
              target="_blank"
              rel="noreferrer"
            >
              {copy.runbook}
            </a>
            <a
              href="https://github.com/Thanan71/LolRogue/blob/dev/docs/observability.md"
              target="_blank"
              rel="noreferrer"
            >
              {copy.observability}
            </a>
          </p>
        </>
      )}
    </section>
  );
}
