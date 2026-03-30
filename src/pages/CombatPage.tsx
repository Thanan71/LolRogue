import { useEffect, useMemo, useCallback } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import { useBattleStore } from '@/stores/battleStore';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { ChampionInstance } from '@/game/ChampionInstance';
import { championDB } from '@/data';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { TurnIndicator } from '@/components/CombatUI/TurnIndicator';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { ActionType } from '@/game/battle/types';
import { playUIClick } from '@/audio';

function buildTeamInstances(championIds: string[]): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const id of championIds) {
    const champ = championDB.getById(id);
    if (champ) instances.push(new ChampionInstance(champ));
  }
  return instances;
}

function generateEnemyTeam(round: number): string[] {
  const all = championDB.getAll();
  const count = Math.min(5, 1 + Math.floor(round / 2));
  const shuffled = [...all].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(c => c.id);
}

const SLOT_TO_ACTION: Record<string, ActionType> = {
  Q: ActionType.SpellQ,
  W: ActionType.SpellW,
  E: ActionType.SpellE,
  R: ActionType.SpellR,
};

export function CombatPage() {
  const isActive = useRunStore(s => s.isActive);
  const team = useRunStore(s => s.team);
  const runLevel = useRunStore(s => s.runLevel);
  const navigate = useAppNavigate();

  const battlePhase = useBattleStore(s => s.phase);
  const round = useBattleStore(s => s.round);
  const playerTeam = useBattleStore(s => s.playerTeam);
  const enemyTeam = useBattleStore(s => s.enemyTeam);
  const currentTurnChampionId = useBattleStore(s => s.currentTurnChampionId);
  const currentTurnSide = useBattleStore(s => s.currentTurnSide);
  const winner = useBattleStore(s => s.winner);
  const isPlayerTurn = useBattleStore(s => s.isPlayerTurn);

  useEffect(() => {
    if (!isActive) navigate(ROUTES.STARTER_SELECT);
  }, [isActive, navigate]);

  const playerInstances = useMemo(() => buildTeamInstances(team.map(m => m.championId)), [team]);
  const enemyInstances = useMemo(() => buildTeamInstances(generateEnemyTeam(runLevel)), [runLevel]);

  const handleComplete = useCallback((w: 'player' | 'enemy' | 'draw') => {
    if (w === 'player') {
      // Award gold: 50 + runLevel * 10
      const goldReward = 50 + runLevel * 10;
      useRunStore.getState().addGold(goldReward);
      
      // Advance wave
      useRunStore.getState().nextWave();
      
      // Navigate back to run page
      navigate(ROUTES.RUN);
    } else {
      // On draw or loss, end the run
      useRunStore.getState().endRun(w === 'draw');
      navigate(ROUTES.GAME_OVER);
    }
  }, [runLevel, navigate]);

  const { processTurn, submitAction } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: false,
    onComplete: handleComplete,
  });

  const handleCast = useCallback((slot: 'Q' | 'W' | 'E' | 'R') => {
    const actionType = SLOT_TO_ACTION[slot];
    if (!actionType) return;
    submitAction({ type: actionType, cost: 0 });
  }, [submitAction]);

  const currentChampion = [...playerTeam, ...enemyTeam].find(c => c.id === currentTurnChampionId);
  const currentSpell = currentChampion?.spells;

  // Keyboard shortcuts
  const canCast = isPlayerTurn && battlePhase === 'turn_active';
  const canCastSlot = useCallback((slot: 'Q' | 'W' | 'E' | 'R') => {
    if (!canCast || !currentSpell) return false;
    const sp = currentSpell.find(s => s.slot === slot);
    return !!sp && sp.isReady;
  }, [canCast, currentSpell]);

  useKeyboardShortcuts({
    onCastQ: canCastSlot('Q') ? () => handleCast('Q') : undefined,
    onCastW: canCastSlot('W') ? () => handleCast('W') : undefined,
    onCastE: canCastSlot('E') ? () => handleCast('E') : undefined,
    onCastR: canCastSlot('R') ? () => handleCast('R') : undefined,
    onNextTurn: isPlayerTurn && battlePhase === 'turn_active' ? processTurn : undefined,
    onBack: () => navigate(ROUTES.RUN),
    enabled: battlePhase !== 'finished',
  });

  if (!isActive) return null;

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <button style={backBtnStyle} onClick={() => { playUIClick(); navigate(ROUTES.RUN); }} aria-label="Back to map">← Map</button>
        <span style={{ color: '#c8aa6e', fontWeight: 700 }}>Combat — Round {round}</span>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <BattleSpeedControl />
      </div>

      {/* Main area */}
      <div style={mainStyle}>
        {/* Player team panel */}
        <div style={leftPanelStyle}>
          <div style={teamTitleStyle('#3b82f6')}>Votre équipe</div>
          {playerTeam.map(c => (
            <CombatantPortrait key={c.id} combatant={c} isActive={c.id === currentTurnChampionId} />
          ))}
          {playerTeam.length === 0 && <div style={emptyStyle}>Aucun champion</div>}
        </div>

        {/* Center: battle arena / status */}
        <div style={centerStyle}>
          {battlePhase === 'idle' && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
              <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>Préparation du combat...</div>
            </div>
          )}
          {(battlePhase === 'turn_active' || battlePhase === 'starting' || battlePhase === 'turn_transition') && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16, animation: 'pulse 1.5s infinite' }}>⚔️</div>
              <div style={{ fontSize: 16, color: '#ffd700', fontWeight: 'bold' }}>
                {currentTurnSide === 'player' ? 'À votre tour !' : 'Tour de l\'ennemi...'}
              </div>
              {currentChampion && (
                <div style={{ fontSize: 14, color: '#fff', marginTop: 8 }}>{currentChampion.name}</div>
              )}
              {isPlayerTurn && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={processTurn} style={nextTurnBtnStyle} aria-label="Execute turn (Space)">
                    ▶ Exécuter le tour
                    <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.6 }}>[Space]</span>
                  </button>
                </div>
              )}
            </div>
          )}
          {battlePhase === 'finished' && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>
                {winner === 'player' ? '🏆' : winner === 'draw' ? '🤝' : '💀'}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 'bold',
                color: winner === 'player' ? '#22c55e' : winner === 'draw' ? '#ffd700' : '#ef4444',
                marginBottom: 12,
              }}>
                {winner === 'player' ? 'VICTOIRE !' : winner === 'draw' ? 'ÉGALITÉ' : 'DÉFAITE'}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {winner === 'player' && (
                  <button onClick={() => navigate(ROUTES.RUN)} style={nextBtnStyle}>Continuer →</button>
                )}
                <button onClick={() => navigate(ROUTES.MENU)} style={backBtnStyle2}>Menu</button>
              </div>
            </div>
          )}
        </div>

        {/* Enemy team panel */}
        <div style={rightPanelStyle}>
          <div style={teamTitleStyle('#ef4444')}>Ennemis</div>
          {enemyTeam.map(c => (
            <CombatantPortrait key={c.id} combatant={c} isActive={c.id === currentTurnChampionId} />
          ))}
          {enemyTeam.length === 0 && <div style={emptyStyle}>Aucun ennemi</div>}
        </div>
      </div>

      {/* Bottom: ability bar + log */}
      <div style={bottomStyle}>
        {isPlayerTurn && currentChampion && !currentChampion.isDefeated && (
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
            <AbilityBar champion={currentChampion} onCast={handleCast} />
          </div>
        )}
        <div style={{ flex: 1, minHeight: 0 }}>
          <CombatLog />
        </div>
      </div>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  position: 'absolute', inset: 0,
  background: '#0d1117', color: '#e6edf3',
  fontFamily: 'sans-serif', display: 'flex', flexDirection: 'column',
};

const headerStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 16, padding: '8px 16px',
  background: '#161b22', borderBottom: '1px solid #1e2a3a', flexShrink: 0,
};

const backBtnStyle: React.CSSProperties = {
  padding: '6px 12px', background: '#21262d', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, fontSize: 12, cursor: 'pointer',
};

const mainStyle: React.CSSProperties = {
  flex: 1, display: 'flex', gap: 8, padding: 8, overflow: 'hidden',
};

const leftPanelStyle: React.CSSProperties = {
  width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4,
  background: '#161b22', borderRadius: 8, border: '1px solid #30363d', padding: 8, overflow: 'auto',
};

const rightPanelStyle: React.CSSProperties = {
  width: 220, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 4,
  background: '#161b22', borderRadius: 8, border: '1px solid #30363d', padding: 8, overflow: 'auto',
};

const centerStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column',
};

const teamTitleStyle = (color: string): React.CSSProperties => ({
  fontSize: 11, fontWeight: 'bold', color, textTransform: 'uppercase',
  letterSpacing: 1, marginBottom: 4, paddingBottom: 4, borderBottom: '1px solid #30363d',
});

const emptyStyle: React.CSSProperties = {
  fontSize: 12, color: '#555', textAlign: 'center', padding: 20,
};

const arenaPlaceholderStyle: React.CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  background: '#161b22', borderRadius: 8, border: '1px solid #30363d',
};

const nextTurnBtnStyle: React.CSSProperties = {
  padding: '8px 20px', background: '#c89033', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 'bold', cursor: 'pointer',
};

const nextBtnStyle: React.CSSProperties = {
  padding: '10px 24px', background: '#22c55e', color: '#fff',
  border: 'none', borderRadius: 6, fontSize: 14, fontWeight: 'bold', cursor: 'pointer',
};

const backBtnStyle2: React.CSSProperties = {
  padding: '10px 24px', background: '#21262d', color: '#e6edf3',
  border: '1px solid #30363d', borderRadius: 6, fontSize: 14, cursor: 'pointer',
};

const bottomStyle: React.CSSProperties = {
  height: 220, display: 'flex', flexDirection: 'column',
  padding: '0 8px 8px', flexShrink: 0,
};
