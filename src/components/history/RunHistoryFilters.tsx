import { Button } from '@/components/ui';
import { fr } from '@/i18n/fr';
import { runHistoryCopy as copy } from '@/i18n/runHistoryContent';
import type { RunHistoryFilters as Filters } from '@/services/interfaces/IRunRepository';
import '@/styles/run-history.css';

export function RunHistoryFilters({
  value,
  onChange,
}: {
  value: Filters;
  onChange: (filters: Filters) => void;
}) {
  const update = (key: keyof Filters, next: string) => {
    const updated = { ...value };
    if (!next) delete updated[key];
    else if (key === 'gameplayRulesetVersion' || key === 'progressionRulesetVersion') {
      const version = Number(next);
      if (!Number.isInteger(version) || version < 1 || version > 32767) return;
      updated[key] = version;
    } else Object.assign(updated, { [key]: next });
    onChange(updated);
  };

  return (
    <fieldset className="run-history-filters">
      <legend>{copy.filters}</legend>
      <label>
        {copy.outcome}
        <select
          value={value.outcome ?? ''}
          onChange={(event) => update('outcome', event.target.value)}
        >
          <option value="">{copy.all}</option>
          <option value="victory">{fr.common.victory}</option>
          <option value="defeat">{fr.common.defeat}</option>
        </select>
      </label>
      <label>
        {copy.difficulty}
        <select
          value={value.difficulty ?? ''}
          onChange={(event) => update('difficulty', event.target.value)}
        >
          <option value="">{copy.all}</option>
          {(['easy', 'normal', 'hard'] as const).map((difficulty) => (
            <option key={difficulty} value={difficulty}>
              {fr.profile.difficulties[difficulty]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {copy.mode}
        <select value={value.mode ?? ''} onChange={(event) => update('mode', event.target.value)}>
          <option value="">{copy.all}</option>
          {(['normal', 'daily'] as const).map((mode) => (
            <option key={mode} value={mode}>
              {fr.profile.modes[mode]}
            </option>
          ))}
        </select>
      </label>
      <label>
        {copy.engine}
        <input
          type="search"
          maxLength={100}
          value={value.engineVersion ?? ''}
          onChange={(event) => update('engineVersion', event.target.value)}
        />
      </label>
      <label>
        {copy.gameplayRuleset}
        <input
          type="number"
          min={1}
          max={32767}
          step={1}
          value={value.gameplayRulesetVersion ?? ''}
          onChange={(event) => update('gameplayRulesetVersion', event.target.value)}
        />
      </label>
      <label>
        {copy.progressionRuleset}
        <input
          type="number"
          min={1}
          max={32767}
          step={1}
          value={value.progressionRulesetVersion ?? ''}
          onChange={(event) => update('progressionRulesetVersion', event.target.value)}
        />
      </label>
      <Button variant="ghost" onClick={() => onChange({})}>
        {copy.reset}
      </Button>
    </fieldset>
  );
}
