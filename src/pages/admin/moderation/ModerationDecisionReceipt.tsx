import type { AdminModerationCopy } from '@/i18n/adminModeration';
import { Button } from '@/shared/ui/Controls';
import { moderationUtc } from './ModerationQueue';
import type { AdminModeration } from './useAdminModeration';

export function ModerationDecisionReceipt({
  moderation,
  copy,
}: {
  moderation: AdminModeration;
  copy: AdminModerationCopy;
}) {
  const decision = moderation.decision.state;
  if (!decision) return null;
  if (decision.status === 'sending') return <p role="status">{copy.sending}</p>;
  const { receipt } = decision;
  return (
    <section className="admin-moderation__panel" aria-labelledby="moderation-receipt-heading">
      <h3 id="moderation-receipt-heading">{copy.receipt}</h3>
      {decision.status === 'unknown' ? (
        <div role="alert">
          <p>{copy.unknown}</p>
          <Button disabled={!moderation.enabled} onClick={() => void moderation.decision.retry()}>
            {copy.retryDecision}
          </Button>
        </div>
      ) : (
        <p role={decision.status === 'done' ? 'status' : 'alert'}>
          {decision.status === 'done'
            ? copy.saved
            : receipt?.code === 'rate_limited'
              ? copy.limited
              : [
                    'report_not_open',
                    'score_already_invalidated',
                    'target_mismatch',
                    'period_mismatch',
                    'request_conflict',
                  ].includes(receipt?.code ?? '')
                ? copy.conflict
                : copy.rejected}
        </p>
      )}
      <dl className="admin-moderation__facts">
        <div>
          <dt>{copy.requestId}</dt>
          <dd>
            <code>{decision.request.p_request_id}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.targetId}</dt>
          <dd>
            <code>{decision.request.p_confirmed_daily_run_id}</code>
          </dd>
        </div>
        <div>
          <dt>{copy.dailyDate}</dt>
          <dd>
            <time dateTime={decision.request.p_confirmed_daily_date}>
              {decision.request.p_confirmed_daily_date}
            </time>
          </dd>
        </div>
        <div>
          <dt>{copy.action}</dt>
          <dd>{copy[decision.request.p_action]}</dd>
        </div>
        {receipt && (
          <>
            <div>
              <dt>{copy.auditId}</dt>
              <dd>
                <code>{receipt.auditId}</code>
              </dd>
            </div>
            <div>
              <dt>{copy.code}</dt>
              <dd>
                <code>{receipt.code}</code>
              </dd>
            </div>
            <div>
              <dt>{copy.decidedAt}</dt>
              <dd>
                <time dateTime={receipt.occurredAt}>{moderationUtc(receipt.occurredAt)}</time>
              </dd>
            </div>
          </>
        )}
      </dl>
    </section>
  );
}
