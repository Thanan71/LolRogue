import { getAdminBalanceCopy } from '@/i18n/adminBalance';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import type { AdminBalanceDraft } from '../../domain/balance/adminBalanceFilterDraft';
import type { AdminBalance } from '../../hooks/balance/useAdminBalance';

export function AdminBalanceFilters({ balance }: { balance: AdminBalance }) {
  const copy = getAdminBalanceCopy(locale);
  const input = (field: keyof AdminBalanceDraft, label: string, type = 'text') => (
    <label className="admin-balance__field" key={field}>
      {label}
      <input
        type={type}
        value={balance.draft[field]}
        disabled={!balance.enabled}
        aria-invalid={balance.filterError ? true : undefined}
        aria-describedby={balance.filterError ? 'admin-balance-filter-error' : undefined}
        onChange={(event) =>
          balance.changeDraft(field, event.target.value as AdminBalanceDraft[typeof field])
        }
      />
    </label>
  );
  const select = <K extends keyof AdminBalanceDraft>(
    field: K,
    label: string,
    options: readonly (readonly [AdminBalanceDraft[K], string])[],
  ) => (
    <label className="admin-balance__field">
      {label}
      <select
        value={balance.draft[field]}
        disabled={!balance.enabled}
        onChange={(event) => balance.changeDraft(field, event.target.value as AdminBalanceDraft[K])}
      >
        {options.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <form
      aria-label={copy.filters}
      onSubmit={(event) => {
        event.preventDefault();
        balance.apply();
      }}
    >
      <h3>{copy.filters}</h3>
      <div className="admin-balance__filters">
        {input('from', copy.from, 'date')}
        {input('to', copy.to, 'date')}
        {select('mode', copy.mode, [
          ['all', copy.all],
          ['normal', copy.normal],
          ['daily', copy.daily],
        ])}
        {select('difficulty', copy.difficulty, [
          ['all', copy.all],
          ['easy', copy.easy],
          ['normal', copy.standard],
          ['hard', copy.hard],
        ])}
        {input('engineVersion', copy.engine)}
        {input('championId', copy.champion)}
      </div>
      <details className="admin-details">
        <summary>{copy.advanced}</summary>
        <div className="admin-balance__filters">
          {input('gameplayVersion', copy.gameplay, 'number')}
          {input('progressionVersion', copy.progression, 'number')}
          {input('commandVersion', copy.command, 'number')}
          {input('contentHash', copy.contentHash)}
        </div>
      </details>
      <p className="admin-balance__note">{copy.limits}</p>
      {balance.filterError && (
        <p id="admin-balance-filter-error" role="alert">
          {balance.filterError}
        </p>
      )}
      {balance.dirty && <p role="status">{copy.unapplied}</p>}
      <div className="admin-balance__actions">
        <Button type="submit" disabled={!balance.enabled}>
          {copy.apply}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!balance.enabled}
          onClick={balance.reset}
        >
          {copy.reset}
        </Button>
      </div>
    </form>
  );
}
