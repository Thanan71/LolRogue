import type { ChangeEvent } from 'react';
import { getAdminDiagnosticsCopy } from '@/i18n/adminDiagnostics';
import { locale } from '@/i18n/fr';
import { Button } from '@/shared/ui/Controls';
import {
  DIAGNOSTICS_LEVELS,
  DIAGNOSTICS_OPERATIONS,
  DIAGNOSTICS_STATUSES,
} from '../../domain/diagnostics/adminDiagnosticsValidation';
import type { AdminDiagnostics } from '../../hooks/diagnostics/useAdminDiagnostics';

export function DiagnosticsFilters({
  diagnostics,
  tab,
}: {
  diagnostics: AdminDiagnostics;
  tab: 'logs' | 'authority';
}) {
  const copy = getAdminDiagnosticsCopy(locale);
  const { draft, change } = diagnostics;
  const text =
    (
      key:
        | 'from'
        | 'to'
        | 'correlationId'
        | 'attemptId'
        | 'engineVersion'
        | 'gameplayRulesetVersion'
        | 'rejectionCode',
    ) =>
    (event: ChangeEvent<HTMLInputElement>) =>
      change(key, event.target.value);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        diagnostics.apply();
      }}
    >
      <fieldset disabled={!diagnostics.enabled}>
        <legend>{copy.filters}</legend>
        <div className="admin-diagnostics__filters">
          <label>
            {copy.from}
            <input type="date" value={draft.from} onChange={text('from')} required />
          </label>
          <label>
            {copy.to}
            <input type="date" value={draft.to} onChange={text('to')} required />
          </label>
          {tab === 'logs' ? (
            <>
              <label>
                {copy.level}
                <select
                  value={draft.level}
                  onChange={(e) =>
                    change(
                      'level',
                      DIAGNOSTICS_LEVELS.find((value) => value === e.target.value) ?? 'all',
                    )
                  }
                >
                  <option value="all">{copy.all}</option>
                  {DIAGNOSTICS_LEVELS.map((value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.operation}
                <select
                  value={draft.operation}
                  onChange={(e) =>
                    change(
                      'operation',
                      DIAGNOSTICS_OPERATIONS.find((value) => value === e.target.value) ?? 'all',
                    )
                  }
                >
                  <option value="all">{copy.all}</option>
                  {DIAGNOSTICS_OPERATIONS.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.correlationId}
                <input
                  value={draft.correlationId}
                  maxLength={36}
                  placeholder={copy.optional}
                  onChange={text('correlationId')}
                />
              </label>
              <label>
                {copy.attemptId}
                <input
                  value={draft.attemptId}
                  maxLength={36}
                  placeholder={copy.optional}
                  onChange={text('attemptId')}
                />
              </label>
            </>
          ) : (
            <>
              <label>
                {copy.engineVersion}
                <input
                  value={draft.engineVersion}
                  maxLength={64}
                  placeholder={copy.optional}
                  onChange={text('engineVersion')}
                />
              </label>
              <label>
                {copy.rulesetVersion}
                <input
                  inputMode="numeric"
                  value={draft.gameplayRulesetVersion}
                  maxLength={10}
                  placeholder={copy.optional}
                  onChange={text('gameplayRulesetVersion')}
                />
              </label>
              <label>
                {copy.status}
                <select
                  value={draft.status}
                  onChange={(e) =>
                    change(
                      'status',
                      DIAGNOSTICS_STATUSES.find((value) => value === e.target.value) ?? 'all',
                    )
                  }
                >
                  <option value="all">{copy.all}</option>
                  {DIAGNOSTICS_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {copy[value]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {copy.rejectionCode}
                <input
                  value={draft.rejectionCode}
                  maxLength={96}
                  placeholder={copy.optional}
                  onChange={text('rejectionCode')}
                />
              </label>
              <label>
                {copy.granularity}
                <select
                  value={draft.granularity}
                  onChange={(e) =>
                    change('granularity', e.target.value === 'hour' ? 'hour' : 'day')
                  }
                >
                  <option value="hour">{copy.hour}</option>
                  <option value="day">{copy.day}</option>
                </select>
              </label>
            </>
          )}
        </div>
        <div className="admin-diagnostics__actions">
          <Button type="submit">{copy.apply}</Button>
          <Button type="button" variant="secondary" onClick={diagnostics.reset}>
            {copy.reset}
          </Button>
        </div>
      </fieldset>
      {diagnostics.error && <p role="alert">{diagnostics.error}</p>}
      {diagnostics.unapplied && <p role="status">{copy.unapplied}</p>}
    </form>
  );
}
