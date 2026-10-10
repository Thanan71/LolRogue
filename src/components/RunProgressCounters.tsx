import { useId } from 'react';
import { formatNumber } from '@/i18n/format';
import {
  getRunProgressContent,
  localizeRunProgressDefinition,
  runProgressBonusText,
  runProgressRules,
  runProgressSummary,
} from '@/i18n/runProgressContent';
import type { RunProgressionDefinition } from '@/types/champion';
import '@/styles/run-progress.css';

interface Props {
  definitions?: readonly RunProgressionDefinition[];
  snapshot?: Readonly<Record<string, number>>;
  variant?: 'compact' | 'full' | 'rules';
}

/** Presentation only: values and definitions come from the combat engine or persisted run. */
export function RunProgressCounters({ definitions, snapshot = {}, variant = 'full' }: Props) {
  const id = useId();
  if (!definitions?.length) return null;
  const content = getRunProgressContent();

  return (
    <div
      className={`run-progress run-progress--${variant}`}
      role={variant === 'compact' ? undefined : 'region'}
      aria-labelledby={variant === 'compact' ? undefined : `${id}-title`}
    >
      {variant !== 'compact' ? <h4 id={`${id}-title`}>{content.heading}</h4> : null}
      {definitions.map((definition) => {
        const localized = localizeRunProgressDefinition(definition);
        const value = snapshot[definition.key] ?? 0;
        const bonus = runProgressBonusText(definition, value);
        const perPointBonus = runProgressBonusText(definition, 1);
        const rules = runProgressRules(definition);
        const summary = runProgressSummary(definition, value);
        return (
          <div
            key={definition.key}
            className="run-progress__counter"
            data-counter-key={definition.key}
            data-counter-value={variant === 'rules' ? undefined : value}
            title={
              variant === 'compact'
                ? `${summary}. ${localized.description} ${rules.join('. ')}. ${content.lifetime}`
                : undefined
            }
          >
            <div className="run-progress__summary">
              <strong>{localized.name}</strong>
              {variant !== 'rules' ? (
                <span className="run-progress__value">
                  {formatNumber(value)}/{formatNumber(definition.cap)}
                </span>
              ) : null}
              {variant !== 'rules' && bonus ? (
                <span className="run-progress__bonus">{bonus}</span>
              ) : null}
            </div>
            {variant !== 'compact' ? (
              <>
                <p>{localized.description}</p>
                <details className="run-progress__rules" open={variant === 'rules'}>
                  <summary>{content.rules}</summary>
                  <ul>
                    {rules.map((rule, index) => (
                      <li key={`${definition.key}-${index}`}>{rule}</li>
                    ))}
                  </ul>
                  <p>
                    {content.cap} : {formatNumber(definition.cap)}.{' '}
                    {perPointBonus ? `${perPointBonus} ${content.perPoint}.` : null}
                  </p>
                  <p>{content.lifetime}</p>
                </details>
              </>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
