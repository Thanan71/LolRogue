import { useEffect, useRef, useState } from 'react';
import type { AdminModerationCopy } from '@/i18n/adminModeration';
import { Button } from '@/shared/ui/Controls';
import type {
  ModerationAction,
  ModerationDecisionRequest,
  ModerationQueueRow,
} from '../../domain/moderation/moderationTypes';
import {
  normalizeModerationReason,
  validateModerationDecision,
} from '../../domain/moderation/moderationValidation';
import type { AdminModeration } from '../../hooks/moderation/useAdminModeration';

export function ModerationDecisionForm({
  moderation,
  report,
  copy,
}: {
  moderation: AdminModeration;
  report: ModerationQueueRow;
  copy: AdminModerationCopy;
}) {
  const [reason, setReason] = useState('');
  const [action, setAction] = useState<ModerationAction>('dismiss_report');
  const [staged, setStaged] = useState<ModerationDecisionRequest | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const focusedRequestId = useRef<string | null>(null);
  const stagedId = staged?.p_request_id;
  const enabled = moderation.enabled;
  const allowed =
    moderation.enabled &&
    !moderation.decision.locked &&
    report.status === 'open' &&
    moderation.queue.hasData &&
    !moderation.queue.loading &&
    !moderation.queue.stale &&
    moderation.history.hasData &&
    !moderation.history.loading &&
    !moderation.history.stale;
  const canInvalidate = report.target.completedAt !== null && report.target.invalidatedAt === null;
  const characters = [...reason.trim()].length;
  useEffect(() => {
    if (!stagedId) focusedRequestId.current = null;
    else if (enabled && focusedRequestId.current !== stagedId) {
      confirmationHeading.current?.focus();
      focusedRequestId.current = stagedId;
    }
  }, [stagedId, enabled]);
  const prepare = () => {
    if (!allowed || (action === 'invalidate_score' && !canInvalidate)) return;
    try {
      const request = validateModerationDecision({
        p_request_id: crypto.randomUUID(),
        p_report_id: report.reportId,
        p_confirmed_daily_run_id: report.dailyRunId,
        p_confirmed_daily_date: report.target.dailyDate,
        p_action: action,
        p_reason: normalizeModerationReason(reason),
        p_scope: 'daily_score',
      });
      moderation.decision.clear();
      setStaged(request);
      setConfirmation('');
    } catch {
      /* The disabled preparation button and server validation share the same bounds. */
    }
  };
  if (
    moderation.decision.state?.status === 'unknown' ||
    moderation.decision.state?.status === 'sending'
  )
    return null;
  if (report.status !== 'open') return <p>{copy.noActions}</p>;
  return (
    <div className="admin-moderation__decision">
      {!staged ? (
        <form
          aria-label={copy.prepare}
          onSubmit={(event) => {
            event.preventDefault();
            prepare();
          }}
        >
          <fieldset disabled={!allowed}>
            <legend>{copy.prepare}</legend>
            <label className="admin-moderation__field">
              <span>{copy.action}</span>
              <select
                value={action}
                onChange={(event) => setAction(event.target.value as ModerationAction)}
              >
                <option value="dismiss_report">{copy.dismiss_report}</option>
                <option value="invalidate_score" disabled={!canInvalidate}>
                  {copy.invalidate_score}
                </option>
              </select>
            </label>
            <label className="admin-moderation__field">
              <span>{copy.decisionReason}</span>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-describedby="moderation-reason-help"
                required
              />
            </label>
            <p id="moderation-reason-help" className="admin-moderation__metadata">
              {copy.reasonHelp} ({characters}/500)
            </p>
            <Button type="submit" disabled={characters < 10 || characters > 500}>
              {copy.prepare}
            </Button>
          </fieldset>
        </form>
      ) : (
        <section className="admin-moderation__panel" aria-labelledby="moderation-confirm-heading">
          <h4 id="moderation-confirm-heading" ref={confirmationHeading} tabIndex={-1}>
            {copy.confirmTitle}
          </h4>
          <dl className="admin-moderation__facts">
            <div>
              <dt>{copy.action}</dt>
              <dd>{copy[staged.p_action]}</dd>
            </div>
            <div>
              <dt>{copy.targetId}</dt>
              <dd>
                <code>{staged.p_confirmed_daily_run_id}</code>
              </dd>
            </div>
            <div>
              <dt>{copy.dailyDate}</dt>
              <dd>
                <time dateTime={staged.p_confirmed_daily_date}>
                  {staged.p_confirmed_daily_date}
                </time>
              </dd>
            </div>
            <div>
              <dt>{copy.decisionReason}</dt>
              <dd>{staged.p_reason}</dd>
            </div>
          </dl>
          <p>
            <strong>{copy.scope} : </strong>
            {staged.p_action === 'invalidate_score' ? copy.invalidateScope : copy.dismissScope}
          </p>
          <p>
            <strong>{copy.consequences} : </strong>
            {staged.p_action === 'invalidate_score'
              ? copy.invalidateConsequences
              : copy.dismissConsequences}
          </p>
          <label className="admin-moderation__field">
            <span>{copy.typeTarget}</span>
            <input
              value={confirmation}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={!allowed}
            />
          </label>
          <div className="admin-moderation__actions">
            <Button
              variant={staged.p_action === 'invalidate_score' ? 'danger' : 'primary'}
              disabled={!allowed || confirmation !== staged.p_confirmed_daily_run_id}
              onClick={() => {
                if (allowed && confirmation === staged.p_confirmed_daily_run_id)
                  void moderation.decision.send(staged);
              }}
            >
              {copy.confirm}
            </Button>
            <Button variant="secondary" disabled={!allowed} onClick={() => setStaged(null)}>
              {copy.cancel}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
