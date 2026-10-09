import { recruitPreviewCopy } from '@/i18n/encounterContent';
import { formatNumber } from '@/i18n/format';
import { fr, locale } from '@/i18n/fr';
import type { CalculatedStats } from '@/utils/champion';

const PREVIEW_STATS = [
  'hp',
  'mp',
  'attackDamage',
  'abilityPower',
  'armor',
  'magicResist',
  'attackSpeed',
  'crit',
] as const;

export function RecruitStatList({
  stats,
  className,
}: {
  stats: CalculatedStats;
  className: string;
}) {
  return (
    <dl className={className} aria-label={recruitPreviewCopy[locale].stats}>
      {PREVIEW_STATS.map((stat) => (
        <div key={stat}>
          <dt title={fr.stats[stat]}>{fr.stats.short[stat]}</dt>
          <dd data-stat={stat}>
            {stat === 'crit'
              ? formatNumber(stats[stat] / 100, { style: 'percent', maximumFractionDigits: 0 })
              : formatNumber(stats[stat], {
                  minimumFractionDigits: stat === 'attackSpeed' ? 2 : 0,
                  maximumFractionDigits: stat === 'attackSpeed' ? 2 : 0,
                })}
          </dd>
        </div>
      ))}
    </dl>
  );
}
