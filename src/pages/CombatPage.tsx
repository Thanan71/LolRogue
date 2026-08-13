import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { playUIClick } from '@/audio';
import { AbilityBar } from '@/components/CombatUI/AbilityBar';
import { BattleSpeedControl } from '@/components/CombatUI/BattleSpeedControl';
import { CombatantPortrait } from '@/components/CombatUI/CombatantPortrait';
import { CombatLog } from '@/components/CombatUI/CombatLog';
import { CombatStage } from '@/components/CombatUI/CombatStage';
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
import type { BattleActionOption, BattleEvent, TeamSide } from '@/game/battle/types';
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
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { fr } from '@/i18n/fr';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import { TargetingType } from '@/types/champion';
import type { FinalCombatantState } from '@/types/run';
import { logger } from '@/utils/logger';
import { createScopedRunRng } from '@/utils/runRandom';
import { completeCombat } from './combat/combatCompletion';
import { getEnhancementDescriptions } from './combat/combatPresenter';
import { buildLegacyEnemyTeam, usesLegacyEncounterRules } from './combat/legacyCombatEncounter';
import '@/styles/combat-ui.css';

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

interface CombatTargetSelection {
  targetId: string;
  side: TeamSide;
}

function expectedTargetSide(
  option: BattleActionOption,
  actorSide: TeamSide | null,
): TeamSide | null {
  if (!actorSide) return null;
  if (
    option.targeting === TargetingType.Self ||
    option.targeting === TargetingType.Ally ||
    option.targeting === TargetingType.Allies
  ) {
    return actorSide;
  }
  return actorSide === 'player' ? 'enemy' : 'player';
}

function optionAcceptsTarget(
  option: BattleActionOption,
  selection: CombatTargetSelection | undefined,
  actorSide: TeamSide | null,
): boolean {
  return Boolean(
    selection &&
      expectedTargetSide(option, actorSide) === selection.side &&
      option.validTargetIds.includes(selection.targetId),
  );
}

function combatTargetKey(side: TeamSide, targetId: string): string {
  return `${side}:${targetId}`;
}

export function CombatPage() {
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
  const visualEvent = useBattleStore((s) => s.visualEvent);
  const battleSpeed = useSettingsStore((s) => s.battleSpeed);
  const difficulty = useSettingsStore((s) => s.difficulty);
  const keyboardShortcutsEnabled = useSettingsStore((s) => s.keyboardShortcutsEnabled);
  const combatRecoveryRequired = useRunStore((s) => s.combatRecoveryRequired);
  const markCombatStarted = useRunStore((s) => s.markCombatStarted);
  const setKeyboardShortcutsEnabled = useSettingsStore((s) => s.setKeyboardShortcutsEnabled);
  const effectiveDifficulty = authorityAttempt?.difficulty ?? difficulty;
  const isAuthorityRun = authorityAttempt !== null;
  const usesLegacyEncounterRulesForAttempt =
    authorityAttempt !== null && usesLegacyEncounterRules(authorityAttempt.engineVersion);
  const supportsManualCombat = supportsManualAuthorityCombat(authorityAttempt?.engineVersion);
  const requiresServerAutoPlay =
    (isAuthorityRun && !supportsManualCombat) || combatRecoveryRequired;

  const [autoPlay, setAutoPlay] = useState(DEFAULT_COMBAT_AUTOPLAY);
  const [autoActionRemainingMs, setAutoActionRemainingMs] = useState<number | null>(null);
  const [targetSelection, setTargetSelection] = useState<CombatTargetSelection>();
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
    setTargetSelection(undefined);
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
    if (usesLegacyEncounterRulesForAttempt) {
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
    usesLegacyEncounterRulesForAttempt,
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
    (c) =>
      c.side === currentTurnSide &&
      (c.targetId === currentTurnChampionId || c.id === currentTurnChampionId),
  );
  const currentSpell = currentChampion?.spells;

  const chooseAction = useCallback(
    (actionType: ActionType) => {
      if (requiresServerAutoPlay) return;
      const option = getAvailableActions().find((candidate) => candidate.type === actionType);
      if (!option) return;

      if (option.requiresTarget && !optionAcceptsTarget(option, targetSelection, currentTurnSide)) {
        setTargetSelection(undefined);
        setPendingActionType(actionType);
        return;
      }

      const accepted = submitAction({
        type: actionType,
        targetId: option.requiresTarget ? targetSelection?.targetId : undefined,
      });
      if (accepted) {
        setTargetSelection(undefined);
        setPendingActionType(undefined);
      }
    },
    [currentTurnSide, getAvailableActions, requiresServerAutoPlay, submitAction, targetSelection],
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
    (targetId: string, side: TeamSide) => {
      const options = getAvailableActions();
      const selection = { targetId, side } satisfies CombatTargetSelection;
      if (pendingActionType) {
        const pending = options.find((candidate) => candidate.type === pendingActionType);
        if (!pending || !optionAcceptsTarget(pending, selection, currentTurnSide)) return;
        const accepted = submitAction({ type: pendingActionType, targetId });
        if (accepted) {
          setTargetSelection(undefined);
          setPendingActionType(undefined);
        }
        return;
      }

      if (
        options.some(
          (option) =>
            option.requiresTarget && optionAcceptsTarget(option, selection, currentTurnSide),
        )
      ) {
        setTargetSelection(selection);
      }
    },
    [currentTurnSide, getAvailableActions, pendingActionType, submitAction],
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
  const selectableTargetKeys = new Set(
    (pendingOption
      ? [pendingOption]
      : visibleActionOptions.filter((option) => option.requiresTarget)
    ).flatMap((option) => {
      const side = expectedTargetSide(option, currentTurnSide);
      return side ? option.validTargetIds.map((targetId) => combatTargetKey(side, targetId)) : [];
    }),
  );
  const selectedTarget = [...playerTeam, ...enemyTeam].find(
    (combatant) =>
      combatant.side === targetSelection?.side && combatant.targetId === targetSelection.targetId,
  );
  const showPlayerControls =
    !requiresServerAutoPlay &&
    isPlayerTurn &&
    currentChampion !== undefined &&
    !currentChampion.isDefeated;
  const showManualConfirmation =
    !requiresServerAutoPlay &&
    !autoPlay &&
    isPlayerTurn &&
    (battlePhase === 'turn_active' ||
      battlePhase === 'starting' ||
      battlePhase === 'turn_transition');

  const commandStatus = pendingOption
    ? {
        label: 'Cible requise',
        text: fr.combat.chooseTarget,
      }
    : selectedTarget
      ? {
          label: 'Cible prête',
          text: `${selectedTarget.name} est sélectionné. Choisissez maintenant une action.`,
        }
      : battlePhase === 'finished'
        ? {
            label: 'Combat terminé',
            text: 'Consultez le journal ou poursuivez depuis le résultat du combat.',
          }
        : requiresServerAutoPlay
          ? {
              label: 'Résolution serveur',
              text: fr.combat.serverAutoRequired,
            }
          : autoActionRemainingMs !== null
            ? {
                label: isPlayerTurn ? 'Action automatique' : 'Tour adverse',
                text: isPlayerTurn
                  ? 'Votre prochaine action est en cours de résolution automatique.'
                  : 'L’action ennemie est en cours de résolution.',
              }
            : isPlayerTurn && autoPlay
              ? {
                  label: 'Autoplay actif',
                  text: 'Vos actions sont choisies automatiquement pour ce tour.',
                }
              : isPlayerTurn
                ? {
                    label: 'À vous de jouer',
                    text: 'Choisissez une action, puis une cible lorsqu’elle est demandée.',
                  }
                : battlePhase === 'idle' || battlePhase === 'starting'
                  ? {
                      label: 'Préparation',
                      text: 'Les commandes seront disponibles au début de votre tour.',
                    }
                  : {
                      label: 'Tour adverse',
                      text: 'Les commandes sont verrouillées pendant l’action ennemie.',
                    };
  const targetStepText = pendingOption
    ? 'Sélectionnez un portrait valide'
    : (selectedTarget?.name ?? 'Selon l’action choisie');
  const arenaStatus =
    autoActionRemainingMs !== null
      ? `${
          requiresServerAutoPlay
            ? 'Résolution serveur'
            : isPlayerTurn
              ? 'Action automatique'
              : 'Action ennemie'
        } dans ${(autoActionRemainingMs / 1000).toFixed(1)} s`
      : isPlayerTurn
        ? 'Mode manuel — choisissez une action ou appuyez sur Espace.'
        : "En attente du tour de l'ennemi…";
  const isVisualSource = (combatant: (typeof playerTeam)[number]) =>
    Boolean(
      visualEvent &&
        combatant.side === visualEvent.sourceSide &&
        (combatant.targetId === visualEvent.sourceCombatantId ||
          (!visualEvent.sourceCombatantId && combatant.id === visualEvent.sourceId)),
    );
  const isVisualTarget = (combatant: (typeof playerTeam)[number]) =>
    Boolean(
      visualEvent &&
        combatant.side === visualEvent.targetSide &&
        ((visualEvent.targetCombatantIds?.length ?? 0) > 0
          ? visualEvent.targetCombatantIds!.includes(combatant.targetId)
          : visualEvent.targetCombatantId
            ? combatant.targetId === visualEvent.targetCombatantId
            : (visualEvent.targetIds ?? []).includes(combatant.id) ||
              combatant.id === visualEvent.targetId),
    );

  return (
    <main className="combat-page">
      {/* Header */}
      <header className="combat-header">
        <button
          className="combat-header__back"
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
        <span className="combat-header__title">
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
          className="combat-auto-toggle"
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
      <div className="combat-layout combat-main">
        {/* Player team panel */}
        <div className="combat-team-panel">
          <div className="combat-team-panel__title combat-team-panel__title--player">
            {fr.combat.playerTeam}
          </div>
          {playerTeam.map((c) => (
            <CombatantPortrait
              key={`player-${c.targetId}`}
              combatant={c}
              isActive={c.side === currentTurnSide && c.targetId === currentTurnChampionId}
              enhancementBonuses={playerEnhancementBonuses[c.id] || []}
              isSelected={
                targetSelection?.side === c.side && targetSelection.targetId === c.targetId
              }
              isAttacking={isVisualSource(c)}
              isActualTarget={isVisualTarget(c)}
              onSelect={
                !c.isDefeated && selectableTargetKeys.has(combatTargetKey(c.side, c.targetId))
                  ? () => handleTargetSelect(c.targetId, c.side)
                  : undefined
              }
            />
          ))}
          {playerTeam.length === 0 && (
            <div className="combat-team-panel__empty">{fr.run.noChampions}</div>
          )}
        </div>

        {/* Center: battle arena / status */}
        <div className="combat-center">
          {battlePhase === 'idle' && (
            <div className="combat-arena">
              <div className="combat-arena__eyebrow">Arène tactique</div>
              <div className="combat-arena__icon">⚔️</div>
              <div className="combat-arena__preparing">{fr.combat.preparing}</div>
            </div>
          )}
          {(battlePhase === 'turn_active' ||
            battlePhase === 'starting' ||
            battlePhase === 'turn_transition') && (
            <CombatStage
              key={visualEvent?.id ?? 'combat-stage-idle'}
              round={round}
              currentTurnChampionId={currentTurnChampionId}
              currentTurnSide={currentTurnSide}
              playerTeam={playerTeam}
              enemyTeam={enemyTeam}
              selectedTarget={selectedTarget}
              pendingActionType={pendingActionType}
              visualEvent={visualEvent}
              status={arenaStatus}
            />
          )}
          {battlePhase === 'finished' && (
            <div className="combat-arena">
              <div className="combat-arena__eyebrow">Résultat du combat</div>
              <div className="combat-result__icon">
                {winner === 'player' ? '🏆' : winner === 'draw' ? '🤝' : '💀'}
              </div>
              <div className={`combat-result__title combat-result__title--${winner ?? 'enemy'}`}>
                {winner === 'player'
                  ? `${fr.common.victory.toUpperCase()} !`
                  : winner === 'draw'
                    ? fr.combat.draw
                    : fr.common.defeat.toUpperCase()}
              </div>
              <div className="combat-result__actions">
                {winner === 'player' && (
                  <button
                    type="button"
                    onClick={() => {
                      playUIClick();
                      navigate(ROUTES.RUN);
                    }}
                    className="combat-result__continue"
                  >
                    {fr.common.continue} →
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => navigate(ROUTES.MENU)}
                  className="combat-result__menu"
                >
                  {fr.gameOver.mainMenu}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Enemy team panel */}
        <div className="combat-team-panel">
          <div className="combat-team-panel__title combat-team-panel__title--enemy">
            {fr.combat.enemies}
          </div>
          {enemyTeam.map((c) => (
            <CombatantPortrait
              key={`enemy-${c.targetId}`}
              combatant={c}
              isActive={c.side === currentTurnSide && c.targetId === currentTurnChampionId}
              isSelected={
                targetSelection?.side === c.side && targetSelection.targetId === c.targetId
              }
              isAttacking={isVisualSource(c)}
              isActualTarget={isVisualTarget(c)}
              onSelect={
                !c.isDefeated && selectableTargetKeys.has(combatTargetKey(c.side, c.targetId))
                  ? () => handleTargetSelect(c.targetId, c.side)
                  : undefined
              }
            />
          ))}
          {enemyTeam.length === 0 && (
            <div className="combat-team-panel__empty">{fr.common.none}</div>
          )}
        </div>
      </div>

      {/* Bottom: coherent command tray + log */}
      <div className="combat-bottom">
        <section className="combat-command" aria-labelledby="combat-command-title">
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="combat-command__status"
          >
            <span aria-hidden="true" className="combat-command__index">
              CMD
            </span>
            <span className="combat-command__copy">
              <span id="combat-command-title" className="combat-command__label">
                {commandStatus.label}
              </span>
              <span className="combat-command__text">{commandStatus.text}</span>
            </span>
          </div>

          {showPlayerControls && currentChampion && (
            <div className="combat-command__controls">
              <div className="combat-command__choice">
                <span className="combat-command__step-label">1 · Action</span>
                <button
                  type="button"
                  disabled={
                    !visibleActionOptions.some(
                      (candidate) => candidate.type === ActionType.BasicAttack,
                    )
                  }
                  onClick={() => chooseAction(ActionType.BasicAttack)}
                  className="combat-action-button"
                  aria-label={fr.combat.baseAttack}
                >
                  ⚔ {fr.combat.attack}
                </button>
                <AbilityBar champion={currentChampion} onCast={handleCast} />
              </div>

              <div className="combat-command__target">
                <span className="combat-command__step-label">2 · Cible</span>
                <span className="combat-command__target-value" title={targetStepText}>
                  {targetStepText}
                </span>
              </div>

              {showManualConfirmation && (
                <div className="combat-command__confirm">
                  <span className="combat-command__step-label">3 · Confirmation</span>
                  <button
                    type="button"
                    onClick={processTurn}
                    className="combat-action-button combat-action-button--confirm"
                    aria-label={`${fr.combat.executeTurn} (Espace)`}
                    aria-keyshortcuts="Space"
                  >
                    ▶ {fr.combat.executeTurn}
                    <span className="combat-action-button__shortcut">[Espace]</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        <details className="combat-shortcuts">
          <summary className="combat-shortcuts__summary">
            {fr.combat.shortcuts} —{' '}
            {keyboardShortcutsEnabled ? fr.combat.shortcutsEnabled : fr.combat.shortcutsDisabled}
          </summary>
          <div className="combat-shortcuts__body">
            <div>Q / W / E / R : choisir un sort disponible.</div>
            <div>Espace : exécuter le tour manuel.</div>
            <div>Échap : retourner à la carte lorsque le combat est terminé.</div>
            <div>Tab puis Entrée ou Espace : activer le contrôle ayant le focus.</div>
            <button
              type="button"
              onClick={() => setKeyboardShortcutsEnabled(!keyboardShortcutsEnabled)}
              aria-pressed={keyboardShortcutsEnabled}
              className="combat-action-button combat-shortcuts__toggle"
            >
              {keyboardShortcutsEnabled ? fr.combat.disableShortcuts : fr.combat.enableShortcuts}
            </button>
          </div>
        </details>
        <div className="combat-log-region">
          <CombatLog />
        </div>
      </div>
    </main>
  );
}
