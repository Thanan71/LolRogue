import { useEffect, useState } from 'react';
import { getAuthorityGameplayVersionLabel } from '@/game/authority/versionRegistry';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { AUTHORITY_REJECTION_ALERT_POLICY } from '@/observability/authorityRejectionMonitor';
import { formatAdminNumber } from '../../adminPageUtils';
import {
  advanceDiagnosticsIncidents,
  deriveDiagnosticsIncidents,
  type DiagnosticsIncidentState,
} from './adminDiagnosticsIncidents';
import { diagnosticsDate } from './DiagnosticsSection';
import type { AdminDiagnostics } from './useAdminDiagnostics';

export function DiagnosticsIncidents({ diagnostics }: { diagnostics: AdminDiagnostics }) {
  const copy = getAdminDiagnosticsCopy(locale);
  const response = diagnostics.authority.data;
  const [tracker, setTracker] = useState<{
    scope: object | null;
    state: DiagnosticsIncidentState | null;
  }>({ scope: null, state: null });
  // The resource identity changes on every auth generation, including A → B → A.
  const scope = diagnostics.scope;
  useEffect(() => {
    if (!response || diagnostics.authority.stale || !diagnostics.enabled) return;
    setTracker((previous) => ({
      scope,
      state: advanceDiagnosticsIncidents(
        previous.scope === scope ? previous.state : null,
        deriveDiagnosticsIncidents(response),
      ).state,
    }));
  }, [response, diagnostics.authority.stale, diagnostics.enabled, scope]);
  const incidents =
    diagnostics.enabled && tracker.scope === scope ? (tracker.state?.incidents ?? []) : [];
  const observation = response ? deriveDiagnosticsIncidents(response) : null;
  const unknown =
    !response ||
    diagnostics.authority.stale ||
    !observation?.complete ||
    !observation.evidence.some((item) => item.status !== 'unknown');
  return (
    <section className="admin-diagnostics__panel" aria-labelledby="diagnostics-incidents-heading">
      <h3 id="diagnostics-incidents-heading">{copy.incidents}</h3>
      <p>{copy.incidentHelp}</p>
      <p>
        {copy.alertsWindow}: {formatAdminNumber(AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes)}{' '}
        {copy.minutes}.
      </p>
      <p className="admin-diagnostics__note">{copy.noSignalRecovery}</p>
      {response && (
        <p>
          {diagnosticsDate(response.data.alerts.from)} — {diagnosticsDate(response.data.alerts.to)}{' '}
          {copy.utc}
        </p>
      )}
      {unknown && (
        <p role="status">
          {!observation?.complete && response ? copy.incompleteAlerts : copy.unknown}
        </p>
      )}
      {!unknown && incidents.length === 0 && <p role="status">{copy.stable}</p>}
      {incidents.map((incident) => (
        <article className="admin-diagnostics__notice" key={incident.key}>
          <h4>
            {incident.status === 'active'
              ? copy.active
              : incident.status === 'recovered'
                ? copy.recovered
                : copy.unknown}
          </h4>
          <p>
            {incident.severity === 'critical' ? copy.critical : copy.warning} ·{' '}
            {incident.engineVersion} /{' '}
            {getAuthorityGameplayVersionLabel(incident.gameplayRulesetVersion)}
          </p>
          <p>
            {copy.rejected}: {formatAdminNumber(incident.rejectedCount)} /{' '}
            {formatAdminNumber(incident.attemptCount)}
          </p>
          <p>{incident.rejectionCodes.join(', ')}</p>
          <p>
            {copy.lastObserved}: {diagnosticsDate(incident.lastObservedAt)} {copy.utc}
          </p>
          <a href={incident.runbookUrl} target="_blank" rel="noreferrer">
            {copy.runbook}
          </a>
        </article>
      ))}
    </section>
  );
}
