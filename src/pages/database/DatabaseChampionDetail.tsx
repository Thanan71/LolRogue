import { DDRAGON_CONFIG } from '@/config/ddragon';
import {
  isPassiveCombatReady,
  isSpellCombatReady,
  UNAVAILABLE_COMBAT_DESCRIPTION,
} from '@/game/battle/combatContentSupport';
import { formatChampionTag } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import type { Champion } from '@/types/champion';
import { applyLocalImageFallback } from '@/utils/imageFallback';
import { gameStatsAtLevel } from '@/utils/statConversion';
import { stripMarkup } from '@/utils/text';

export function DatabaseChampionDetail({ champion }: { champion: Champion }) {
  const gameStats = gameStatsAtLevel(champion.stats, 1);
  const splashUrl = DDRAGON_CONFIG.championSplashUrl(champion.id);

  return (
    <div className="champion-detail">
      <div className="champion-detail-header">
        <img
          src={splashUrl}
          alt={champion.name}
          className="champion-detail-image"
          width={1215}
          height={717}
          decoding="async"
          onError={(e) => {
            applyLocalImageFallback(e.currentTarget, champion.iconUrl, true);
          }}
        />
        <div className="champion-detail-info">
          <h2>{champion.name}</h2>
          <p className="champion-detail-title">{champion.title}</p>
          <div className="champion-tags">
            {champion.tags.map((tag) => (
              <span key={tag} className="champion-tag">
                {formatChampionTag(tag)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <h3 className="section-title">{fr.database.stats}</h3>
      <div className="stats-grid">
        {[
          { label: 'PV', value: gameStats.hp },
          { label: 'ATK', value: gameStats.atk },
          { label: 'DEF', value: gameStats.def },
          { label: 'AP', value: gameStats.ap },
          { label: 'VIT', value: gameStats.spd },
          { label: 'CRIT', value: gameStats.crit },
        ].map((s) => (
          <div key={s.label} className="stat-block">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <h3 className="section-title">{fr.database.abilities}</h3>
      <div className="abilities-list">
        {champion.spells.map((spell) => (
          <div key={spell.id} className="ability-card">
            <div className="ability-name">{spell.name}</div>
            <div className="ability-description">
              {isSpellCombatReady(spell)
                ? stripMarkup(spell.description)
                : UNAVAILABLE_COMBAT_DESCRIPTION}
            </div>
          </div>
        ))}
        <div className="ability-card">
          <div className="ability-name">
            {fr.database.passive} : {champion.passive.name}
          </div>
          <div className="ability-description">
            {isPassiveCombatReady(champion.id, champion.passive)
              ? stripMarkup(champion.passive.description)
              : UNAVAILABLE_COMBAT_DESCRIPTION}
          </div>
        </div>
      </div>
    </div>
  );
}
