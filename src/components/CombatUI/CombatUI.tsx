import type React from 'react';
import type { CSSProperties } from 'react';
import { fr } from '@/i18n/fr';
import { useBattleStore } from '../../stores/battleStore';
import { AbilityBar } from './AbilityBar';
import { CombatantPortrait } from './CombatantPortrait';
import { CombatLog } from './CombatLog';
import { TurnIndicator } from './TurnIndicator';

interface Props {
  width?: number;
  height?: number;
  onCast?: (slot: 'Q' | 'W' | 'E' | 'R') => void;
  onNextTurn?: () => void;
}

export const CombatUI: React.FC<Props> = ({ width = 800, height = 600, onCast, onNextTurn }) => {
  const phase = useBattleStore((state) => state.phase);
  const round = useBattleStore((state) => state.round);
  const playerTeam = useBattleStore((state) => state.playerTeam);
  const enemyTeam = useBattleStore((state) => state.enemyTeam);
  const currentTurnChampionId = useBattleStore((state) => state.currentTurnChampionId);
  const currentTurnSide = useBattleStore((state) => state.currentTurnSide);
  const winner = useBattleStore((state) => state.winner);
  const isPlayerTurn = useBattleStore((state) => state.isPlayerTurn);

  const currentChampion = [...playerTeam, ...enemyTeam].find(
    (c) => c.targetId === currentTurnChampionId,
  );

  return (
    <div
      className="combat-overlay"
      style={
        {
          '--combat-overlay-width': `${width}px`,
          '--combat-overlay-height': `${height}px`,
        } as CSSProperties
      }
    >
      {/* Header */}
      <div className="combat-overlay__header">
        <div className="combat-overlay__round">
          {fr.combat.round} {round}
        </div>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <div className="combat-overlay__phase">
          {phase === 'finished' ? (
            <span className={`combat-overlay__result combat-overlay__result--${winner ?? 'enemy'}`}>
              {winner === 'player'
                ? `${fr.common.victory.toUpperCase()} !`
                : winner === 'draw'
                  ? fr.combat.draw
                  : fr.common.defeat.toUpperCase()}
            </span>
          ) : (
            `Phase: ${phase}`
          )}
        </div>
      </div>

      {/* Player team (left) */}
      <div className="combat-overlay__team combat-overlay__team--player">
        <div className="combat-overlay__team-title">{fr.combat.playerTeam}</div>
        {playerTeam.map((c) => (
          <CombatantPortrait
            key={c.targetId}
            combatant={c}
            isActive={c.targetId === currentTurnChampionId}
          />
        ))}
      </div>

      {/* Enemy team (right) */}
      <div className="combat-overlay__team combat-overlay__team--enemy">
        <div className="combat-overlay__team-title">{fr.combat.enemies}</div>
        {enemyTeam.map((c) => (
          <CombatantPortrait
            key={c.targetId}
            combatant={c}
            isActive={c.targetId === currentTurnChampionId}
          />
        ))}
      </div>

      {/* Ability bar (bottom center, only during player turn) */}
      {isPlayerTurn && currentChampion && !currentChampion.isDefeated && (
        <div className="combat-overlay__abilities">
          <AbilityBar champion={currentChampion} onCast={onCast} />
          <div className="combat-overlay__next-row">
            <button type="button" onClick={onNextTurn} className="combat-overlay__next">
              {fr.combat.executeTurn}
            </button>
          </div>
        </div>
      )}

      {/* Combat log (bottom) */}
      <div className="combat-overlay__log">
        <CombatLog />
      </div>
    </div>
  );
};
