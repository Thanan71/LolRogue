import { DDRAGON_CONFIG } from '@/config/ddragon';
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag, formatNumber } from '@/i18n/format';
import { runPreparationCopy } from '@/i18n/runPreparationContent';
import type { Champion } from '@/types/champion';
import { applyLocalImageFallback } from '@/utils/imageFallback';
import { gameStatsAtLevel } from '@/utils/statConversion';

const starterCopy = runPreparationCopy.starter;

export function ChampionCard({
  champion,
  selected,
  disabled,
  onSelect,
}: {
  champion: Champion;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const localizedChampion = localizeChampion(champion);
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  const statRows: { label: string; value: number }[] = [
    { label: starterCopy.statLabels.hp, value: gameStats.hp },
    { label: starterCopy.statLabels.attack, value: gameStats.atk },
    { label: starterCopy.statLabels.defense, value: gameStats.def },
    { label: starterCopy.statLabels.abilityPower, value: gameStats.ap },
    { label: starterCopy.statLabels.speed, value: gameStats.spd },
    { label: starterCopy.statLabels.critical, value: gameStats.crit },
  ];

  return (
    <div
      className={`champion-card${selected ? ' champion-card--selected' : ''}`}
      data-disabled={disabled}
    >
      <div className="champion-card__splash-wrapper">
        <picture>
          <source media="(max-width: 700px)" srcSet={champion.iconUrl} />
          <img
            className="champion-card__splash"
            src={splashUrl}
            alt={localizedChampion.name}
            loading="lazy"
            width={1215}
            height={717}
            decoding="async"
            onError={(event) => {
              applyLocalImageFallback(event.currentTarget, champion.iconUrl);
            }}
          />
        </picture>
        <div className="champion-card__splash-overlay" />
      </div>

      <div id={`starter-info-${champion.id}`} className="champion-card__info">
        <div className="champion-card__name">{localizedChampion.name}</div>
        <div className="champion-card__title-text">{localizedChampion.title}</div>

        <div className="champion-card__tags">
          {champion.tags.map((tag) => (
            <span key={tag} className={`champion-card__tag champion-card__tag--${tag}`}>
              {formatChampionTag(tag)}
            </span>
          ))}
        </div>

        <div className="champion-card__stats">
          {statRows.map((row) => (
            <div key={row.label} className="champion-card__stat">
              <span className="champion-card__stat-label">{row.label}</span>
              <span className="champion-card__stat-value">{formatNumber(row.value)}</span>
            </div>
          ))}
        </div>
      </div>
      <button
        type="button"
        id={`starter-choice-${champion.id}`}
        className="champion-card__action"
        onClick={onSelect}
        disabled={disabled}
        aria-pressed={selected}
        aria-label={starterCopy.chooseChampion(localizedChampion.name)}
        aria-describedby={`starter-info-${champion.id}`}
        data-selected-label={selected ? starterCopy.selectedChampionBadge : undefined}
      />
    </div>
  );
}
