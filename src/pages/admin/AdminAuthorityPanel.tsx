import type {
  VerifiedFieldAugmentCohort,
  VerifiedFieldCalibrationCohort,
  VerifiedFieldChampionCohort,
} from '@/game/balance/fieldCalibrationComparison';
import { fr } from '@/i18n/fr';
import type {
  AuthorityAttemptAggregate,
  AuthorityRejectionSignal,
} from '@/observability/authorityRejectionMonitor';
import { AUTHORITY_REJECTION_ALERT_POLICY } from '@/observability/authorityRejectionMonitor';
import {
  formatAdminCount,
  formatAdminDate,
  formatAdminNumber,
  formatAdminPercent,
} from '../adminPageUtils';
import { AdminErrorNotice } from './AdminErrorNotice';
import { AdminFieldCalibrationPanel } from './AdminFieldCalibrationPanel';
import type { AdminAuthorityRejection } from './useAdminData';

interface AdminAuthorityPanelProps {
  aggregates: AuthorityAttemptAggregate[];
  signals: AuthorityRejectionSignal[];
  rejections: AdminAuthorityRejection[];
  fieldCohorts: readonly VerifiedFieldCalibrationCohort[];
  fieldChampionCohorts: readonly VerifiedFieldChampionCohort[];
  fieldAugmentCohorts: readonly VerifiedFieldAugmentCohort[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function AdminAuthorityPanel({
  aggregates,
  signals,
  rejections,
  fieldCohorts,
  fieldChampionCohorts,
  fieldAugmentCohorts,
  loading,
  error,
  onRefresh,
}: AdminAuthorityPanelProps) {
  const totals = aggregates.reduce(
    (sum, aggregate) => ({
      attempts: sum.attempts + aggregate.attemptCount,
      started: sum.started + aggregate.startedCount,
      finished: sum.finished + aggregate.finishedCount,
      verified: sum.verified + aggregate.verifiedCount,
      rejected: sum.rejected + aggregate.rejectedCount,
      expired: sum.expired + aggregate.expiredCount,
    }),
    { attempts: 0, started: 0, finished: 0, verified: 0, rejected: 0, expired: 0 },
  );
  const authorityStats = [
    [fr.admin.attempts, totals.attempts],
    [fr.admin.started, totals.started],
    [fr.admin.awaitingVerification, totals.finished],
    [fr.admin.verified, totals.verified],
    [fr.admin.rejected, totals.rejected],
    [fr.admin.expired, totals.expired],
  ] as const;

  return (
    <section
      className="authority-tab"
      role="tabpanel"
      id="admin-panel-authority"
      aria-labelledby="admin-tab-authority"
    >
      <AdminErrorNotice message={error} onRetry={onRefresh} retrying={loading} />
      <div className="authority-header">
        <div>
          <h3>{fr.admin.authorityTitle}</h3>
          <p>
            {fr.admin.authorityWindowIntro}{' '}
            {formatAdminCount(
              AUTHORITY_REJECTION_ALERT_POLICY.windowMinutes,
              fr.admin.minute,
              fr.admin.minutes,
            )}
            {fr.admin.authorityWindowSuffix}
          </p>
        </div>
        <button type="button" onClick={onRefresh} disabled={loading}>
          {fr.admin.refresh}
        </button>
      </div>

      {loading ? (
        <div className="loading">{fr.admin.loadingAuthority}</div>
      ) : (
        <>
          {signals.length > 0 ? (
            <div className="authority-alerts" role="alert">
              <strong>{fr.admin.authorityAlert}</strong>
              {signals.map((signal) => (
                <p key={`${signal.engineVersion}-${signal.gameplayRulesetVersion}`}>
                  {signal.engineVersion} / {fr.admin.gameplay} {fr.admin.versionShort}
                  {signal.gameplayRulesetVersion} : {formatAdminPercent(signal.rejectionRate)}{' '}
                  {fr.admin.rejectionRate} ({formatAdminNumber(signal.rejectedCount)}/
                  {formatAdminNumber(signal.attemptCount)}) —{' '}
                  {signal.reasons.map((reason) => fr.admin.authorityReasons[reason]).join(', ')}
                  {signal.unknownCodes.length > 0
                    ? ` — ${fr.admin.newCodes} : ${signal.unknownCodes.join(', ')}`
                    : ''}
                </p>
              ))}
            </div>
          ) : (
            <p className="authority-ok" role="status">
              {fr.admin.authorityNoAlert}
            </p>
          )}

          <div className="stats-grid authority-stats">
            {authorityStats.map(([label, value]) => (
              <div className="stat-card" key={label}>
                <div className="stat-value">{formatAdminNumber(value)}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
          </div>

          <div className="authority-rejections-header">
            <h4>
              {formatAdminNumber(20)} {fr.admin.latestRejections}
            </h4>
            <span>
              {formatAdminCount(
                rejections.length,
                fr.admin.displayedRejection,
                fr.admin.displayedRejections,
              )}
            </span>
          </div>
          <div className="runs-table-container">
            <table className="runs-table">
              <caption className="sr-only">{fr.admin.authorityRejectionsCaption}</caption>
              <thead>
                <tr>
                  <th scope="col">{fr.admin.date}</th>
                  <th scope="col">{fr.admin.attempt}</th>
                  <th scope="col">{fr.admin.engine}</th>
                  <th scope="col">{fr.admin.gameplay}</th>
                  <th scope="col">{fr.admin.code}</th>
                </tr>
              </thead>
              <tbody>
                {rejections.map((rejection) => (
                  <tr key={rejection.attemptId}>
                    <td>{formatAdminDate(rejection.rejectedAt)}</td>
                    <td>
                      <code>{rejection.attemptId}</code>
                    </td>
                    <td>{rejection.engineVersion}</td>
                    <td>
                      {fr.admin.versionShort}
                      {rejection.gameplayRulesetVersion}
                    </td>
                    <td>
                      <code>{rejection.rejectionCode}</code>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rejections.length === 0 && <div className="no-data">{fr.admin.noRejections}</div>}
          </div>

          <AdminFieldCalibrationPanel
            fieldCohorts={fieldCohorts}
            championCohorts={fieldChampionCohorts}
            augmentCohorts={fieldAugmentCohorts}
          />
        </>
      )}
    </section>
  );
}
