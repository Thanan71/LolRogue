import { DDRAGON_CONFIG } from '@/config/ddragon';
import { isPassiveCombatReady, isSpellCombatReady } from '@/game/battle/combatContentSupport';
import { localizeChampion } from '@/i18n/content';
import { formatChampionTag, formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import type { Champion } from '@/types/champion';
import { applyLocalImageFallback } from '@/utils/imageFallback';
import { gameStatsAtLevel } from '@/utils/statConversion';
import { stripMarkup } from '@/utils/text';

export function DatabaseChampionDetail({ champion }: { champion: Champion }) {
  const localizedChampion = localizeChampion(champion);
  const gameStats = gameStatsAtLevel(localizedChampion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(localizedChampion.id);
  const stats = [
    { label: fr.database.statLabels.health, value: gameStats.hp },
    { label: fr.database.statLabels.attack, value: gameStats.atk },
    { label: fr.database.statLabels.defense, value: gameStats.def },
    { label: fr.database.statLabels.abilityPower, value: gameStats.ap },
    { label: fr.database.statLabels.speed, value: gameStats.spd },
    { label: fr.database.statLabels.critical, value: gameStats.crit },
  ];

  return (
    <div className="champion-detail">
      <div className="champion-detail-header">
        <img
          src={splashUrl}
          alt={localizedChampion.name}
          className="champion-detail-image"
          width={1215}
          height={717}
          decoding="async"
          onError={(e) => {
            applyLocalImageFallback(e.currentTarget, localizedChampion.iconUrl, true);
          }}
        />
        <div className="champion-detail-info">
          <h2>{localizedChampion.name}</h2>
          <p className="champion-detail-title">{localizedChampion.title}</p>
          <div className="champion-tags">
            {localizedChampion.tags.map((tag) => (
              <span key={tag} className="champion-tag">
                {formatChampionTag(tag)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <h3 className="section-title">{fr.database.stats}</h3>
      <div className="stats-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="stat-block">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value">{formatNumber(stat.value)}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title">{fr.database.abilities}</h3>
      <div className="abilities-list">
        {localizedChampion.spells.map((spell) => (
          <div key={spell.id} className="ability-card">
            <div className="ability-name">{spell.name}</div>
            <div className="ability-description">
              {isSpellCombatReady(spell)
                ? stripMarkup(spell.description)
                : fr.database.unavailableCombatDescription}
            </div>
          </div>
        ))}
        <div className="ability-card">
          <div className="ability-name">
            {fr.database.passive} : {localizedChampion.passive.name}
          </div>
          <div className="ability-description">
            {isPassiveCombatReady(localizedChampion.id, localizedChampion.passive)
              ? stripMarkup(localizedChampion.passive.description)
              : fr.database.unavailableCombatDescription}
          </div>
        </div>
      </div>
    </div>
  );
}
