import type React from 'react';
import type { CSSProperties } from 'react';
import type { CombatantInfo } from '../../stores/battleStore';

interface Props {
  combatant: CombatantInfo;
  isActive: boolean;
  enhancementBonuses?: string[];
  isSelected?: boolean;
  onSelect?: () => void;
}

export const CombatantPortrait: React.FC<Props> = ({
  combatant,
  isActive,
  enhancementBonuses,
  isSelected,
  onSelect,
}) => {
  const { name, level, currentHp, maxHp, currentMp, maxMp, iconUrl, isDefeated, side } = combatant;
  const hpPct = maxHp > 0 ? Math.min(100, Math.max(0, (currentHp / maxHp) * 100)) : 0;
  const mpPct = maxMp > 0 ? Math.min(100, Math.max(0, (currentMp / maxMp) * 100)) : 0;
  const hpAriaMax = Math.max(0, Math.round(maxHp));
  const hpAriaNow = Math.min(hpAriaMax, Math.max(0, Math.round(currentHp)));
  const mpAriaMax = Math.max(0, Math.round(maxMp));
  const mpAriaNow = Math.min(mpAriaMax, Math.max(0, Math.round(currentMp)));
  const className = [
    'combatant-portrait',
    `combatant-portrait--${side}`,
    isActive && 'combatant-portrait--active',
    isSelected && 'combatant-portrait--selected',
    isDefeated && 'combatant-portrait--defeated',
    onSelect && 'combatant-portrait--selectable',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={className}
      role={onSelect ? 'button' : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isSelected : undefined}
      aria-label={onSelect ? `Cibler ${name}` : undefined}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (onSelect && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          event.stopPropagation();
          onSelect();
        }
      }}
    >
      <div className="combatant-portrait__avatar">
        {iconUrl ? (
          <img
            src={iconUrl}
            alt=""
            width={48}
            height={48}
            decoding="async"
            className="combatant-portrait__image"
            onError={(e) => {
              e.currentTarget.hidden = true;
            }}
          />
        ) : (
          <div className="combatant-portrait__fallback">{name.substring(0, 2).toUpperCase()}</div>
        )}
        <div className="combatant-portrait__level">{level}</div>
        {isDefeated && <div className="combatant-portrait__defeated">&#10005;</div>}
      </div>
      <div className="combatant-portrait__content">
        <div className="combatant-portrait__name">{name}</div>
        <div className="combatant-portrait__meter-wrap">
          <div
            className="combatant-portrait__meter combatant-portrait__meter--health"
            role="progressbar"
            aria-label={`PV de ${name}`}
            aria-valuemin={0}
            aria-valuemax={hpAriaMax}
            aria-valuenow={hpAriaNow}
          >
            <div
              className="combatant-portrait__meter-fill"
              style={{ '--combat-meter-value': `${hpPct}%` } as CSSProperties}
            />
          </div>
          <div className="combatant-portrait__meter-label combatant-portrait__meter-label--health">
            {Math.round(currentHp)} / {Math.round(maxHp)}
          </div>
        </div>
        {maxMp > 0 && (
          <div className="combatant-portrait__meter-wrap">
            <div
              className="combatant-portrait__meter combatant-portrait__meter--mana"
              role="progressbar"
              aria-label={`PM de ${name}`}
              aria-valuemin={0}
              aria-valuemax={mpAriaMax}
              aria-valuenow={mpAriaNow}
            >
              <div
                className="combatant-portrait__meter-fill"
                style={{ '--combat-meter-value': `${mpPct}%` } as CSSProperties}
              />
            </div>
            <div className="combatant-portrait__meter-label combatant-portrait__meter-label--mana">
              {Math.round(currentMp)} / {Math.round(maxMp)}
            </div>
          </div>
        )}
        {enhancementBonuses && enhancementBonuses.length > 0 && (
          <div className="combatant-portrait__bonuses">
            {enhancementBonuses.slice(0, 3).map((bonus, i) => (
              <span key={i} className="combatant-portrait__bonus">
                {bonus}
              </span>
            ))}
            {enhancementBonuses.length > 3 && (
              <span className="combatant-portrait__bonus-overflow">
                +{enhancementBonuses.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
