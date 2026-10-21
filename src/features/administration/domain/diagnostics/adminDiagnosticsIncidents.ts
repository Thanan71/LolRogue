import {
  AUTHORITY_REJECTION_ALERT_POLICY,
  KNOWN_AUTHORITY_REJECTION_CODES,
  evaluateAuthorityRejectionAlerts,
  type AuthorityRejectionSignal,
} from '@/observability/authorityRejectionMonitor';
import type { DiagnosticsResponse } from './adminDiagnosticsTypes';
import { diagnosticsIdentity, diagnosticsTimestampUs } from './adminDiagnosticsValidation';

export const DIAGNOSTICS_RUNBOOK_URL =
  'https://github.com/Thanan71/LolRogue/blob/dev/docs/incident-runbooks.md#rejets-authority-anormaux';
const TECHNICAL_CODES = new Set([
  'verification_failed',
  'invalid_verifier_result',
  'unsupported_engine',
  'unsupported_engine_version',
  'engine_version_unsupported',
  'verifier_unavailable',
  'rpc_failed',
]);
export type DiagnosticsRejectionCategory = 'technical' | 'contract' | 'unknown' | 'missing';
export function diagnosticsRejectionCategory(code: string | null): DiagnosticsRejectionCategory {
  if (code === null) return 'missing';
  if (TECHNICAL_CODES.has(code)) return 'technical';
  if (!KNOWN_AUTHORITY_REJECTION_CODES.has(code)) return 'unknown';
  // A contract rejection is a diagnostic outcome, never evidence of player intent.
  return 'contract';
}
export interface DiagnosticsIncidentEvidence {
  key: string;
  engineVersion: string;
  gameplayRulesetVersion: number;
  status: 'alert' | 'normal' | 'unknown';
  severity: 'warning' | 'critical';
  reasons: AuthorityRejectionSignal['reasons'];
  rejectionCodes: string[];
  attemptCount: number;
  rejectedCount: number;
}
export interface DiagnosticsIncidentObservation {
  snapshotAt: string;
  windowFrom: string;
  windowTo: string;
  scopeKey: string;
  complete: boolean;
  evidence: DiagnosticsIncidentEvidence[];
}
export interface DiagnosticsIncident extends Omit<DiagnosticsIncidentEvidence, 'status'> {
  status: 'active' | 'silenced' | 'recovered';
  firstObservedAt: string;
  lastObservedAt: string;
  runbookUrl: string;
}
export interface DiagnosticsIncidentState {
  snapshotAt: string;
  scopeKey: string;
  incidents: DiagnosticsIncident[];
}
export interface DiagnosticsIncidentTransition {
  key: string;
  kind: 'opened' | 'changed' | 'escalated' | 'recovered';
}
function incidentKey(engineVersion: string, gameplayRulesetVersion: number): string {
  return diagnosticsIdentity({ engineVersion, gameplayRulesetVersion });
}
/** Complete, server-counted cohorts only; browsing a status/date does not alter alert evidence. */
export function deriveDiagnosticsIncidents(
  response: DiagnosticsResponse<'authority'>,
): DiagnosticsIncidentObservation {
  const { alerts } = response.data;
  const grouped = new Map<
    string,
    {
      engineVersion: string;
      gameplayRulesetVersion: number;
      attemptCount: number;
      rejectedCount: number;
    }
  >();
  for (const row of alerts.aggregates) {
    const key = incidentKey(row.engineVersion, row.gameplayRulesetVersion);
    const group = grouped.get(key) ?? {
      engineVersion: row.engineVersion,
      gameplayRulesetVersion: row.gameplayRulesetVersion,
      attemptCount: 0,
      rejectedCount: 0,
    };
    group.attemptCount += row.attemptCount;
    group.rejectedCount += row.rejectedCount;
    grouped.set(key, group);
  }
  const signals = alerts.complete
    ? evaluateAuthorityRejectionAlerts(alerts.aggregates, new Date(alerts.to))
    : [];
  const signalByKey = new Map(
    signals.map((signal) => [
      incidentKey(signal.engineVersion, signal.gameplayRulesetVersion),
      signal,
    ]),
  );
  const evidence: DiagnosticsIncidentEvidence[] = [...grouped].map(([key, group]) => {
    const signal = signalByKey.get(key);
    return {
      ...group,
      key,
      status: !alerts.complete
        ? 'unknown'
        : signal
          ? 'alert'
          : group.attemptCount >= AUTHORITY_REJECTION_ALERT_POLICY.minimumAttempts
            ? 'normal'
            : 'unknown',
      severity: signal?.rejectionCodes.some(
        (code) => diagnosticsRejectionCategory(code) === 'technical',
      )
        ? 'critical'
        : 'warning',
      reasons: signal?.reasons ?? [],
      rejectionCodes: signal?.rejectionCodes ?? [],
    };
  });
  return {
    snapshotAt: response.snapshotAt,
    windowFrom: alerts.from,
    windowTo: alerts.to,
    scopeKey: diagnosticsIdentity({
      engineVersion: response.filters.engineVersion,
      gameplayRulesetVersion: response.filters.gameplayRulesetVersion,
    }),
    complete: alerts.complete,
    evidence,
  };
}
function fingerprint(
  incident: Pick<DiagnosticsIncidentEvidence, 'severity' | 'reasons' | 'rejectionCodes'>,
): string {
  return diagnosticsIdentity({
    severity: incident.severity,
    reasons: [...incident.reasons].sort(),
    codes: [...incident.rejectionCodes].sort(),
  });
}
/** In-memory anti-noise state, scoped to this admin session. No notification delivery is implied. */
export function advanceDiagnosticsIncidents(
  previous: DiagnosticsIncidentState | null,
  observation: DiagnosticsIncidentObservation,
): {
  state: DiagnosticsIncidentState;
  transitions: DiagnosticsIncidentTransition[];
} {
  const sameScope = previous?.scopeKey === observation.scopeKey;
  if (
    previous &&
    sameScope &&
    diagnosticsTimestampUs(observation.snapshotAt) <= diagnosticsTimestampUs(previous.snapshotAt)
  )
    return { state: previous, transitions: [] };
  const old = new Map(
    (sameScope ? (previous?.incidents ?? []) : []).map((incident) => [incident.key, incident]),
  );
  const evidence = new Map(observation.evidence.map((item) => [item.key, item]));
  const transitions: DiagnosticsIncidentTransition[] = [];
  const incidents: DiagnosticsIncident[] = [];
  for (const key of new Set([...old.keys(), ...evidence.keys()])) {
    const before = old.get(key);
    const current = evidence.get(key);
    if (!observation.complete || !current || current.status === 'unknown') {
      if (before)
        incidents.push({
          ...before,
          status: before.status === 'recovered' ? 'recovered' : 'silenced',
        });
      continue;
    }
    if (current.status === 'normal') {
      if (before) {
        if (before.status !== 'recovered') transitions.push({ key, kind: 'recovered' });
        incidents.push({
          ...before,
          status: 'recovered',
          lastObservedAt: observation.snapshotAt,
        });
      }
      continue;
    }
    if (!before || before.status === 'recovered') transitions.push({ key, kind: 'opened' });
    else if (before.severity === 'warning' && current.severity === 'critical')
      transitions.push({ key, kind: 'escalated' });
    else if (fingerprint(before) !== fingerprint(current))
      transitions.push({ key, kind: 'changed' });
    incidents.push({
      ...current,
      status: 'active',
      firstObservedAt:
        !before || before.status === 'recovered' ? observation.snapshotAt : before.firstObservedAt,
      lastObservedAt: observation.snapshotAt,
      runbookUrl: DIAGNOSTICS_RUNBOOK_URL,
    });
  }
  // Retain every active cohort; only recovered history is bounded locally.
  incidents.sort(
    (a, b) =>
      (a.status === 'recovered' ? 1 : 0) - (b.status === 'recovered' ? 1 : 0) ||
      (a.lastObservedAt < b.lastObservedAt
        ? 1
        : a.lastObservedAt > b.lastObservedAt
          ? -1
          : a.key.localeCompare(b.key)),
  );
  const current = incidents.filter((incident) => incident.status !== 'recovered');
  const recovered = incidents.filter((incident) => incident.status === 'recovered').slice(0, 100);
  return {
    state: {
      snapshotAt: observation.snapshotAt,
      scopeKey: observation.scopeKey,
      incidents: [...current, ...recovered],
    },
    transitions,
  };
}
