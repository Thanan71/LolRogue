import { useEffect, useRef } from 'react';
import type { AdminModerationCopy } from '@/i18n/adminModeration';
import { Button } from '@/shared/ui/Controls';
import { AdminSectionFeedback } from '../AdminSectionFeedback';
import { ModerationDecisionForm } from './ModerationDecisionForm';
import { moderationUtc } from './ModerationQueue';
import type { AdminModeration } from '../../hooks/moderation/useAdminModeration';

export function ModerationCase({
  moderation,
  copy,
}: {
  moderation: AdminModeration;
  copy: AdminModerationCopy;
}) {
  const { selected: report, history } = moderation;
  const heading = useRef<HTMLHeadingElement>(null);
  const focusedReportId = useRef<string | null>(null);
  const reportId = report?.reportId;
  const enabled = moderation.enabled;
  useEffect(() => {
    if (!reportId) focusedReportId.current = null;
    else if (enabled && focusedReportId.current !== reportId) {
      heading.current?.focus();
      focusedReportId.current = reportId;
    }
  }, [reportId, enabled]);
  if (!report) return null;
  return (
    <section
      className="admin-moderation__panel admin-moderation__case"
      aria-labelledby="moderation-case-heading"
    >
      <div className="admin-moderation__heading">
        <h3 id="moderation-case-heading" ref={heading} tabIndex={-1}>
          {copy.caseTitle}
        </h3>
        <Button
          variant="secondary"
          disabled={moderation.decision.locked}
          onClick={() => moderation.select(null)}
        >
          {copy.close}
        </Button>
      </div>
      <dl className="admin-moderation__facts">
        <div>
          <dt>{copy.reportId}</dt>
          <dd>
            <code>{report.reportId}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.targetId}</dt>
          <dd>
            <code>{report.dailyRunId}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.dailyDate}</dt>
          <dd>
            <time dateTime={report.target.dailyDate}>{report.target.dailyDate}</time>
          </dd>
        </div>
        <div>
          <dt>{copy.status}</dt>
          <dd>
            {copy[report.status]} · {report.target.invalidatedAt ? copy.invalid : copy.valid}
          </dd>
        </div>
        <div>
          <dt>{copy.reportsForScore}</dt>
          <dd>{report.reportsForScore}</dd>
        </div>
        <div>
          <dt>{copy.reviewed}</dt>
          <dd>
            {report.reviewedAt ? (
              <time dateTime={report.reviewedAt}>{moderationUtc(report.reviewedAt)}</time>
            ) : (
              copy.noReview
            )}
          </dd>
        </div>
      </dl>
      {report.reviewedAt && <p className="admin-moderation__metadata">{copy.reviewedHelp}</p>}
      <p>{report.reason}</p>
      <ModerationDecisionForm
        key={report.reportId}
        moderation={moderation}
        report={report}
        copy={copy}
      />
      <section aria-labelledby="moderation-history-heading">
        <h4 id="moderation-history-heading">{copy.history}</h4>
        <AdminSectionFeedback state={history} />
        {history.loading && !history.hasData && <p role="status">{copy.loading}</p>}
        {history.error && (
          <div role="alert">
            <p>{copy.failed}</p>
            <Button
              disabled={!moderation.enabled || history.loading}
              onClick={() => void history.reload()}
            >
              {copy.retry}
            </Button>
          </div>
        )}
        {history.stale && <p className="admin-moderation__notice">{copy.stale}</p>}
        {history.data && (
          <>
            <p>
              {copy.displayed}: {history.data.rows.length} · {copy.total}: {history.data.total}
            </p>
            {history.data.rows.length ? (
              <div
                className="admin-moderation__scroll"
                role="region"
                aria-label={copy.historyTable}
                tabIndex={0}
              >
                <table className="admin-moderation__table">
                  <caption>{copy.history}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{copy.decidedAt}</th>
                      <th scope="col">{copy.action}</th>
                      <th scope="col">{copy.outcome}</th>
                      <th scope="col">{copy.decisionReason}</th>
                      <th scope="col">{copy.actor}</th>
                      <th scope="col">{copy.auditId}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.data.rows.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <time dateTime={row.occurredAt}>{moderationUtc(row.occurredAt)}</time>
                        </td>
                        <td>
                          {row.action === 'invalidate_score' || row.action === 'dismiss_report'
                            ? copy[row.action]
                            : row.action}
                        </td>
                        <td>
                          {row.outcome === 'applied' ? copy.appliedLabel : copy.rejectedLabel}
                          <br />
                          <code>{row.code}</code>
                        </td>
                        <td>{row.reason ?? copy.unavailable}</td>
                        <td>{row.actorId ? <code>{row.actorId}</code> : copy.unavailable}</td>
                        <td>
                          <code>{row.id}</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p>{copy.noHistory}</p>
            )}
            <nav className="admin-moderation__actions" aria-label={copy.history}>
              <Button
                variant="secondary"
                disabled={
                  !moderation.enabled ||
                  history.loading ||
                  history.stale ||
                  moderation.historyPage === 1
                }
                onClick={() => moderation.navigateHistory('previous')}
              >
                {copy.previous}
              </Button>
              <span>
                {copy.page} {moderation.historyPage}
              </span>
              <Button
                variant="secondary"
                disabled={
                  !moderation.enabled ||
                  history.loading ||
                  history.stale ||
                  !history.data.nextCursor
                }
                onClick={() => moderation.navigateHistory('next')}
              >
                {copy.next}
              </Button>
            </nav>
          </>
        )}
      </section>
    </section>
  );
}
