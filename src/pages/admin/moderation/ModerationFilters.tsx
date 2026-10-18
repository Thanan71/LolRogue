import type { AdminModerationCopy } from '@/i18n/adminModeration';
import { Button } from '@/shared/ui/Controls';
import type { ModerationStatus } from './moderationTypes';
import type { AdminModeration } from './useAdminModeration';

export function ModerationFilters({
  moderation,
  copy,
}: {
  moderation: AdminModeration;
  copy: AdminModerationCopy;
}) {
  const disabled = !moderation.enabled || moderation.decision.locked;
  return (
    <form
      className="admin-moderation__panel"
      aria-label={copy.filters}
      onSubmit={(event) => {
        event.preventDefault();
        moderation.apply();
      }}
    >
      <fieldset disabled={disabled}>
        <legend>{copy.filters}</legend>
        <div className="admin-moderation__filters">
          <label className="admin-moderation__field">
            <span>{copy.status}</span>
            <select
              value={moderation.draft.status}
              onChange={(event) =>
                moderation.changeDraft('status', event.target.value as ModerationStatus)
              }
            >
              {(['open', 'resolved', 'dismissed'] as const).map((status) => (
                <option key={status} value={status}>
                  {copy[status]}
                </option>
              ))}
            </select>
          </label>
          <label className="admin-moderation__field">
            <span>{copy.from}</span>
            <input
              type="date"
              value={moderation.draft.from}
              onChange={(event) => moderation.changeDraft('from', event.target.value)}
            />
          </label>
          <label className="admin-moderation__field">
            <span>{copy.to}</span>
            <input
              type="date"
              value={moderation.draft.to}
              onChange={(event) => moderation.changeDraft('to', event.target.value)}
            />
          </label>
          <label className="admin-moderation__field">
            <span>{copy.target}</span>
            <input
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={copy.optional}
              value={moderation.draft.dailyRunId}
              onChange={(event) => moderation.changeDraft('dailyRunId', event.target.value)}
            />
          </label>
        </div>
        <div className="admin-moderation__actions">
          <Button type="submit">{copy.apply}</Button>
          <Button variant="secondary" onClick={moderation.reset}>
            {copy.reset}
          </Button>
        </div>
      </fieldset>
      {moderation.filterError && <p role="alert">{moderation.filterError}</p>}
      {moderation.dirty && <p role="status">{copy.unapplied}</p>}
    </form>
  );
}
