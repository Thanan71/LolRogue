import type { AdminModerationCopy } from '@/i18n/adminModeration';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import { AdminSectionFeedback } from '../AdminSectionFeedback';
import type { AdminModeration } from '../../hooks/moderation/useAdminModeration';

export function moderationUtc(value: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(new Date(value));
}

export function ModerationQueue({
  moderation,
  copy,
}: {
  moderation: AdminModeration;
  copy: AdminModerationCopy;
}) {
  const { queue } = moderation;
  const disabled =
    !moderation.enabled || moderation.decision.locked || queue.loading || queue.stale;
  return (
    <section className="admin-moderation__panel" aria-labelledby="moderation-queue-heading">
      <h3 id="moderation-queue-heading">{copy.queue}</h3>
      <p className="admin-moderation__metadata">{copy.queueScope}</p>
      <p className="admin-moderation__metadata">
        {moderation.applied.from || moderation.applied.to
          ? `${moderation.applied.from || '…'} – ${moderation.applied.to || '…'} (${copy.utc})`
          : copy.allDates}
        {moderation.applied.dailyRunId && (
          <>
            {' '}
            · <code>{moderation.applied.dailyRunId}</code>
          </>
        )}
        {' · '}
        {copy[moderation.applied.status]}
      </p>
      <AdminSectionFeedback state={queue} />
      {queue.loading && !queue.hasData && <p role="status">{copy.loading}</p>}
      {queue.error && (
        <div role="alert">
          <p>{copy.failed}</p>
          <Button
            onClick={() => void queue.reload()}
            disabled={!moderation.enabled || queue.loading}
          >
            {copy.retry}
          </Button>
        </div>
      )}
      {queue.stale && <p className="admin-moderation__notice">{copy.stale}</p>}
      {queue.data && (
        <>
          <p>
            {copy.displayed}: <strong>{queue.data.rows.length}</strong> · {copy.total}:{' '}
            <strong>{queue.data.total}</strong>
          </p>
          <p>
            {(['open', 'resolved', 'dismissed'] as const)
              .map((status) => `${copy[status]}: ${queue.data?.counts[status]}`)
              .join(' · ')}
          </p>
          {queue.data.rows.length ? (
            <div
              className="admin-moderation__scroll"
              role="region"
              aria-label={copy.queueTable}
              tabIndex={0}
            >
              <table className="admin-moderation__table">
                <caption>{copy.queue}</caption>
                <thead>
                  <tr>
                    <th scope="col">{copy.created}</th>
                    <th scope="col">{copy.dailyDate}</th>
                    <th scope="col">{copy.score}</th>
                    <th scope="col">{copy.reason}</th>
                    <th scope="col">{copy.status}</th>
                    <th scope="col">{copy.action}</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.data.rows.map((report) => (
                    <tr key={report.reportId}>
                      <td>
                        <time dateTime={report.createdAt}>{moderationUtc(report.createdAt)}</time>
                      </td>
                      <td>
                        <time dateTime={report.target.dailyDate}>{report.target.dailyDate}</time>
                      </td>
                      <td>{new Intl.NumberFormat(locale).format(report.target.score)}</td>
                      <td>{report.reason}</td>
                      <td>{copy[report.status]}</td>
                      <td>
                        <Button
                          variant="secondary"
                          disabled={disabled}
                          onClick={() => moderation.select(report)}
                          aria-label={`${copy.view} ${report.reportId}`}
                        >
                          {copy.view}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p>{copy.empty}</p>
          )}
          <nav className="admin-moderation__actions" aria-label={copy.queue}>
            <Button
              variant="secondary"
              disabled={disabled || moderation.queuePage === 1}
              onClick={() => moderation.navigateQueue('previous')}
            >
              {copy.previous}
            </Button>
            <span>
              {copy.page} {moderation.queuePage}
            </span>
            <Button
              variant="secondary"
              disabled={disabled || !queue.data.nextCursor}
              onClick={() => moderation.navigateQueue('next')}
            >
              {copy.next}
            </Button>
          </nav>
        </>
      )}
    </section>
  );
}
