import type React from 'react';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import { type BattleSpeed, useSettingsStore } from '../../stores/settingsStore';

export const BattleSpeedControl: React.FC = () => {
  const speed = useSettingsStore((s) => s.battleSpeed);
  const setSpeed = useSettingsStore((s) => s.setBattleSpeed);

  const speeds: BattleSpeed[] = [1, 2, 3];

  return (
    <div role="radiogroup" aria-label={fr.combat.battleSpeed} className="combat-speed">
      <span aria-hidden="true" className="combat-speed__icon">
        ⚡
      </span>
      {speeds.map((speedOption) => {
        const formattedSpeed = formatNumber(speedOption);
        return (
          <button
            key={speedOption}
            type="button"
            onClick={() => setSpeed(speedOption)}
            role="radio"
            aria-checked={speed === speedOption}
            aria-label={`${fr.combat.speed} ${formattedSpeed}×`}
            className="combat-speed__option"
          >
            {formattedSpeed}×
          </button>
        );
      })}
    </div>
  );
};
