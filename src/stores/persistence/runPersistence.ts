import {
  deriveLegacyFrontier,
  isCurrentEncounterValid,
  synchronizeMapFrontier,
  toEncounterNodeType,
} from '@/game/map/mapProgression';
import { findNode } from '@/game/map/mapUtils';
import { usesCanonicalProgression } from '@/game/run/runAuthorityJournal';
import { normalizeRunDomainState } from '@/game/run/runDomainInvariants';
import { cloneRunLedger, migrateLegacyStatsToLedger } from '@/game/run/runLedger';
import { isPersistedRunState } from '@/game/run/runPersistenceValidation';
import { generateAugmentChoices } from '@/game/run/runProgression';
import { runError } from '@/i18n/runErrorContent';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import type { RunState } from '@/types/run';
import { quarantinePersistedState, recoverVersionedState } from '@/utils/persistence';

export const RUN_STORAGE_KEY = 'lolrogue-run-storage';
export const RUN_SCHEMA_VERSION = 7;

export function migratePersistedRunState(persisted: unknown, version: number): RunState {
  try {
    return migrateValidatedRunState(persisted, version);
  } catch {
    quarantinePersistedState(RUN_STORAGE_KEY, persisted, 'run_migration_failed');
    return structuredClone(RUN_INITIAL_STATE);
  }
}

function migrateValidatedRunState(persisted: unknown, version: number): RunState {
  const state = recoverVersionedState(persisted, {
    name: RUN_STORAGE_KEY,
    version,
    currentVersion: RUN_SCHEMA_VERSION,
    defaults: RUN_INITIAL_STATE,
    validate: isPersistedRunState,
    migrate: (candidate, sourceVersion) => (sourceVersion >= 0 ? candidate : null),
  });
  const hasTerminalFailure =
    state.saveFailureKind === 'terminal' ||
    state.authorityAttempt?.status === 'rejected' ||
    state.authorityAttempt?.status === 'expired';
  const needsAuthorityRevalidation =
    !hasTerminalFailure && state.authorityAttempt !== null && state.completedRunSnapshot !== null;
  const needsSavedResultRecovery =
    needsAuthorityRevalidation &&
    (state.saveStatus === 'saved' ||
      state.saveStatus === 'recovering' ||
      state.authorityAttempt?.status === 'verified');
  const hasInterruptedSave =
    !hasTerminalFailure &&
    !needsSavedResultRecovery &&
    (needsAuthorityRevalidation || ['saving', 'retrying'].includes(state.saveStatus));
  const domainState = normalizeRunDomainState({
    team:
      (state.isActive || needsAuthorityRevalidation) &&
      state.team.length === 0 &&
      state.authorityAttempt
        ? state.authorityAttempt.initialTeam.map((championId) => ({ championId }))
        : state.team,
    inventory: state.inventory,
    pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
  });
  const legacyStats =
    isPersistedRunState(persisted) &&
    typeof persisted === 'object' &&
    Array.isArray((persisted as { completedCombatStats?: unknown }).completedCombatStats)
      ? ((persisted as { completedCombatStats: import('@/types/run').ChampionRunStats[] })
          .completedCombatStats ?? [])
      : [];
  const ledger =
    version >= 5 && (state.ledger?.version === 1 || state.ledger?.version === 2)
      ? cloneRunLedger(state.ledger)
      : migrateLegacyStatsToLedger(
          legacyStats,
          state.team.map((member) => member.championId),
          state.gold,
        );
  const currentMap = state.biomeMaps[state.currentBiomeIndex];
  const persistedFrontier =
    version >= 3 && Array.isArray(state.frontierNodeIds)
      ? state.frontierNodeIds.filter((id) => Boolean(currentMap && findNode(currentMap, id)))
      : deriveLegacyFrontier({
          map: currentMap,
          currentNodeId: state.currentNodeId,
          completedNodeIds: state.completedNodeIds ?? [],
          pendingNodeId: state.pendingEncounter?.nodeId ?? null,
        });
  let currentNodeId = state.currentNodeId;
  let pendingEncounter = state.pendingEncounter;
  let currentEncounter = state.currentEncounter;
  const currentNode = currentMap && currentNodeId ? findNode(currentMap, currentNodeId) : undefined;
  const canonicalNodeType = currentNode ? toEncounterNodeType(currentNode) : null;
  const pendingIsValid = isCurrentEncounterValid({
    map: currentMap,
    currentNodeId,
    pendingEncounter,
    completedNodeIds: state.completedNodeIds ?? [],
  });

  if (!pendingIsValid) {
    pendingEncounter = null;
    currentEncounter = null;
    // A refresh may land between the atomic movement state change and the page
    // transition. Recreate only the canonical encounter stored on the node.
    if (
      currentNode &&
      canonicalNodeType &&
      currentNode.encounter &&
      !currentNode.completed &&
      !(state.completedNodeIds ?? []).includes(currentNode.id) &&
      persistedFrontier.length === 0
    ) {
      pendingEncounter = { nodeId: currentNode.id, nodeType: canonicalNodeType };
      if (
        canonicalNodeType === 'combat' ||
        canonicalNodeType === 'elite' ||
        canonicalNodeType === 'boss'
      ) {
        currentEncounter = currentNode.encounter as import('@/game/map/types').CombatEncounter;
      }
    } else if (
      currentNode &&
      currentNode.id === currentMap?.startNodeId &&
      persistedFrontier.includes(currentNode.id)
    ) {
      // Version 2 stored the unselected entry node as the current position.
      currentNodeId = null;
    }
  } else if (
    canonicalNodeType === 'combat' ||
    canonicalNodeType === 'elite' ||
    canonicalNodeType === 'boss'
  ) {
    currentEncounter =
      (currentNode?.encounter as import('@/game/map/types').CombatEncounter | undefined) ?? null;
  } else {
    currentEncounter = null;
  }

  const commandPath =
    state.authorityAttempt?.commands
      .filter((command) => command.kind === 'move_node')
      .map((command) => command.payload.node_id)
      .filter(Boolean) ?? [];
  const chosenPathNodeIds =
    version >= 3 && Array.isArray(state.chosenPathNodeIds)
      ? [...new Set(state.chosenPathNodeIds)]
      : [
          ...new Set(
            commandPath.length > 0
              ? commandPath
              : [...(state.completedNodeIds ?? []), state.currentNodeId].filter(
                  (id): id is string => Boolean(id),
                ),
          ),
        ];

  const shopNodeStates = { ...(state.shopNodeStates ?? {}) };
  for (const command of state.authorityAttempt?.commands ?? []) {
    if (command.kind !== 'shop_buy_item' && command.kind !== 'shop_recruit') continue;
    const nodeId = command.payload.node_id;
    const offerId =
      command.kind === 'shop_buy_item' ? command.payload.item_id : command.payload.champion_id;
    if (!nodeId || !offerId) continue;
    const previous = shopNodeStates[nodeId] ?? {
      visited: true,
      purchasedItemIds: [],
      recruitedChampionIds: [],
    };
    shopNodeStates[nodeId] = {
      visited: true,
      purchasedItemIds:
        command.kind === 'shop_buy_item'
          ? [...new Set([...previous.purchasedItemIds, offerId])]
          : [...previous.purchasedItemIds],
      recruitedChampionIds:
        command.kind === 'shop_recruit'
          ? [...new Set([...previous.recruitedChampionIds, offerId])]
          : [...previous.recruitedChampionIds],
    };
  }

  // A legacy guest shop did not persist purchases. Closing its remaining stock
  // is the only safe recovery: otherwise a refresh would recreate every offer.
  if (
    version < 3 &&
    !state.authorityAttempt &&
    state.pendingEncounter?.nodeType === 'shop' &&
    currentMap
  ) {
    const node = findNode(currentMap, state.pendingEncounter.nodeId);
    if (node?.encounter?.type === 'shop') {
      shopNodeStates[node.id] = {
        visited: true,
        purchasedItemIds: node.encounter.items.map((item) => item.itemId),
        recruitedChampionIds: node.encounter.recruitableChampions.map(
          (champion) => champion.championId,
        ),
      };
    }
  }

  const usesCurrentProgression = usesCanonicalProgression(state.authorityAttempt);
  const shouldMigrateProgression = version < 4 && state.isActive && usesCurrentProgression;
  const runLevel = shouldMigrateProgression ? state.currentBiomeIndex + 1 : state.runLevel;
  const currentWave = shouldMigrateProgression ? state.totalWavesCompleted + 1 : state.currentWave;
  let pendingAugmentIds = state.pendingAugmentIds;
  const progressionSeed = state.authorityAttempt?.seed ?? state.seed;
  if (
    shouldMigrateProgression &&
    pendingAugmentIds.length === 0 &&
    state.currentBiomeIndex > 0 &&
    currentNodeId === null &&
    persistedFrontier.includes(currentMap?.startNodeId ?? '') &&
    typeof progressionSeed === 'number' &&
    Number.isSafeInteger(progressionSeed)
  ) {
    pendingAugmentIds = generateAugmentChoices({
      seed: progressionSeed,
      completedBiomeIndex: state.currentBiomeIndex - 1,
      runLevel,
      ownedAugmentIds: state.augmentIds,
    });
  }

  synchronizeMapFrontier(state.biomeMaps, state.currentBiomeIndex, persistedFrontier);
  const itemCounterPrefix = `item_${state.runId}_`;
  const maximumPersistedItemCounter = domainState.inventory.reduce((maximum, entry) => {
    if (!entry.instanceId.startsWith(itemCounterPrefix)) return maximum;
    const suffix = Number(entry.instanceId.slice(itemCounterPrefix.length));
    return Number.isSafeInteger(suffix) && suffix > maximum ? suffix : maximum;
  }, 0);
  return {
    ...state,
    isActive:
      !hasTerminalFailure &&
      (state.isActive || needsAuthorityRevalidation) &&
      domainState.team.length > 0,
    isEnding: false,
    runId: needsAuthorityRevalidation ? state.completedRunSnapshot!.runId : state.runId,
    mode: needsAuthorityRevalidation ? state.completedRunSnapshot!.mode : state.mode,
    startedAt: needsAuthorityRevalidation ? state.completedRunSnapshot!.startedAt : state.startedAt,
    seed: needsAuthorityRevalidation ? state.completedRunSnapshot!.seed : state.seed,
    // Serialized "verified" data is merely an untrusted cache, never a server receipt.
    serverProgression: null,
    // This local status only selects a read of the server receipt. It cannot
    // restore progression or authorize another reward grant.
    authorityAttempt: needsSavedResultRecovery
      ? { ...state.authorityAttempt!, status: 'verified' }
      : state.authorityAttempt,
    saveStatus: needsSavedResultRecovery
      ? 'recovering'
      : hasTerminalFailure || hasInterruptedSave
        ? 'failed'
        : state.saveStatus,
    saveError: hasTerminalFailure
      ? (state.saveError ??
        (state.authorityAttempt?.status === 'expired'
          ? runError.attemptExpired
          : state.authorityAttempt?.status === 'rejected'
            ? runError.traceRejected(null)
            : runError.finalizationFailed))
      : needsSavedResultRecovery
        ? null
        : hasInterruptedSave
          ? runError.saveInterrupted
          : state.saveError,
    saveFailureKind: hasTerminalFailure
      ? 'terminal'
      : needsSavedResultRecovery
        ? null
        : hasInterruptedSave
          ? 'retryable'
          : state.saveFailureKind,
    ledger,
    runLevel,
    currentWave,
    pendingAugmentIds,
    team: domainState.team,
    inventory: domainState.inventory,
    pendingSpellUpgradeChampionIds: domainState.pendingSpellUpgradeChampionIds,
    nextItemInstanceId: Math.max(
      1,
      Number.isSafeInteger(state.nextItemInstanceId) ? state.nextItemInstanceId : 1,
      maximumPersistedItemCounter + 1,
    ),
    currentNodeId,
    frontierNodeIds: persistedFrontier,
    chosenPathNodeIds,
    completedNodeIds: [...new Set(state.completedNodeIds ?? [])],
    claimedEncounterNodeIds: [...new Set(state.claimedEncounterNodeIds ?? [])],
    shopNodeStates,
    pendingEncounter,
    currentEncounter,
    combatCheckpointNodeId:
      pendingEncounter && state.combatCheckpointNodeId === pendingEncounter.nodeId
        ? state.combatCheckpointNodeId
        : null,
    combatRecoveryRequired: Boolean(
      pendingEncounter && state.combatCheckpointNodeId === pendingEncounter.nodeId,
    ),
  };
}
