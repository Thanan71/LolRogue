import type React from 'react';
import { fr } from '@/i18n/fr';
import type { CombatantInfo } from '../../stores/battleStore';

interface Props {
  champion: CombatantInfo | undefined;
  side: 'player' | 'enemy' | null;
}

export const TurnIndicator: React.FC<Props> = ({ champion, side }) => {
  if (!champion || !side) {
    return <div className="combat-turn combat-turn--waiting">{fr.combat.waiting}</div>;
  }

  return (
    <div className={`combat-turn combat-turn--${side}`}>
      <div className="combat-turn__dot" />
      <div>
        <div className="combat-turn__side">
          {side === 'player' ? fr.combat.yourTurn : fr.combat.enemy}
        </div>
        <div className="combat-turn__champion">{champion.name}</div>
      </div>
    </div>
  );
};
