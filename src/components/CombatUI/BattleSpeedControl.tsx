import type React from 'react';
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
      {speeds.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => setSpeed(s)}
          role="radio"
          aria-checked={speed === s}
          aria-label={`${fr.combat.speed} ${s}x`}
          className="combat-speed__option"
        >
          {s}x
        </button>
      ))}
    </div>
  );
};
