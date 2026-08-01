import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { TurnIndicator } from '@/components/CombatUI/TurnIndicator';
import { ContextTutorial } from '@/components/ContextTutorial';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data';
import {
  DEFAULT_COMBAT_AUTOPLAY,
  getAutoTurnDelayMs,
  shouldAutoAdvanceCombatTurn,
  supportsManualAuthorityCombat,
} from '@/game/battle/autoplay';
import type { BattleEvent } from '@/game/battle/types';
import { ActionType } from '@/game/battle/types';
import { NodeType } from '@/game/map/types';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import { buildResolvedEnemyTeam, resolveCombatEncounter } from '@/game/run/encounterResolver';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useBattleManager } from '@/hooks/useBattleManager';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { fr } from '@/i18n/fr';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import type { FinalCombatantState } from '@/types/run';
import { logger } from '@/utils/logger';
import { createScopedRunRng } from '@/utils/runRandom';
import { completeCombat } from './combat/combatCompletion';
import { getEnhancementDescriptions } from './combat/combatPresenter';
import {
  buildLegacyEnemyTeam,
  LEGACY_ENCOUNTER_ENGINE_VERSIONS,
} from './combat/legacyCombatEncounter';
import {
  arenaPlaceholderStyle,
  backBtnStyle,
  backBtnStyle2,
  bottomStyle,
  centerStyle,
  containerStyle,
  emptyStyle,
  headerStyle,
  leftPanelStyle,
  mainStyle,
  nextBtnStyle,
  nextTurnBtnStyle,
  rightPanelStyle,
  teamTitleStyle,
} from './combatPageStyles';

/**
 * Get enhancement bonus descriptions for a champion instance.
 * Returns an array of short description strings for UI display.
 */

const SLOT_TO_ACTION: Record<string, ActionType> = {
  Q: ActionType.SpellQ,
  W: ActionType.SpellW,
  E: ActionType.SpellE,
  R: ActionType.SpellR,
};

export function CombatPage() {
  const reducedMotion = useReducedMotion();
  useRunImagePreload();
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const runLevel = useRunStore((s) => s.runLevel);
  const currentWave = useRunStore((s) => s.currentWave);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const authorityAttempt = useRunStore((s) => s.authorityAttempt);
  const runeIds = useRunStore((s) => s.runeIds);
  const runeStacks = useRunStore((s) => s.runeStacks);
  const augmentIds = useRunStore((s) => s.augmentIds);
  const enhancementStates = useEnhancementStore((s) => s.enhancements);
  const navigate = useAppNavigate();

  const battlePhase = useBattleStore((s) => s.phase);
  const round = useBattleStore((s) => s.round);
  const playerTeam = useBattleStore((s) => s.playerTeam);
  const enemyTeam = useBattleStore((s) => s.enemyTeam);
  const currentTurnChampionId = useBattleStore((s) => s.currentTurnChampionId);
  const currentTurnSide = useBattleStore((s) => s.currentTurnSide);
  const winner = useBattleStore((s) => s.winner);
  const isPlayerTurn = useBattleStore((s) => s.isPlayerTurn);
  const battleSpeed = useSettingsStore((s) => s.battleSpeed);
  const difficulty = useSettingsStore((s) => s.difficulty);
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled);
  const combatRecoveryRequired = useRunStore((s) => s.combatRecoveryRequired);
  const markCombatStarted = useRunStore((s) => s.markCombatStarted);
  const setKeyboardShortcutsEnabled = useSettingsStore((s) => s.setKeyboardShortcutsEnabled);
  const effectiveDifficulty = authorityAttempt?.difficulty ?? difficulty;
  const isAuthorityRun = authorityAttempt !== null;
  const usesLegacyEncounterRules =
    authorityAttempt !== null &&
    LEGACY_ENCOUNTER_ENGINE_VERSIONS.has(authorityAttempt.engineVersion);
  const supportsManualCombat = supportsManualAuthorityCombat(authorityAttempt?.engineVersion);
  const requiresServerAutoPlay =
    (isAuthorityRun && !supportsManualCombat) || combatRecoveryRequired;

  const [autoPlay, setAutoPlay] = useState(DEFAULT_COMBAT_AUTOPLAY);
  const [autoActionRemainingMs, setAutoActionRemainingMs] = useState<number | null>(null);
  const [selectedTargetId, setSelectedTargetId] = useState<string>();
  const [pendingActionType, setPendingActionType] = useState<ActionType>();
  const hasNavigatedAfterLossRef = useRef(false);

  // Reset the ref when battlePhase changes to starting (new combat)
  useEffect(() => {
    if (battlePhase === 'starting') {
      hasNavigatedAfterLossRef.current = false;
      setAutoPlay(false);
      setAutoActionRemainingMs(null);
    }
  }, [battlePhase]);

  useEffect(() => {
    setSelectedTargetId(undefined);
    setPendingActionType(undefined);
  }, [currentTurnChampionId, currentTurnSide]);

  // Navigate away if the run is no longer active (only once after a loss)
  useEffect(() => {
    if (!isActive && !hasNavigatedAfterLossRef.current) {
      hasNavigatedAfterLossRef.current = true;
      navigate(ROUTES.STARTER_SELECT);
    }
  }, [isActive, navigate]);

  // Create a stable string key that includes both championIds and their levels
  // This ensures playerInstances is recreated when levels change
  const teamKey = useMemo(() => {
    return team.map((t) => `${t.championId}:${t.level ?? 1}`).join(',');
  }, [team]);

  // Get inventory for item bonuses
  const inventory = useRunStore((s) => s.inventory);
  const ruleLoadout = useMemo(
    () =>
      buildCombatRuleLoadout({
        championIds: team.map((member) => member.championId),
        runeIds,
        runeStacks,
        augmentIds,
        inventory,
        getUnlockedEnhancements: (championId) =>
          authorityAttempt
            ? (authorityAttempt.enhancementSnapshot[championId] ??
              authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
              {})
            : (enhancementStates[championId]?.unlockedNodes ?? {}),
      }),
    [augmentIds, authorityAttempt, enhancementStates, inventory, runeIds, runeStacks, team],
  );

  const playerInstances = useMemo(() => {
    return buildRunPlayerTeam(team, {
      inventory,
      augmentIds,
      currentBiomeIndex,
      getUnlockedEnhancements: (championId) =>
        authorityAttempt
          ? (authorityAttempt.enhancementSnapshot[championId] ??
            authorityAttempt.enhancementSnapshot[championId.toLowerCase()] ??
            {})
          : (enhancementStates[championId]?.unlockedNodes ?? {}),
      getMasteryLevel: (championId) =>
        authorityAttempt
          ? (authorityAttempt.masterySnapshot?.[championId] ??
            authorityAttempt.masterySnapshot?.[championId.toLowerCase()] ??
            0)
          : useMasteryStore.getState().getChampionMastery(championId).level,
    });
  }, [
    augmentIds,
    authorityAttempt,
    currentBiomeIndex,
    enhancementStates,
    inventory,
    team,
    teamKey,
  ]);

  // Get enhancement descriptions for each player champion (memoized)
  // Use teamKey to ensure this updates when team composition or levels change
  const playerEnhancementBonuses = useMemo(() => {
    const bonuses: Record<string, string[]> = {};
    for (const member of team) {
      const descs = getEnhancementDescriptions(member.championId);
      bonuses[member.championId] = descs;
      if (descs.length > 0) {
        logger.debug('[CombatPage] Enhancement bonuses for', member.championId, ':', descs);
      }
    }
    return bonuses;
  }, [teamKey]);

  // Check for empty player team (invalid champion ID) - navigate to game over
  useEffect(() => {
    if (
      isActive &&
      playerInstances.length === 0 &&
      team.length > 0 &&
      !hasNavigatedAfterLossRef.current
    ) {
      // Player team is empty but should have champions - invalid champion ID
      const championIds = team.map((m) => m.championId);
      logger.error('CombatPage: Player team is empty but run has champions.');
      logger.debug('Champion IDs in team:', championIds);
      logger.debug('Champion DB size:', championDB.count());
      // Try to look up each champion to see which ones are missing
      for (const id of championIds) {
        const champ = championDB.getById(id);
        logger.debug(`Champion "${id}" lookup result:`, champ ? 'FOUND' : 'NOT FOUND');
      }
      hasNavigatedAfterLossRef.current = true;
      void finalizeCombatRun('enemy', []).then((outcome) => {
        if (outcome.completed || outcome.queuedForRetry) {
          navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
        }
      });
    }
  }, [isActive, playerInstances.length, team.length, team, navigate]);

  // Build HP overrides from persisted team state, clamped to max HP
  const initialHpOverrides = useMemo(() => {
    const m: Record<string, number> = {};
    for (const t of team) {
      if (t.currentHp !== undefined) {
        const instance = playerInstances.find((champion) => champion.id === t.championId);
        if (instance) {
          const maxHp = instance.getEnhancedStats().hp;
          // Clamp current HP to max HP to prevent exceeding maximum after level up
          m[t.championId] = Math.min(t.currentHp, maxHp);
        } else {
          m[t.championId] = t.currentHp;
        }
      }
    }
    return Object.keys(m).length > 0 ? m : undefined;
  }, [team, playerInstances]);
  // Get encounter data from store
  const currentEncounter = useRunStore((s) => s.currentEncounter);
  const runSeed = useRunStore((s) => s.seed);
  const currentNodeId = useRunStore((s) => s.currentNodeId);
  useEffect(() => {
    if (currentNodeId) markCombatStarted(currentNodeId);
  }, [currentNodeId, markCombatStarted]);
  const currentNode = useMemo(() => useRunStore.getState().getCurrentNode(), [currentNodeId]);
  const battleRandom = useMemo(() => {
    const rng = createScopedRunRng(
      runSeed,
      `combat:${currentEncounter?.id ?? currentNodeId ?? 'unknown'}`,
    );
    return () => rng.next();
  }, [currentEncounter?.id, currentNodeId, runSeed]);

  // Memoize enemy instances to prevent recreation on every render
  const enemyInstances = useMemo(() => {
    if (
      !currentEncounter ||
      currentEncounter.type !== 'combat' ||
      !currentNode ||
      ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(currentNode.type)
    ) {
      return [];
    }
    if (usesLegacyEncounterRules) {
      return buildLegacyEnemyTeam(currentEncounter, getDifficultyMultiplier(effectiveDifficulty));
    }
    return buildResolvedEnemyTeam(
      resolveCombatEncounter({
        seed: runSeed,
        nodeId: currentNode.id,
        biome: currentNode.biome,
        nodeType: currentNode.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
        wave: currentWave,
        runLevel,
        difficulty: effectiveDifficulty,
        encounter: currentEncounter,
        inventory,
      }),
    );
  }, [
    currentEncounter?.id,
    currentEncounter?.type,
    currentNode,
    currentWave,
    effectiveDifficulty,
    inventory,
    runLevel,
    runSeed,
    usesLegacyEncounterRules,
  ]);

  const handleComplete = useCallback(
    (
      winner: 'player' | 'enemy' | 'draw',
      finalPlayerStates: FinalCombatantState[],
      consumedItemInstanceIds: string[],
      nextRuneStacks: Record<string, Record<string, number>>,
      playerActionTrace: import('@/game/battle/actionTrace').CombatActionTrace,
      combatEvents: BattleEvent[] = [],
    ) =>
      completeCombat({
        winner,
        finalPlayerStates,
        consumedItemInstanceIds,
        nextRuneStacks,
        playerActionTrace,
        combatEvents,
        supportsManualCombat,
        playerInstances,
        navigate,
      }),
    [navigate, playerInstances, supportsManualCombat],
  );

  const { processTurn, submitAction, getAvailableActions } = useBattleManager({
    playerTeam: playerInstances,
    enemyTeam: enemyInstances,
    autoPlay: requiresServerAutoPlay ? true : autoPlay,
    onComplete: handleComplete,
    initialHpOverrides,
    random: battleRandom,
    ruleLoadout,
  });

  const currentChampion = [...playerTeam, ...enemyTeam].find(
    (c) => c.targetId === currentTurnChampionId && c.side === currentTurnSide,
  );
  const currentSpell = currentChampion?.spells;

  const chooseAction = useCallback(
    (actionType: ActionType) => {
      if (requiresServerAutoPlay) return;
      const option = getAvailableActions().find((candidate) => candidate.type === actionType);
      if (!option) return;

      if (option.requiresTarget && !option.validTargetIds.includes(selectedTargetId ?? '')) {
        setSelectedTargetId(undefined);
        setPendingActionType(actionType);
        return;
      }

      const accepted = submitAction({
        type: actionType,
        targetId: option.requiresTarget ? selectedTargetId : undefined,
      });
      if (accepted) {
        setSelectedTargetId(undefined);
        setPendingActionType(undefined);
      }
    },
    [getAvailableActions, requiresServerAutoPlay, selectedTargetId, submitAction],
  );

  const handleCast = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      const actionType = SLOT_TO_ACTION[slot];
      if (!actionType) return;
      chooseAction(actionType);
    },
    [chooseAction],
  );

  const handleTargetSelect = useCallback(
    (targetId: string) => {
      const options = getAvailableActions();
      if (pendingActionType) {
        const pending = options.find((candidate) => candidate.type === pendingActionType);
        if (!pending?.validTargetIds.includes(targetId)) return;
        const accepted = submitAction({ type: pendingActionType, targetId });
        if (accepted) {
          setSelectedTargetId(undefined);
          setPendingActionType(undefined);
        }
        return;
      }

      if (options.some((option) => option.validTargetIds.includes(targetId))) {
        setSelectedTargetId(targetId);
      }
    },
    [getAvailableActions, pendingActionType, submitAction],
  );

  const autoActionDelayMs = getAutoTurnDelayMs(battleSpeed);
  const shouldAutoAdvance = shouldAutoAdvanceCombatTurn({
    phase: battlePhase,
    isAuthorityRun: requiresServerAutoPlay,
    autoPlay,
    isPlayerTurn,
  });

  // Enemy turns continue automatically in manual mode. Player turns only receive
  // a timer after the player explicitly enables auto-play.
  useEffect(() => {
    if (!shouldAutoAdvance) {
      setAutoActionRemainingMs(null);
      return;
    }

    const scheduledTurn = {
      championId: currentTurnChampionId,
      side: currentTurnSide,
      round,
    };
    const startedAt = Date.now();
    setAutoActionRemainingMs(autoActionDelayMs);
    const countdown = window.setInterval(() => {
      setAutoActionRemainingMs(Math.max(0, autoActionDelayMs - (Date.now() - startedAt)));
    }, 100);
    const timer = window.setTimeout(() => {
      const current = useBattleStore.getState();
      if (
        current.phase === 'turn_active' &&
        current.currentTurnChampionId === scheduledTurn.championId &&
        current.currentTurnSide === scheduledTurn.side &&
        current.round === scheduledTurn.round
      ) {
        processTurn();
      }
      setAutoActionRemainingMs(null);
    }, autoActionDelayMs);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [
    autoActionDelayMs,
    currentTurnChampionId,
    currentTurnSide,
    processTurn,
    round,
    shouldAutoAdvance,
  ]);

  // Keyboard shortcuts
  const canCast = !requiresServerAutoPlay && isPlayerTurn && battlePhase === 'turn_active';
  const canCastSlot = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      if (!canCast || !currentSpell) return false;
      const sp = currentSpell.find((s) => s.slot === slot);
      return !!sp && sp.isReady;
    },
    [canCast, currentSpell],
  );

  useKeyboardShortcuts({
    onCastQ: canCastSlot('Q') ? () => handleCast('Q') : undefined,
    onCastW: canCastSlot('W') ? () => handleCast('W') : undefined,
    onCastE: canCastSlot('E') ? () => handleCast('E') : undefined,
    onCastR: canCastSlot('R') ? () => handleCast('R') : undefined,
    onNextTurn:
      !requiresServerAutoPlay && !autoPlay && isPlayerTurn && battlePhase === 'turn_active'
        ? processTurn
        : undefined,
    onBack: canLeaveActiveCombat(battlePhase) ? () => navigate(ROUTES.RUN) : undefined,
    enabled: keyboardShortcutsEnabled && battlePhase !== 'finished',
  });

  if (!isActive) return null;

  const visibleActionOptions =
    !requiresServerAutoPlay && isPlayerTurn && battlePhase === 'turn_active'
      ? getAvailableActions()
      : [];
  const pendingOption = visibleActionOptions.find(
    (candidate) => candidate.type === pendingActionType,
  );
  const selectableTargetIds = new Set(
    pendingOption
      ? pendingOption.validTargetIds
      : visibleActionOptions.flatMap((option) => option.validTargetIds),
  );

  return (
    <main className="combat-page" style={containerStyle}>
      {/* Header */}
      <header className="combat-header" style={headerStyle}>
        <button
          style={backBtnStyle}
          disabled={!canLeaveActiveCombat(battlePhase)}
          onClick={() => {
            playUIClick();
            navigate(ROUTES.RUN);
          }}
          aria-label={fr.common.backToMap}
          title={
            canLeaveActiveCombat(battlePhase) ? fr.common.backToMap : fr.combat.finishBeforeMap
          }
        >
          {fr.common.backToMap}
        </button>
        <span className="combat-header__title" style={{ color: '#c8aa6e', fontWeight: 700 }}>
          Combat — {fr.combat.round} {round}
        </span>
        <TurnIndicator champion={currentChampion} side={currentTurnSide} />
        <BattleSpeedControl />
        <ContextTutorial
          storageKey="lolrogue:tutorial:combat:v1"
          title="Ton premier combat"
          buttonLabel="Règles du combat"
          steps={[
            {
              title: 'Ordre des tours',
              body: 'La vitesse fixe qui agit en premier. L’indicateur annonce le combattant actif et les ennemis jouent automatiquement.',
            },
            {
              title: 'Action et cible',
              body: 'Choisis Attaque, Q, W, E ou R, puis une cible autorisée. Le bouton Exécuter le tour confirme la commande.',
            },
            {
              title: 'Coût et recharge',
              body: 'Chaque sort affiche son coût en PM et sa recharge. Un sort indisponible est désactivé et son état est annoncé.',
            },
            {
              title: 'Statuts et journal',
              body: 'Buffs, affaiblissements, contrôles et dégâts persistants sont visibles sur les portraits et consignés dans le journal.',
            },
            {
              title: 'Autoplay',
              body: 'Auto est désactivé par défaut. Si tu l’actives, le jeu choisit tes actions ; le même bouton permet de reprendre la main.',
            },
          ]}
        />
        <button
          type="button"
          disabled={requiresServerAutoPlay}
          onClick={() => {
            if (requiresServerAutoPlay) return;
            playUIClick();
            setAutoPlay(!autoPlay);
          }}
          style={{
            padding: '4px 10px',
            background: 'transparent',
            color: autoPlay ? '#22c55e' : '#ef4444',
            border: '1px solid ' + (autoPlay ? '#22c55e' : '#ef4444'),
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 'bold',
            cursor: requiresServerAutoPlay ? 'not-allowed' : 'pointer',
          }}
          aria-label={
            requiresServerAutoPlay
              ? fr.combat.serverAutoEnabled
              : autoPlay
                ? fr.combat.disableAuto
                : fr.combat.enableAuto
          }
          aria-pressed={requiresServerAutoPlay || autoPlay}
          aria-describedby="combat-auto-status"
          title={requiresServerAutoPlay ? fr.combat.serverAutoRequired : fr.combat.autoHelp}
        >
          {requiresServerAutoPlay
            ? fr.combat.serverAuto
            : `${fr.combat.auto} : ${autoPlay ? fr.combat.on : fr.combat.off}`}
        </button>
      </header>

      {/* Main area */}
      <div className="combat-layout combat-main" style={mainStyle}>
        {/* Player team panel */}
        <div className="combat-team-panel" style={leftPanelStyle}>
          <div style={teamTitleStyle('#3b82f6')}>{fr.combat.playerTeam}</div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.targetId}`}
              combatant={c}
              isActive={c.targetId === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
              isSelected={selectedTargetId === c.targetId}
              onSelect={
                !c.isDefeated && selectableTargetIds.has(c.targetId)
                  ? () => handleTargetSelect(c.targetId)
                  : undefined
              }
            />
          ))}
          {playerTeam.length === 0 && <div style={emptyStyle}>{fr.run.noChampions}</div>}
        </div>

        {/* Center: battle arena / status */}
        <div className="combat-center" style={centerStyle}>
          {battlePhase === 'idle' && (
            <div style={arenaPlaceholderStyle}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>⚔️</div>
              <div style={{ fontSize: 18, color: '#c8aa6e', marginBottom: 8 }}>
                {fr.combat.preparing}
              </div>
            </div>
          )}
          {(battlePhase === 'turn_active' ||
            battlePhase === 'starting' ||
            battlePhase === 'turn_transition') && (
            <div style={arenaPlaceholderStyle}>
              <div
                style={{
                  fontSize: 48,
                  marginBottom: 16,
                  animation: reducedMotion ? 'none' : 'pulse 1.5s infinite',
                }}
              >
                ⚔️
              </div>
              <div style={{ fontSize: 16, color: '#ffd700', fontWeight: 'bold' }}>
                {currentTurnSide === 'player' ? `${fr.combat.yourTurn} !` : fr.combat.enemyTurn}
              </div>
              {currentChampion && (
                <div style={{ fontSize: 14, color: '#fff', marginTop: 8 }}>
                  {currentChampion.name}
                </div>
              )}
              <div
                id="combat-auto-status"
                aria-live="off"
                style={{ color: '#8b949e', fontSize: 12, marginTop: 10 }}
              >
                {autoActionRemainingMs !== null
                  ? `${
                      requiresServerAutoPlay
                        ? 'Résolution serveur'
                        : isPlayerTurn
                          ? 'Action automatique'
                          : 'Action ennemie'
                    } dans ${(autoActionRemainingMs / 1000).toFixed(1)} s`
                  : isPlayerTurn
                    ? 'Mode manuel — choisissez une action ou appuyez sur Espace.'
                    : "En attente du tour de l'ennemi…"}
              </div>
              {!requiresServerAutoPlay && !autoPlay && isPlayerTurn && (
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button
                    type="button"
                    onClick={processTurn}
                    style={nextTurnBtnStyle}
                    aria-label={`${fr.combat.executeTurn} (Espace)`}
                    aria-keyshortcuts="Space"
                  >
                    ▶ {fr.combat.executeTurn}
                    <span style={{ marginLeft: 8, fontSize: 10, opacity: 0.6 }}>[Espace]</span>
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
              <div
                style={{
                  fontSize: 28,
                  fontWeight: 'bold',
                  color:
                    winner === 'player' ? '#22c55e' : winner === 'draw' ? '#ffd700' : '#ef4444',
                  marginBottom: 12,
                }}
              >
                {winner === 'player'
                  ? `${fr.common.victory.toUpperCase()} !`
                  : winner === 'draw'
                    ? fr.combat.draw
                    : fr.common.defeat.toUpperCase()}
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                {winner === 'player' && (
                  <button
                    onClick={() => {
                      playUIClick();
                      navigate(ROUTES.RUN);
                    }}
                    style={nextBtnStyle}
                  >
                    {fr.common.continue} →
                  </button>
                )}
                <button onClick={() => navigate(ROUTES.MENU)} style={backBtnStyle2}>
                  {fr.gameOver.mainMenu}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enemy team panel */}
        <div className="combat-team-panel" style={rightPanelStyle}>
          <div style={teamTitleStyle('#ef4444')}>{fr.combat.enemies}</div>
          {enemyTeam.map((c) => (
            <CombatantPortrait
              key={`enemy-${c.targetId}`}
              combatant={c}
              isActive={c.targetId === currentTurnChampionId}
              isSelected={selectedTargetId === c.targetId}
              onSelect={
                !c.isDefeated && selectableTargetIds.has(c.targetId)
                  ? () => handleTargetSelect(c.targetId)
                  : undefined
              }
            />
          ))}
          {enemyTeam.length === 0 && <div style={emptyStyle}>{fr.common.none}</div>}
        </div>
      </div>

      {/* Bottom: ability bar + log */}
      <div className="combat-bottom" style={bottomStyle}>
        {!requiresServerAutoPlay &&
          isPlayerTurn &&
          currentChampion &&
          !currentChampion.isDefeated && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginBottom: 8,
              }}
            >
              <button
                type="button"
                disabled={
                  !visibleActionOptions.some(
                    (candidate) => candidate.type === ActionType.BasicAttack,
                  )
                }
                onClick={() => chooseAction(ActionType.BasicAttack)}
                style={nextTurnBtnStyle}
                aria-label={fr.combat.baseAttack}
              >
                ⚔ {fr.combat.attack}
              </button>
              <AbilityBar champion={currentChampion} onCast={handleCast} />
              {pendingOption && (
                <div
                  role="status"
                  style={{ width: '100%', textAlign: 'center', color: '#c8aa6e', fontSize: 12 }}
                >
                  {fr.combat.chooseTarget}
                </div>
              )}
            </div>
          )}
        <details
          style={{
            margin: '0 auto 8px',
            maxWidth: 680,
            color: '#8b949e',
            fontSize: 12,
            textAlign: 'left',
          }}
        >
          <summary style={{ color: '#c8aa6e', cursor: 'pointer' }}>
            {fr.combat.shortcuts} —{' '}
            {keyboardShortcutsEnabled ? fr.combat.shortcutsEnabled : fr.combat.shortcutsDisabled}
          </summary>
          <div style={{ padding: '8px 0', lineHeight: 1.6 }}>
            <div>Q / W / E / R : choisir un sort disponible.</div>
            <div>Espace : exécuter le tour manuel.</div>
            <div>Échap : retourner à la carte lorsque le combat est terminé.</div>
            <div>Tab puis Entrée ou Espace : activer le contrôle ayant le focus.</div>
            <button
              type="button"
              onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              aria-pressed={keyboardShortcutsEnabled}
              style={{ ...nextTurnBtnStyle, marginTop: 6 }}
            >
              {keyboardShortcutsEnabled ? fr.combat.disableShortcuts : fr.combat.enableShortcuts}
            </button>
          </div>
        </details>
        <div style={{ flex: 1, minHeight: 0 }}>
          <CombatLog />
        </div>
      </div>
    </main>
  );
}
