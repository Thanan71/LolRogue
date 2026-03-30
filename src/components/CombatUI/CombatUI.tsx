import React from 'react';
import { useBattleStore } from '../../stores/battleStore';
import { CombatantPortrait } from './CombatantPortrait';
import { AbilityBar } from './AbilityBar';
import { TurnIndicator } from './TurnIndicator';
import { CombatLog } from './CombatLog';

interface Props {
  width?: number;
  height?: number;
  onCast?: (slot: 'Q' | 'W' | 'E' | 'R') => void;
  onNextTurn?: () => void;
}

export const CombatUI: React.FC<Props> = ({ width = 800, height = 600, onCast, onNextTurn }) => {
  const { phase, round, playerTeam, enemyTeam, currentTurnChampionId, currentTurnSide, winner, isPlayerTurn } = useBattleStore();

  const currentChampion = [...playerTeam, ...enemyTeam].find(c => c.id === currentTurnChampionId);

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width, height, pointerEvents: 'none', fontFamily: "'Segoe UI', sans-serif", color: '#fff', zIndex: 10 }}>
      {/* Header */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 14px', background: 'linear-gradient(180deg, rgba(10,10,26,0.9) 0%, rgba(10,10,26,0) 100%)', pointerEvents: 'auto' }}>
        <div style={{ fontSize: 13, color: '#ffd700', fontWeight: 'bold' }}>Round {round}</div>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <div style={{ fontSize: 13, color: '#aaa' }}>
          {phase === 'finished' ? (
            <span style={{ color: winner === 'player' ? '#22c55e' : winner === 'draw' ? '#ffd700' : '#ef4444', fontWeight: 'bold' }}>
              {winner === 'player' ? 'VICTOIRE !' : winner === 'draw' ? 'EGALITE' : 'DEFAITE'}
            </span>
          ) : `Phase: ${phase}`}
        </div>
      </div>

      {/* Player team (left) */}
      <div style={{ position: 'absolute', left: 10, top: 55, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#3b82f6', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1 }}>YOUR TEAM</div>
        {playerTeam.map(c => <CombatantPortrait key={c.id} combatant={c} isActive={c.id === currentTurnChampionId} />)}
      </div>

      {/* Enemy team (right) */}
      <div style={{ position: 'absolute', right: 10, top: 55, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', pointerEvents: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 'bold', color: '#ef4444', marginBottom: 2, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'right' }}>ENEMY TEAM</div>
        {enemyTeam.map(c => <CombatantPortrait key={c.id} combatant={c} isActive={c.id === currentTurnChampionId} />)}
      </div>

      {/* Ability bar (bottom center, only during player turn) */}
      {isPlayerTurn && currentChampion && !currentChampion.isDefeated && (
        <div style={{ position: 'absolute', bottom: 170, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <AbilityBar champion={currentChampion} onCast={onCast} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onNextTurn} style={{ padding: '6px 14px', background: '#1a1a2e', color: '#ffd700', border: '1px solid #333355', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 'bold' }}>Next Turn</button>
          </div>
        </div>
      )}

      {/* Combat log (bottom) */}
      <div style={{ position: 'absolute', bottom: 8, left: 8, right: 8, height: 140, pointerEvents: 'auto' }}>
        <CombatLog />
      </div>
    </div>
  );
};
