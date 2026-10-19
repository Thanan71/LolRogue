import { useCallback, useEffect, useMemo, useRef } from 'react';
import { ROUTES } from '@/config/routes';
import { championDB } from '@/data';
import { CURRENT_AUTHORITY_VERSION, hasAuthorityFeature } from '@/game/authority/versionRegistry';
import { supportsManualAuthorityCombat } from '@/game/battle/autoplay';
import type { BattleEvent } from '@/game/battle/types';
import { NodeType } from '@/game/map/types';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import {
  buildCombatantTiers,
  buildResolvedEnemyTeam,
  resolveCombatEncounter,
} from '@/game/run/encounterResolver';
import { buildRunPlayerTeam } from '@/game/run/runCombatant';
import { getRequiredStarterCount } from '@/game/run/runStartValidation';
import { useAppNavigate } from '@/hooks/useAppNavigate';
import { useRunImagePreload } from '@/hooks/useRunImagePreload';
import { useBattleStore } from '@/stores/battleStore';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { finalizeCombatRun } from '@/stores/runCombatFinalization';
import { useRunStore } from '@/stores/runStore';
import { getDifficultyMultiplier, useSettingsStore } from '@/stores/settingsStore';
import type { FinalCombatantState } from '@/types/run';
import { logger } from '@/utils/logger';
import { createScopedRunRng } from '@/utils/runRandom';
import { completeCombat, navigateFinalizedCombat } from '../application/combatCompletion';
import {
  buildLegacyEnemyTeam,
  usesLegacyEncounterRules,
} from '../application/legacyCombatEncounter';
import { getEnhancementDescriptions } from '../presentation/combatPresenter';

export function useCombatEncounter() {
  useRunImagePreload();
  const isActive = useRunStore((s) => s.isActive);
  const team = useRunStore((s) => s.team);
  const runLevel = useRunStore((s) => s.runLevel);
  const currentWave = useRunStore((s) => s.currentWave);
  const currentBiomeIndex = useRunStore((s) => s.currentBiomeIndex);
  const authorityAttempt = useRunStore((s) => s.authorityAttempt);
  const runMode = useRunStore((s) => s.mode);
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
  const runProgressionAssists = hasAuthorityFeature(
    authorityAttempt?.engineVersion ?? CURRENT_AUTHORITY_VERSION.engine,
    'runProgressionAssists',
  );
  const requiresServerAutoPlay =
    (isAuthorityRun && !supportsManualCombat) || combatRecoveryRequired;

  const hasNavigatedAfterLossRef = useRef(false);
  useEffect(() => {
    if (battlePhase === 'starting') hasNavigatedAfterLossRef.current = false;
  }, [battlePhase]);

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
        runeOwnerChampionIds:
          authorityAttempt?.initialTeam ??
          team.slice(0, getRequiredStarterCount(runMode)).map((member) => member.championId),
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
    [
      augmentIds,
      authorityAttempt,
      enhancementStates,
      inventory,
      runeIds,
      runeStacks,
      runMode,
      team,
    ],
  );

  const playerInstances = useMemo(() => {
    return buildRunPlayerTeam(team, {
      engineVersion: authorityAttempt?.engineVersion,
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
        navigateFinalizedCombat(outcome, navigate);
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
  const initialMpOverrides = useMemo(() => {
    const overrides: Record<string, number> = {};
    for (const member of team) {
      if (member.currentMp === undefined) continue;
      const instance = playerInstances.find((champion) => champion.id === member.championId);
      const maxMp = instance?.getEnhancedStats().mp;
      overrides[member.championId] =
        maxMp === undefined
          ? Math.max(0, member.currentMp)
          : Math.min(maxMp, Math.max(0, member.currentMp));
    }
    return Object.keys(overrides).length > 0 ? overrides : undefined;
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
        starterTeamSize: authorityAttempt?.initialTeam.length ?? getRequiredStarterCount(runMode),
      }),
      authorityAttempt?.engineVersion,
    );
  }, [
    authorityAttempt?.engineVersion,
    currentEncounter?.id,
    currentEncounter?.type,
    currentNode,
    currentWave,
    effectiveDifficulty,
    inventory,
    runMode,
    runLevel,
    runSeed,
    usesLegacyEncounterRulesForAttempt,
  ]);

  const combatantTiers = useMemo(
    () => buildCombatantTiers(enemyInstances, currentNode?.type ?? NodeType.Combat),
    [enemyInstances, currentNode?.type],
  );

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

  return {
    isActive,
    battlePhase,
    round,
    playerTeam,
    enemyTeam,
    currentTurnChampionId,
    currentTurnSide,
    winner,
    isPlayerTurn,
    visualEvent,
    battleSpeed,
    keyboardShortcutsEnabled,
    setKeyboardShortcutsEnabled,
    requiresServerAutoPlay,
    playerEnhancementBonuses,
    navigate,
    engineOptions: {
      playerTeam: playerInstances,
      enemyTeam: enemyInstances,
      onComplete: handleComplete,
      initialHpOverrides,
      initialMpOverrides,
      random: battleRandom,
      ruleLoadout,
      combatantTiers,
      runProgressionAssists,
    },
  };
}
