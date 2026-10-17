import type { FormEvent } from 'react';
import type { AdminRunExplorerCopy } from '@/i18n/adminRunExplorer';
import type { AdminRunPopulation, AdminRunFilters as Filters } from './adminRunFilters';

const BIOMES = ['top_lane', 'jungle', 'mid_lane', 'bot_lane', 'river', 'base'] as const;

export function AdminRunFilters({
  filters,
  population,
  copy,
  busy,
  error,
  onChange,
  onApply,
  onReset,
}: {
  filters: Filters;
  population: AdminRunPopulation;
  copy: AdminRunExplorerCopy;
  busy: boolean;
  error: string | null;
  onChange: (filters: Filters) => void;
  onApply: () => void;
  onReset: () => void;
}) {
  const attempts = population === 'attempts';
  const update = (field: keyof Filters, value: string) => onChange({ ...filters, [field]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onApply();
  };
  const input = (field: keyof Filters, label: string, type = 'text', disabled = false) => (
    <label key={field} className="admin-explorer-field" htmlFor={`admin-run-${field}`}>
      <span>{label}</span>
      <input
        id={`admin-run-${field}`}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? 1 : undefined}
        value={filters[field]}
        maxLength={type === 'text' ? 100 : undefined}
        disabled={disabled}
        aria-describedby={disabled ? 'admin-attempt-filter-help' : undefined}
        onChange={(event) => update(field, event.target.value)}
      />
    </label>
  );
  const select = (
    field: keyof Filters,
    label: string,
    options: readonly (readonly [string, string])[],
    disabled = false,
  ) => (
    <label key={field} className="admin-explorer-field" htmlFor={`admin-run-${field}`}>
      <span>{label}</span>
      <select
        id={`admin-run-${field}`}
        value={
          attempts && field === 'sortBy'
            ? 'completed_at'
            : attempts && field === 'sortOrder'
              ? 'desc'
              : filters[field]
        }
        disabled={disabled}
        aria-describedby={disabled ? 'admin-attempt-filter-help' : undefined}
        onChange={(event) => update(field, event.target.value)}
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
    <form className="admin-explorer-filters" onSubmit={submit}>
      <fieldset>
        <legend>{copy.filters}</legend>
        <div className="admin-explorer-filter-grid">
          {input('playerId', copy.player)}
          {input('from', copy.from, 'datetime-local')}
          {input('to', copy.to, 'datetime-local')}
          {select('difficulty', copy.difficulty, [
            ['all', copy.all],
            ['easy', copy.easy],
            ['normal', copy.normal],
            ['hard', copy.hard],
          ])}
          {select('mode', copy.mode, [
            ['all', copy.all],
            ['normal', copy.normal],
            ['daily', copy.daily],
          ])}
          {attempts
            ? select('status', copy.status, [
                ['all', copy.all],
                ['started', copy.started],
                ['finished', copy.finished],
                ['verified', copy.verified],
                ['rejected', copy.rejected],
                ['expired', copy.expired],
              ])
            : select('result', copy.result, [
                ['all', copy.all],
                ['won', copy.won],
                ['lost', copy.lost],
              ])}
          {!attempts &&
            select('verification', copy.verification, [
              ['all', copy.all],
              ['verified', copy.verified],
              ['legacy', copy.legacy],
            ])}
          {select(
            'biome',
            copy.biome,
            [['', copy.all], ...BIOMES.map((biome) => [biome, biome] as const)],
            attempts,
          )}
          {input('minWaves', copy.minWaves, 'number', attempts)}
          {input('maxWaves', copy.maxWaves, 'number', attempts)}
          {input('championId', copy.champion)}
        </div>
        <details className="admin-explorer-advanced">
          <summary>{copy.versions}</summary>
          <div className="admin-explorer-filter-grid">
            {input('engineVersion', copy.engine)}
            {input('gameplayVersion', copy.gameplay, 'number')}
            {input('progressionVersion', copy.progression, 'number')}
            {input('ledgerVersion', copy.ledger, 'number', attempts)}
          </div>
        </details>
        <div className="admin-explorer-filter-grid">
          {select(
            'sortBy',
            copy.sort,
            [
              ['completed_at', copy.completedAt],
              ['waves_completed', copy.waves],
              ['run_level', copy.level],
            ],
            attempts,
          )}
          {select(
            'sortOrder',
            copy.order,
            [
              ['desc', copy.descending],
              ['asc', copy.ascending],
            ],
            attempts,
          )}
        </div>
        {attempts && (
          <p id="admin-attempt-filter-help" className="admin-explorer-help">
            {copy.attemptFilters}
          </p>
        )}
        <p className="admin-explorer-help">
          {copy.playerHelp} {copy.privacy}
        </p>
        {error && <p role="alert">{error}</p>}
        <div className="runs-actions">
          <button type="submit" disabled={busy}>
            {copy.apply}
          </button>
          <button type="button" onClick={onReset} disabled={busy}>
            {copy.reset}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
