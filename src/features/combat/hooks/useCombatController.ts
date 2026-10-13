import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ROUTES, type RoutePath } from '@/config/routes';
import {
  DEFAULT_COMBAT_AUTOPLAY,
  getAutoTurnDelayMs,
  shouldAutoAdvanceCombatTurn,
} from '@/game/battle/autoplay';
import { ActionType, type TeamSide } from '@/game/battle/types';
import { canLeaveActiveCombat } from '@/game/run/routeAccess';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { combatCopy } from '@/i18n/combatContent';
import { formatNumber } from '@/i18n/format';
import { fr } from '@/i18n/fr';
import type { CombatVisualEvent } from '@/stores/battleStore';
import { TargetingType } from '@/types/champion';
import type { BattleSpeed, CombatantInfo } from '@/types/combatPresentation';
import {
  type CombatTargetSelection,
  combatTargetKey,
  optionAcceptsTarget,
  optionTargets,
  SLOT_TO_ACTION,
} from '../application/combatSelection';
import { type UseBattleManagerOptions, useBattleManager } from './useBattleManager';

export interface CombatBattleSnapshot {
  phase: 'idle' | 'starting' | 'turn_active' | 'turn_transition' | 'finished';
  currentTurnChampionId: string | null;
  currentTurnSide: TeamSide | null;
  round: number;
}

export interface CombatControllerInput {
  battlePhase: CombatBattleSnapshot['phase'];
  currentTurnChampionId: string | null;
  currentTurnSide: TeamSide | null;
  round: number;
  playerTeam: CombatantInfo[];
  enemyTeam: CombatantInfo[];
  isPlayerTurn: boolean;
  visualEvent: CombatVisualEvent | null;
  battleSpeed: BattleSpeed;
  requiresServerAutoPlay: boolean;
  keyboardShortcutsEnabled: boolean;
  navigate: (route: RoutePath) => void;
  readBattle: () => CombatBattleSnapshot;
  engineOptions: UseBattleManagerOptions;
}

export type CombatEngineBinding = Pick<
  ReturnType<typeof useBattleManager>,
  'processTurn' | 'advanceBlockedTurn' | 'submitAction' | 'getAvailableActions'
>;

/** UI orchestration only. The engine remains the sole validator and action executor. */
export function useCombatController(
  input: CombatControllerInput,
  useEngine: (options: UseBattleManagerOptions) => CombatEngineBinding = useBattleManager,
) {
  const {
    battlePhase,
    currentTurnChampionId,
    currentTurnSide,
    round,
    playerTeam,
    enemyTeam,
    isPlayerTurn,
    visualEvent,
    battleSpeed,
    requiresServerAutoPlay,
    keyboardShortcutsEnabled,
    navigate,
    readBattle,
  } = input;
  const [autoPlay, setAutoPlay] = useState(DEFAULT_COMBAT_AUTOPLAY);
  const [autoActionRemainingMs, setAutoActionRemainingMs] = useState<number | null>(null);
  const [targetSelection, setTargetSelection] = useState<CombatTargetSelection>();
  const [pendingActionType, setPendingActionType] = useState<ActionType>();
  const stagedActorRef = useRef<string | null>(null);
  const { processTurn, advanceBlockedTurn, submitAction, getAvailableActions } = useEngine({
    ...input.engineOptions,
    autoPlay: requiresServerAutoPlay || autoPlay,
  });
  const targetContext = useMemo(
    () => ({
      actorId: currentTurnChampionId,
      actorSide: currentTurnSide,
      combatants: [...playerTeam, ...enemyTeam].map((combatant) => ({
        id: combatant.targetId,
        side: combatant.side,
        isDefeated: combatant.isDefeated,
      })),
    }),
    [currentTurnChampionId, currentTurnSide, playerTeam, enemyTeam],
  );
  useEffect(() => {
    if (battlePhase === 'starting') {
      setAutoPlay(false);
      setAutoActionRemainingMs(null);
    }
  }, [battlePhase]);
  useEffect(() => {
    setTargetSelection(undefined);
    setPendingActionType(undefined);
    stagedActorRef.current = null;
  }, [currentTurnChampionId, currentTurnSide, round]);
  const currentChampion = [...playerTeam, ...enemyTeam].find(
    (c) =>
      c.side === currentTurnSide &&
      (c.targetId === currentTurnChampionId || c.id === currentTurnChampionId),
  );
  const currentSpell = currentChampion?.spells;

  const chooseAction = useCallback(
    (actionType: ActionType) => {
      if (requiresServerAutoPlay || autoPlay || !isPlayerTurn || battlePhase !== 'turn_active')
        return;
      const option = getAvailableActions().find((candidate) => candidate.type === actionType);
      if (!option) return;

      if (!option.requiresTarget || !optionAcceptsTarget(option, targetSelection, targetContext)) {
        setTargetSelection(undefined);
      }
      setPendingActionType(actionType);
      stagedActorRef.current = `${round}:${currentTurnSide}:${currentTurnChampionId}`;
    },
    [
      autoPlay,
      battlePhase,
      currentTurnSide,
      currentTurnChampionId,
      getAvailableActions,
      isPlayerTurn,
      requiresServerAutoPlay,
      targetSelection,
      targetContext,
      round,
    ],
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
      if (requiresServerAutoPlay || autoPlay || !isPlayerTurn || battlePhase !== 'turn_active')
        return;
      const options = getAvailableActions();
      const selection = { targetId, side } satisfies CombatTargetSelection;
      if (pendingActionType) {
        const pending = options.find((candidate) => candidate.type === pendingActionType);
        if (!pending || !optionAcceptsTarget(pending, selection, targetContext)) return;
        setTargetSelection(selection);
        return;
      }

      if (
        options.some(
          (option) =>
            option.requiresTarget && optionAcceptsTarget(option, selection, targetContext),
        )
      ) {
        setTargetSelection(selection);
      }
    },
    [
      autoPlay,
      battlePhase,
      currentTurnSide,
      getAvailableActions,
      isPlayerTurn,
      pendingActionType,
      requiresServerAutoPlay,
      targetContext,
    ],
  );

  const confirmAction = useCallback(() => {
    if (requiresServerAutoPlay || autoPlay || !isPlayerTurn || battlePhase !== 'turn_active')
      return;
    const current = readBattle();
    if (
      current.phase !== 'turn_active' ||
      stagedActorRef.current !==
        `${current.round}:${current.currentTurnSide}:${current.currentTurnChampionId}`
    )
      return;
    const option = getAvailableActions().find((candidate) => candidate.type === pendingActionType);
    if (
      !option ||
      (option.requiresTarget && !optionAcceptsTarget(option, targetSelection, targetContext))
    )
      return;
    if (
      submitAction({
        type: option.type,
        targetId: option.requiresTarget ? targetSelection?.targetId : undefined,
      })
    ) {
      stagedActorRef.current = null;
      setTargetSelection(undefined);
      setPendingActionType(undefined);
    }
  }, [
    autoPlay,
    battlePhase,
    currentTurnSide,
    getAvailableActions,
    isPlayerTurn,
    pendingActionType,
    requiresServerAutoPlay,
    submitAction,
    targetSelection,
    targetContext,
    readBattle,
  ]);

  const autoActionDelayMs = getAutoTurnDelayMs(battleSpeed);
  const forcedTurn =
    !requiresServerAutoPlay &&
    !autoPlay &&
    isPlayerTurn &&
    battlePhase === 'turn_active' &&
    Boolean(currentChampion) &&
    getAvailableActions().length === 0;
  const shouldAutoAdvance =
    shouldAutoAdvanceCombatTurn({
      phase: battlePhase,
      isAuthorityRun: requiresServerAutoPlay,
      autoPlay,
      isPlayerTurn,
    }) || forcedTurn;

  // Enemy/auto turns advance on a timer. A player with no legal command also
  // advances through the engine's skipped-turn cycle; this never selects an action.
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
      window.clearInterval(countdown);
      const current = readBattle();
      if (
        current.phase === 'turn_active' &&
        current.currentTurnChampionId === scheduledTurn.championId &&
        current.currentTurnSide === scheduledTurn.side &&
        current.round === scheduledTurn.round &&
        (!forcedTurn || getAvailableActions().length === 0)
      ) {
        if (forcedTurn) advanceBlockedTurn();
        else processTurn();
      }
      setAutoActionRemainingMs(null);
    }, autoActionDelayMs);

    return () => {
      window.clearInterval(countdown);
      window.clearTimeout(timer);
    };
  }, [
    autoActionDelayMs,
    advanceBlockedTurn,
    currentTurnChampionId,
    currentTurnSide,
    forcedTurn,
    getAvailableActions,
    processTurn,
    round,
    shouldAutoAdvance,
    readBattle,
  ]);

  // Keyboard shortcuts
  const canCast =
    !requiresServerAutoPlay && !autoPlay && isPlayerTurn && battlePhase === 'turn_active';
  const canCastSlot = useCallback(
    (slot: 'Q' | 'W' | 'E' | 'R') => {
      if (!canCast || !currentSpell) return false;
      const sp = currentSpell.find((s) => s.slot === slot);
      return (
        !!sp &&
        sp.isReady &&
        getAvailableActions().some((option) => option.type === SLOT_TO_ACTION[slot])
      );
    },
    [canCast, currentSpell, getAvailableActions],
  );

  const visibleActionOptions = canCast ? getAvailableActions() : [];
  const pendingOption = visibleActionOptions.find(
    (candidate) => candidate.type === pendingActionType,
  );
  const canConfirm = Boolean(
    pendingOption &&
      (!pendingOption.requiresTarget ||
        optionAcceptsTarget(pendingOption, targetSelection, targetContext)),
  );

  useKeyboardShortcuts({
    onCastQ: canCastSlot('Q') ? () => handleCast('Q') : undefined,
    onCastW: canCastSlot('W') ? () => handleCast('W') : undefined,
    onCastE: canCastSlot('E') ? () => handleCast('E') : undefined,
    onCastR: canCastSlot('R') ? () => handleCast('R') : undefined,
    onNextTurn: canConfirm ? confirmAction : undefined,
    onConfirm: canConfirm ? confirmAction : undefined,
    onBack: canLeaveActiveCombat(battlePhase) ? () => navigate(ROUTES.RUN) : undefined,
    enabled: keyboardShortcutsEnabled && battlePhase !== 'finished',
  });

  const selectableTargetKeys = new Set(
    (pendingOption
      ? [pendingOption]
      : visibleActionOptions.filter((option) => option.requiresTarget)
    ).flatMap((option) => {
      return optionTargets(option, targetContext).map((target) =>
        combatTargetKey(target.side, target.id),
      );
    }),
  );
  const selectedTarget = [...playerTeam, ...enemyTeam].find(
    (combatant) =>
      combatant.side === targetSelection?.side && combatant.targetId === targetSelection.targetId,
  );
  const showPlayerControls =
    !requiresServerAutoPlay &&
    !autoPlay &&
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

  const pendingActionName =
    pendingOption?.type === ActionType.BasicAttack
      ? fr.combat.baseAttack
      : currentChampion?.spells.find((spell) => SLOT_TO_ACTION[spell.slot] === pendingOption?.type)
          ?.name;
  const pendingTargetName = pendingOption?.requiresTarget
    ? selectedTarget?.name
    : pendingOption?.targeting === TargetingType.Self
      ? currentChampion?.name
      : pendingOption?.targeting === TargetingType.Allies
        ? fr.combat.playerTeam
        : fr.combat.enemyTeam;
  const confirmationLabel =
    canConfirm && pendingActionName
      ? combatCopy.page.command.confirm(pendingActionName, pendingTargetName)
      : combatCopy.page.command.confirmSelection;
  const commandStatus = canConfirm
    ? { label: combatCopy.page.command.commandReady, text: confirmationLabel }
    : pendingOption
      ? {
          label: combatCopy.page.command.targetRequired,
          text: fr.combat.chooseTarget,
        }
      : selectedTarget
        ? {
            label: combatCopy.page.command.targetReady,
            text: combatCopy.page.command.selectedTarget(selectedTarget.name),
          }
        : battlePhase === 'finished'
          ? {
              label: combatCopy.page.command.combatFinished,
              text: combatCopy.page.command.combatFinishedDetail,
            }
          : requiresServerAutoPlay
            ? {
                label: combatCopy.page.command.serverResolution,
                text: fr.combat.serverAutoRequired,
              }
            : autoActionRemainingMs !== null
              ? {
                  label: isPlayerTurn
                    ? forcedTurn
                      ? combatCopy.page.command.forcedTurn
                      : combatCopy.page.command.automaticAction
                    : combatCopy.page.command.enemyTurn,
                  text: isPlayerTurn
                    ? forcedTurn
                      ? combatCopy.page.command.forcedTurnDetail
                      : combatCopy.page.command.automaticPlayerDetail
                    : combatCopy.page.command.automaticEnemyDetail,
                }
              : isPlayerTurn && autoPlay
                ? {
                    label: combatCopy.page.command.autoplayActive,
                    text: combatCopy.page.command.autoplayDetail,
                  }
                : isPlayerTurn
                  ? {
                      label: combatCopy.page.command.yourTurn,
                      text: combatCopy.page.command.yourTurnDetail,
                    }
                  : battlePhase === 'idle' || battlePhase === 'starting'
                    ? {
                        label: combatCopy.page.command.preparation,
                        text: combatCopy.page.command.preparationDetail,
                      }
                    : {
                        label: combatCopy.page.command.enemyTurn,
                        text: combatCopy.page.command.enemyTurnDetail,
                      };
  const targetStepText =
    pendingOption && !canConfirm
      ? combatCopy.page.command.selectValidPortrait
      : (pendingTargetName ??
        selectedTarget?.name ??
        combatCopy.page.command.targetDependsOnAction);
  const arenaStatus =
    autoActionRemainingMs !== null
      ? combatCopy.page.status.countdown(
          requiresServerAutoPlay
            ? combatCopy.page.command.serverResolution
            : isPlayerTurn
              ? forcedTurn
                ? combatCopy.page.command.forcedTurn
                : combatCopy.page.command.automaticAction
              : combatCopy.page.status.enemyAction,
          formatNumber(autoActionRemainingMs / 1000, {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
        )
      : isPlayerTurn
        ? combatCopy.page.status.manual
        : combatCopy.page.status.waitingForEnemy;
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

  const toggleAutoPlay = useCallback(() => {
    if (requiresServerAutoPlay) return;
    setPendingActionType(undefined);
    stagedActorRef.current = null;
    setTargetSelection(undefined);
    setAutoPlay((current) => !current);
  }, [requiresServerAutoPlay]);

  return {
    autoPlay,
    autoActionRemainingMs,
    targetSelection,
    pendingActionType,
    currentChampion,
    chooseAction,
    handleCast,
    handleTargetSelect,
    confirmAction,
    visibleActionOptions,
    canConfirm,
    selectableTargetKeys,
    selectedTarget,
    showPlayerControls,
    showManualConfirmation,
    confirmationLabel,
    commandStatus,
    targetStepText,
    arenaStatus,
    isVisualSource,
    isVisualTarget,
    toggleAutoPlay,
  };
}
