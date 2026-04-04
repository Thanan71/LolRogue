import { useEffect, useMemo, useCallback, useState, useRef } from 'react';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { ROUTES } from '@/stores/routerStore';
import { useRunStore } from '@/stores/runStore';
import { useBattleStore } from '@/stores/battleStore';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useSettingsStore } from '@/stores/settingsStore';
import { ChampionInstance } from '@/game/ChampionInstance';
import { championDB } from '@/data';
import { ITEM_DATABASE } from '@/data/items';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { TurnIndicator } from '@/components/CombatUI/TurnIndicator';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { ActionType } from '@/game/battle/types';
import { SeededRNG } from '@/utils/seededRandom';
import { playUIClick } from '@/audio';
import { runStatsTracker } from '@/services/RunStatsTracker';
import { calculateXpGain, addXp } from '@/utils/xpSystem';
import type { Item, ItemStatBonuses, RunSummary } from '@/types/run';
import type { CombatEncounter } from '@/game/map/types';

function buildTeamInstances(championIds: string[], levels?: Record<string, number>): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const id of championIds) {
    const champ = championDB.getById(id);
    if (champ) instances.push(new ChampionInstance(champ, levels?.[id] ?? 1));
  }
  return instances;
}

/** Build enemy team from encounter data */
function buildEnemyTeamFromEncounter(encounter: CombatEncounter): ChampionInstance[] {
  const instances: ChampionInstance[] = [];
  for (const enemy of encounter.enemies) {
    const champ = championDB.getById(enemy.championId);
    if (champ) {
      // Use level from enemy definition, defaulting to 1
      // Scale level by statMultiplier to approximate stat increase
      // e.g., level 1 with 1.5x stats ≈ level 8 stats
      const baseLevel = enemy.level ?? 1;
      const effectiveLevel = Math.min(18, Math.max(1, Math.round(baseLevel * enemy.statMultiplier)));
      const instance = new ChampionInstance(champ, effectiveLevel);
      instances.push(instance);
    }
  }
  return instances;
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
  const battleSpeed = useSettingsStore(s => s.battleSpeed);

  const [autoPlay, setAutoPlay] = useState(true);
  const [turnTick, setTurnTick] = useState(0);
  const hasNavigatedAfterLossRef = useRef(false);
  const endRunTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear any pending endRun timeout on mount
  useEffect(() => {
    return () => {
      if (endRunTimeoutRef.current) {
        clearTimeout(endRunTimeoutRef.current);
      }
    };
  }, []);
  
  // Reset the ref when battlePhase changes to starting (new combat)
  useEffect(() => {
    if (battlePhase === 'starting') {
      hasNavigatedAfterLossRef.current = false;
      setTurnTick(0); // Reset turn tick for new battle
    }
  }, [battlePhase]);
  
  // Navigate away if the run is no longer active (only once after a loss)
  useEffect(() => {
    if (!isActive && !hasNavigatedAfterLossRef.current) {
      hasNavigatedAfterLossRef.current = true;
      navigate(ROUTES.STARTER_SELECT);
    }
  }, [isActive, navigate]);

  // Build player instances with persisted levels
  const teamLevels = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) { m[t.championId] = t.level ?? 1; }
    return m;
  }, [team]);
  const playerInstances = useMemo(() => buildTeamInstances(team.map(m => m.championId), teamLevels), [team, teamLevels]);
  // Build HP overrides from persisted team state
  const initialHpOverrides = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) {
      if (t.currentHp !== undefined) m[t.championId] = t.currentHp;
    }
    return Object.keys(m).length > 0 ? m : undefined;
  }, [team]);
  
  // Get encounter data from store
  const currentEncounter = useRunStore(s => s.currentEncounter);
  
  // Use useState to store enemy team so it doesn't regenerate on re-render.
  // Build enemy team from encounter data if available, otherwise fallback to empty
  const [enemyInstances, setEnemyInstances] = useState<ChampionInstance[]>(() => {
    if (currentEncounter && currentEncounter.type === 'combat') {
      return buildEnemyTeamFromEncounter(currentEncounter);
    }
    return [];
  });

  // Regenerate enemy team when encounter changes (new combat encounter)
  useEffect(() => {
    if (currentEncounter && currentEncounter.type === 'combat') {
      setEnemyInstances(buildEnemyTeamFromEncounter(currentEncounter));
    }
  }, [currentEncounter]);

  const handleComplete = useCallback((w: 'player' | 'enemy' | 'draw') => {
    if (w === 'player') {
      const runStore = useRunStore.getState();

      // 1. Award gold: 50 + runLevel * 10
      const goldReward = 50 + runLevel * 10;
      runStore.addGold(goldReward);

      // 2. Award XP to all surviving player champions
      const currentNode = runStore.getCurrentNode();
      const isBossNode = currentNode?.type === 'boss';
      const isEliteNode = currentNode?.type === 'elite';
      const xpGain = calculateXpGain(runLevel, isEliteNode, isBossNode);
      
      // Update each team member with XP and potential level-ups
      const teamUpdates = runStore.team.map(member => {
        const currentLevel = member.level ?? 1;
        const currentXp = member.currentXp ?? 0;
        const result = addXp(currentLevel, currentXp, xpGain);
        
        return {
          championId: member.championId,
          currentHp: member.currentHp ?? 0,
          level: result.newLevel,
          currentXp: result.remainingXp,
        };
      });
      
      runStore.updateTeamAfterCombat(teamUpdates);

      // 3. Advance wave
      runStore.nextWave();

      // 4. Complete current map node (unlocks next nodes)
      if (currentNode) {
        // 5. Item drop chance (~20%) — deterministic for daily runs
        const itemRng = new SeededRNG(runLevel * 1000 + runStore.totalWavesCompleted);
        if (itemRng.next() < 0.2) {
          const itemDefs = Object.values(ITEM_DATABASE);
          if (itemDefs.length > 0) {
            const drop = itemDefs[Math.floor(itemRng.next() * itemDefs.length)];
            const item: Item = {
              id: drop.id,
              name: drop.name,
              description: drop.description,
              iconUrl: drop.iconUrl,
              stats: drop.stats.reduce<ItemStatBonuses>((acc, s) => {
                const key = s.stat as keyof ItemStatBonuses;
                acc[key] = (acc[key] ?? 0) + s.value;
                return acc;
              }, {}),
              passiveId: drop.passive?.id,
              goldValue: drop.goldValue,
            };
            runStore.addItem(item);
          }
        }

        // 6. Resolve encounter (completes the node)
        runStore.resolveEncounter();

        // 7. Check if we just completed the boss -- advance to next biome
        if (isBossNode) {
          runStore.incrementRunLevel();
          runStore.advanceToNextBiome();
        }
      }

      // 8. Build RunSummary for victory display
      // Mark surviving player champions
      const rs2 = useRunStore.getState();
      const aliveIds = rs2.team.filter(m => (m.currentHp ?? 0) > 0).map(m => m.championId);
      runStatsTracker.markSurvived(aliveIds);
      const victorySummary: RunSummary = runStatsTracker.buildSummary({
        won: true,
        wavesCompleted: rs2.totalWavesCompleted,
        biomesVisited: rs2.biomesVisited as any,
        goldEarned: rs2.gold,
        runLevel: rs2.runLevel,
      });
      // If this was the boss, show game-over with full stats
      if (isBossNode) {
        navigate(ROUTES.GAME_OVER, { state: { summary: victorySummary } });
        rs2.endRun();
        runStatsTracker.reset();
        return;
      }
      // Reset tracker for next combat
      runStatsTracker.reset();

      // Navigate back to the map to choose the next node
      navigate(ROUTES.RUN);

    } else {
      // On draw or loss: build RunSummary from tracked stats, navigate with state
      const rs = useRunStore.getState();
      // Mark all player champions as dead (none survived)
      runStatsTracker.markSurvived([]);
      const summary: RunSummary = runStatsTracker.buildSummary({
        won: false,
        wavesCompleted: rs.totalWavesCompleted,
        biomesVisited: rs.biomesVisited as any,
        goldEarned: rs.gold,
        runLevel: rs.runLevel,
      });
      // Navigate to game over screen
      navigate(ROUTES.GAME_OVER, { state: { summary } });
      // End the run (resets isActive, team, gold, etc.) - delayed to avoid race conditions
      // Store the timeout reference so it can be cleared if player starts a new run
      endRunTimeoutRef.current = setTimeout(() => {
        rs.endRun(w === 'draw');
        runStatsTracker.reset();
        endRunTimeoutRef.current = null;
      }, 100);
    }
  }, [runLevel, navigate]);

  const { processTurn, submitAction, getManager } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: autoPlay,
    onComplete: handleComplete,
    initialHpOverrides,
  });

  const handleCast = useCallback((slot: 'Q' | 'W' | 'E' | 'R') => {
    const actionType = SLOT_TO_ACTION[slot];
    if (!actionType) return;
    submitAction({ type: actionType, cost: 0 });
  }, [submitAction]);

  // Auto-process all turns when autoPlay is enabled
  useEffect(() => {
    if (autoPlay && battlePhase === 'turn_active') {
      const delay = Math.max(50, 400 / battleSpeed);
      const timer = setTimeout(() => {
        processTurn();
        setTurnTick(t => t + 1);
      }, delay);
      return () => clearTimeout(timer);
    }
  }, [autoPlay, battlePhase, processTurn, turnTick, battleSpeed]);

  // Save final HP states when battle finishes with player victory
  useEffect(() => {
    if (battlePhase === 'finished' && winner === 'player') {
      const bm = getManager();
      if (!bm) return;
      const finalStates = bm.getFinalPlayerStates();
      if (finalStates.length > 0) {
        const runStore = useRunStore.getState();
        runStore.updateTeamAfterCombat(
          finalStates.map(s => ({
            championId: s.championId,
            currentHp: s.currentHp,
            level: teamLevels[s.championId] ?? 1,
            currentXp: runStore.team.find(m => m.championId === s.championId)?.currentXp ?? 0,
          }))
        );
      }
    }
  }, [battlePhase, winner, getManager, teamLevels]);

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
    onNextTurn: (!autoPlay || isPlayerTurn) && battlePhase === 'turn_active' ? processTurn : undefined,
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
        <button
          onClick={() => { playUIClick(); setAutoPlay(!autoPlay); }}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            color: autoPlay ? '#22c55e' : '#ef4444',
            border: '1px solid ' + (autoPlay ? '#22c55e' : '#ef4444'),
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 'bold',
            cursor: 'pointer',
          }}
          aria-label="Toggle auto-play"
        >
          Auto: {autoPlay ? 'ON' : 'OFF'}
        </button>
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
              {(!autoPlay || isPlayerTurn) && (
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
                  <button onClick={() => { playUIClick();  navigate(ROUTES.RUN); }} style={nextBtnStyle}>Continuer →</button>
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
