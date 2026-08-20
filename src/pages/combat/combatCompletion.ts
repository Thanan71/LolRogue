import { ROUTES, type RoutePath } from '@/config/routes';
import { ITEM_DATABASE } from '@/data/items';
import type { CombatActionTrace } from '@/game/battle/actionTrace';
import { isFinalRunVictory } from '@/game/battle/runOutcome';
import type { BattleEvent } from '@/game/battle/types';
import type { ChampionInstance } from '@/game/ChampionInstance';
import { NodeType } from '@/game/map/types';
import { itemDefinitionToRunItem, resolveCombatEncounter } from '@/game/run/encounterResolver';
import { resolvePostCombatTeam } from '@/game/run/postCombatRules';
import { createRunAugmentManager } from '@/game/run/runCombatant';
import { finalizeCombatRun } from '@/game/run/runFinalization';
import { useRunStore } from '@/stores/runStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { FinalCombatantState } from '@/types/run';
import { logger } from '@/utils/logger';
import { createScopedRunRng } from '@/utils/runRandom';
import { calculateXpGain } from '@/utils/xpSystem';
import { usesLegacyEncounterRules } from './legacyCombatEncounter';

interface CompleteCombatInput {
  winner: 'player' | 'enemy' | 'draw';
  finalPlayerStates: FinalCombatantState[];
  consumedItemInstanceIds: string[];
  nextRuneStacks: Record<string, Record<string, number>>;
  playerActionTrace: CombatActionTrace;
  combatEvents?: BattleEvent[];
  supportsManualCombat: boolean;
  playerInstances: readonly ChampionInstance[];
  navigate: (route: RoutePath, options?: NavigateOptions) => void;
}

/** Commits rewards and terminal transitions after the battle engine has stopped. */
export function completeCombat({
  winner: w,
  finalPlayerStates,
  consumedItemInstanceIds,
  nextRuneStacks,
  playerActionTrace,
  combatEvents = [],
  supportsManualCombat,
  playerInstances,
  navigate,
}: CompleteCombatInput): void {
  const commandState = useRunStore.getState();
  const combatNodeId = commandState.currentNodeId;
  const previousClaims = commandState.claimedEncounterNodeIds;
  if (
    !combatNodeId ||
    !commandState.claimCurrentEncounter() ||
    !useRunStore.getState().recordRunCommand(
      {
        kind: 'resolve_combat',
        nodeId: combatNodeId,
        actions: supportsManualCombat ? playerActionTrace : undefined,
      },
      `resolve_combat:${commandState.currentBiomeIndex}:${combatNodeId}`,
    )
  ) {
    useRunStore.setState({ claimedEncounterNodeIds: previousClaims });
    logger.error('CombatPage: unable to record the authoritative combat resolution.');
    return;
  }
  useRunStore.getState().consumeItems(consumedItemInstanceIds, {
    source: 'combat',
    nodeId: combatNodeId,
    wave: commandState.currentWave,
  });
  useRunStore.getState().setRuneStacks(nextRuneStacks);
  useRunStore.getState().commitCombatEvents(combatEvents);

  if (w === 'player') {
    const runStore = useRunStore.getState();
    const currentNode = runStore.getCurrentNode();
    const encounter = currentNode?.encounter;
    if (
      !currentNode ||
      encounter?.type !== 'combat' ||
      ![NodeType.Combat, NodeType.Elite, NodeType.Boss].includes(currentNode.type)
    ) {
      logger.error('CombatPage: the resolved combat encounter is unavailable.');
      return;
    }

    const augmentManager = createRunAugmentManager(runStore.augmentIds, runStore.currentBiomeIndex);
    const usesLegacyRewards =
      runStore.authorityAttempt !== null &&
      usesLegacyEncounterRules(runStore.authorityAttempt.engineVersion);
    const resolution = usesLegacyRewards
      ? null
      : resolveCombatEncounter({
          seed: runStore.seed,
          nodeId: currentNode.id,
          biome: currentNode.biome,
          nodeType: currentNode.type as NodeType.Combat | NodeType.Elite | NodeType.Boss,
          wave: runStore.currentWave,
          runLevel: runStore.runLevel,
          difficulty:
            runStore.authorityAttempt?.difficulty ?? useSettingsStore.getState().difficulty,
          encounter,
          inventory: runStore.inventory,
          bonusGold: augmentManager.getBonusGold(),
        });
    const goldReward =
      resolution?.reward.gold ?? 50 + runStore.runLevel * 10 + augmentManager.getBonusGold();
    runStore.addGold(goldReward, {
      source: 'combat',
      nodeId: currentNode.id,
      wave: runStore.currentWave,
    });

    // Team XP includes KO champions by design. This avoids a permanent
    // snowball and matches the authority replay and reward copy.
    const isBossNode = currentNode?.type === 'boss';
    const xpGain =
      resolution?.reward.xpPerChampion ??
      calculateXpGain(runStore.runLevel, currentNode.type === NodeType.Elite, isBossNode);

    const postCombat = resolvePostCombatTeam({
      team: runStore.team,
      finalPlayerStates,
      xpPerChampion: xpGain,
      healAfterBattlePercent: augmentManager.getHealAfterBattlePercent(),
      getPreLevelMaxHp: (member) =>
        playerInstances.find((champion) => champion.id === member.championId)?.getEnhancedStats()
          .hp ?? 1,
      getPreLevelMaxMp: (member) =>
        playerInstances.find((champion) => champion.id === member.championId)?.getEnhancedStats()
          .mp ?? 0,
    });
    runStore.updateTeamAfterCombat(postCombat.updates);
    runStore.queueSpellUpgrades(postCombat.pendingSpellUpgradeChampionIds);
    const levelsGained = postCombat.levelsGained;

    let droppedItemName: string | null = null;
    if (resolution?.reward.droppedItem) {
      const itemResult = runStore.addItem(resolution.reward.droppedItem, {
        source: 'combat',
        nodeId: currentNode.id,
        wave: runStore.currentWave,
      });
      if (itemResult.success) droppedItemName = resolution.reward.droppedItem.name;
    }

    // Legacy engines chose their drop after incrementing the wave and used
    // a different RNG scope. Preserve it only for in-flight old attempts.
    runStore.completeCombatProgression();
    if (usesLegacyRewards) {
      const itemRng = createScopedRunRng(
        runStore.seed,
        `drop:${currentNode.id}:${useRunStore.getState().totalWavesCompleted}`,
      );
      if (itemRng.next() < 0.2) {
        const definitions = Object.values(ITEM_DATABASE);
        const definition = definitions[Math.floor(itemRng.next() * definitions.length)];
        if (definition) {
          const item = itemDefinitionToRunItem(definition);
          const itemResult = runStore.addItem(item, {
            source: 'combat',
            nodeId: currentNode.id,
            wave: runStore.currentWave,
          });
          if (itemResult.success) droppedItemName = item.name;
        }
      }
    }
    runStore.setLastCombatRewards({
      xp: xpGain,
      gold: goldReward,
      itemName: droppedItemName,
      itemBlockedByCapacity: resolution?.reward.dropBlockedByCapacity ?? false,
      levelsGained,
    });

    // Complete current map node (unlocks next nodes).
    let advancedToNextBiome = false;
    if (currentNode) {
      // 6. Resolve encounter (completes the node)
      if (!runStore.resolveEncounter()) {
        logger.error('CombatPage: unable to record the completed combat node.');
        return;
      }

      // 7. Check if we just completed the boss -- advance to next biome
      if (isBossNode) {
        advancedToNextBiome = runStore.advanceToNextBiome();
      }
    }

    // Only the boss of the last biome ends the run.
    if (isFinalRunVictory(isBossNode, advancedToNextBiome)) {
      void finalizeCombatRun('player', finalPlayerStates).then((outcome) => {
        if (outcome.completed || outcome.queuedForRetry) {
          navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
        }
      });
      return;
    }

    // Navigate back to the map to choose the next node
    navigate(ROUTES.RUN);
  } else {
    void finalizeCombatRun(w, finalPlayerStates).then((outcome) => {
      if (outcome.completed || outcome.queuedForRetry) {
        navigate(ROUTES.GAME_OVER, { state: { summary: outcome.summary } });
      }
    });
  }
}

import type { NavigateOptions } from 'react-router-dom';
