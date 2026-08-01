import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { championDB } from '@/data';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import { completeNode as completeNodeUtil, findNode } from '@/game/map/mapUtils';
import {
  deriveLegacyFrontier,
  isCurrentEncounterValid,
  isFrontierMoveAllowed,
  synchronizeMapFrontier,
  toEncounterNodeType,
} from '@/game/map/mapProgression';
import { canClaimEncounterReward, shouldApplyRunRewards } from '@/game/run/runState';
import {
  buildRunSummaryFromLedger,
  cloneRunLedger,
  commitCombatEvents as commitCombatEventsToLedger,
  createRunLedger,
  ensureLedgerChampion,
  migrateLegacyStatsToLedger,
  recordGoldGain,
  recordGoldSpend,
  recordItemLedgerEvent,
} from '@/game/run/runLedger';
import {
  completeCombatProgression,
  generateAugmentChoices,
  transitionToNextBiome,
} from '@/game/run/runProgression';
import { validateAugmentSelection } from '@/game/run/augmentSelectionRules';
import { getItemSaleGold, getShopItemCost, getShopRecruitCost } from '@/game/run/runEncounterRules';
import { createRunAugmentManager } from '@/game/run/runCombatant';
import { getPersistedActiveRun, withExclusiveRunStart } from '@/game/run/runStartCoordinator';
import { getUnlockedStarterSlotCount, validateRunStartTeam } from '@/game/run/runStartValidation';
import { RepositoryContainerFactory } from '@/services/container';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import {
  getCanonicalRunItem,
  validateItemAddition,
  validateItemEquipment,
} from '@/game/inventory/inventoryRules';
import { normalizeRunDomainState } from '@/game/run/runDomainInvariants';
import {
  canUpgradeSpell,
  normalizeSpellRanks,
  queueSpellUpgradeChoices,
} from '@/game/run/spellUpgradeRules';
import { validateTeamAddition, validateTeamChampionIds } from '@/game/run/teamRules';
import {
  appendRunAttemptCommands,
  RunVerificationRejectedError,
  recoverVerifiedRunAttempt,
  sealRunAttempt,
  startRunAttempt,
  verifyRunAttempt,
} from '@/services/runAttemptService';
import { supabase } from '@/services/supabaseClient';
import {
  type CompletedRunSnapshot,
  type InventoryEntry,
  MAX_INVENTORY_ITEMS,
  MAX_TEAM_SIZE,
  type RunStore,
  type RunState,
  type RunEndResult,
  type RunLifecycleErrorCode,
  type RunMutationErrorCode,
  type RunMutationResult,
  type RunStartResult,
  type RunSummary,
  type TeamMember,
} from '@/types/run';
import type {
  PendingRunAttemptStart,
  RunAuthorityAttempt,
  RunCommandInput,
} from '@/types/runAttempt';
import { encodeCombatActionTrace } from '@/game/battle/actionTrace';
import { logger } from '@/utils/logger';
import { recoverPersistedState, safeLocalStorage } from '@/utils/persistence';
import { calculateMaxHP } from '@/utils/statCalculator';
import { useAuthStore } from './authStore';
import { calculateDailyScore, useDailyRunStore } from './dailyRunStore';
import { useEnhancementStore } from './enhancementStore';
import { useMasteryStore } from './masteryStore';
import { RUN_INITIAL_STATE } from './runInitialState';
import { useSettingsStore } from './settingsStore';

// ─── Helpers ────────────────────────────────────────────────────────────────

const CANONICAL_PROGRESSION_ENGINES = new Set([
  'run-engine-v4',
  'run-engine-v5',
  'run-engine-v6',
  'run-engine-v7',
  'run-engine-v8',
  'run-engine-v9',
  'run-engine-v10',
  'run-engine-v11',
  'run-engine-v12',
]);

function usesCanonicalProgression(attempt: RunAuthorityAttempt | null): boolean {
  return attempt === null || CANONICAL_PROGRESSION_ENGINES.has(attempt.engineVersion);
}

function cloneRunSummary(summary: RunSummary): RunSummary {
  return {
    ...summary,
    biomesVisited: [...summary.biomesVisited],
    championStats: summary.championStats.map((stats) => ({
      ...stats,
      itemsCollected: [...stats.itemsCollected],
    })),
    itemEvents: summary.itemEvents.map((event) => ({ ...event })),
  };
}

function createCommandId(): string | null {
  return typeof globalThis.crypto?.randomUUID === 'function'
    ? globalThis.crypto.randomUUID()
    : null;
}

function samePendingStart(
  pending: PendingRunAttemptStart | null,
  requested: Omit<PendingRunAttemptStart, 'commandId'>,
): pending is PendingRunAttemptStart {
  return (
    pending !== null &&
    pending.ownerUserId === requested.ownerUserId &&
    pending.mode === requested.mode &&
    pending.difficulty === requested.difficulty &&
    pending.team.length === requested.team.length &&
    pending.team.every((id, index) => id === requested.team[index]) &&
    pending.runeIds.length === requested.runeIds.length &&
    pending.runeIds.every((id, index) => id === requested.runeIds[index])
  );
}

function commandPayload(command: RunCommandInput): Record<string, string> {
  switch (command.kind) {
    case 'move_node':
    case 'rest':
    case 'recruit':
    case 'event':
    case 'treasure':
    case 'resolve_node':
      return { node_id: command.nodeId };
    case 'resolve_combat':
      return command.actions && command.actions.some((action) => !action.automatic)
        ? { node_id: command.nodeId, actions_json: encodeCombatActionTrace(command.actions) }
        : { node_id: command.nodeId };
    case 'shop_buy_item':
      return { node_id: command.nodeId, item_id: command.itemId };
    case 'shop_recruit':
      return { node_id: command.nodeId, champion_id: command.championId };
    case 'equip_item':
      return { instance_id: command.instanceId, champion_id: command.championId };
    case 'unequip_item':
    case 'sell_item':
      return { instance_id: command.instanceId };
    case 'choose_augment':
      return { augment_id: command.augmentId };
    case 'upgrade_spell':
      return { champion_id: command.championId, slot: command.slot };
    case 'abandon_run':
      return {};
  }
}

function isValidCommand(command: RunCommandInput): boolean {
  try {
    const payload = commandPayload(command);
    return Object.entries(payload).every(
      ([key, value]) =>
        typeof value === 'string' &&
        value.length > 0 &&
        value.length <= (key === 'actions_json' ? 7000 : 160),
    );
  } catch {
    return false;
  }
}

function mutationFailure(
  code: RunMutationErrorCode,
  error: string,
  retryable = false,
): RunMutationResult<never> {
  return { success: false, code, error, retryable };
}

function appendAuthorityCommand(
  state: RunState,
  command: RunCommandInput,
  explicitDedupeKey?: string,
): { success: true; authorityAttempt: RunAuthorityAttempt | null } | { success: false } {
  const attempt = state.authorityAttempt;
  if (!attempt) return { success: true, authorityAttempt: null };
  if (
    !state.isActive ||
    state.isEnding ||
    state.completedRunSnapshot !== null ||
    !['started', 'active'].includes(attempt.status) ||
    useAuthStore.getState().user?.id !== attempt.ownerUserId ||
    !isValidCommand(command)
  ) {
    return { success: false };
  }

  const payload = commandPayload(command);
  if (explicitDedupeKey) {
    const existing = attempt.commands.find(
      (candidate) => candidate.dedupeKey === explicitDedupeKey,
    );
    if (existing) {
      return existing.kind === command.kind &&
        JSON.stringify(existing.payload) === JSON.stringify(payload)
        ? { success: true, authorityAttempt: attempt }
        : { success: false };
    }
  }
  const commandId = createCommandId();
  if (!commandId) return { success: false };
  const dedupeKey = explicitDedupeKey ?? commandId;
  return {
    success: true,
    authorityAttempt: {
      ...attempt,
      commands: [
        ...attempt.commands,
        {
          commandId,
          sequence: attempt.nextSequence,
          kind: command.kind,
          payload,
          dedupeKey,
        },
      ],
      nextSequence: attempt.nextSequence + 1,
    },
  };
}

function startFailure(
  code: RunLifecycleErrorCode,
  error: string,
  retryable = false,
): RunStartResult {
  return { success: false, code, error, retryable };
}

function endFailure(
  runId: string,
  code: RunLifecycleErrorCode,
  error: string,
  retryable = false,
): RunEndResult {
  return { success: false, runId, code, error, retryable };
}

export function migratePersistedRunState(persisted: unknown, version: number): RunState {
  const state = recoverPersistedState(persisted, RUN_INITIAL_STATE);
  const domainState = normalizeRunDomainState({
    team:
      state.isActive && state.team.length === 0 && state.authorityAttempt
        ? state.authorityAttempt.initialTeam.map((championId) => ({ championId }))
        : state.team,
    inventory: state.inventory,
    pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
  });
  const legacyStats =
    persisted &&
    typeof persisted === 'object' &&
    Array.isArray((persisted as { completedCombatStats?: unknown }).completedCombatStats)
      ? ((persisted as { completedCombatStats: import('@/types/run').ChampionRunStats[] })
          .completedCombatStats ?? [])
      : [];
  const ledger =
    version >= 5 && state.ledger?.version === 1
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
    isActive: state.isActive && domainState.team.length > 0,
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
  };
}

async function refreshVerifiedProgression(userId: string): Promise<void> {
  try {
    await useAuthStore.getState().refreshPlayer();
    if (useAuthStore.getState().user?.id !== userId) return;

    const masteryResult =
      await RepositoryContainerFactory.create(supabase).mastery.getChampionMastery(userId);
    if (useAuthStore.getState().user?.id !== userId) return;

    if (masteryResult.data && !masteryResult.error) {
      useMasteryStore.getState().hydrateFromDatabase(masteryResult.data);
    } else if (masteryResult.error) {
      logger.warn(
        '[runStore.endRun] Verified progression was saved, but mastery refresh failed:',
        masteryResult.error,
      );
    }
  } catch (error) {
    logger.warn(
      '[runStore.endRun] Verified progression was saved, but profile refresh failed:',
      error,
    );
  }
}

let inFlightFinalization: { runId: string; promise: Promise<boolean> } | null = null;
let isRunStartInFlight = false;

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...RUN_INITIAL_STATE,

      // ── Run Lifecycle ───────────────────────────────────────────────────

      startRun: async (championIds, options = {}) => {
        if (isRunStartInFlight) {
          return startFailure('start_in_progress', 'A run start is already being verified.', true);
        }
        isRunStartInFlight = true;
        try {
          return await withExclusiveRunStart(async () => {
            const currentState = get();
            if (currentState.isActive || currentState.isEnding) {
              return startFailure(
                'active_run',
                'Finish or explicitly abandon the active run before starting another.',
                currentState.isEnding,
              );
            }
            const persistedActiveRun = getPersistedActiveRun();
            if (persistedActiveRun) {
              return startFailure(
                'active_run_another_tab',
                `Run ${persistedActiveRun.runId} is active in another tab. Resume it instead of starting a new one.`,
                true,
              );
            }

            const authUser = useAuthStore.getState().user;
            const resumableStart =
              authUser && get().pendingAuthorityStart?.ownerUserId === authUser.id
                ? get().pendingAuthorityStart
                : null;
            const requestedChampionIds = resumableStart?.team ?? championIds;
            const unlockedIds = Object.values(useMasteryStore.getState().champions).flatMap(
              (mastery) => mastery.unlockedIds,
            );
            const teamValidation = validateRunStartTeam(
              requestedChampionIds,
              getUnlockedStarterSlotCount(unlockedIds),
            );
            if (!teamValidation.valid) {
              return startFailure(
                teamValidation.code ?? 'invalid_team_size',
                teamValidation.error ?? 'The starting team is invalid.',
              );
            }
            const team: TeamMember[] = teamValidation.championIds.map((id) => ({
              championId: id,
            }));

            const mode = resumableStart?.mode ?? options.mode ?? 'normal';
            let canonicalMode = mode;
            const requestedRuneIds = resumableStart
              ? [...resumableStart.runeIds]
              : [...new Set((options.runeIds ?? []).filter(Boolean))].slice(0, 3);

            let runId: string;
            let seed: number;
            let startedAt: string;
            let authorityAttempt: RunAuthorityAttempt | null = null;
            let canonicalTeam = team;
            let canonicalRuneIds = requestedRuneIds;

            if (authUser) {
              const difficulty =
                resumableStart?.difficulty ??
                options.difficulty ??
                useSettingsStore.getState().difficulty;
              const requestedStart = {
                ownerUserId: authUser.id,
                mode,
                team: team.map((member) => member.championId),
                runeIds: requestedRuneIds,
                difficulty,
              } satisfies Omit<PendingRunAttemptStart, 'commandId'>;
              const pending = get().pendingAuthorityStart;
              const commandId =
                resumableStart?.commandId ??
                (samePendingStart(pending, requestedStart) ? pending.commandId : createCommandId());
              if (!commandId) {
                const error = 'This browser cannot create a secure run command.';
                set({ saveError: error });
                return startFailure('secure_command_unavailable', error);
              }

              const pendingAuthorityStart = { commandId, ...requestedStart };
              set({ pendingAuthorityStart, saveError: null });
              const attemptResult = await startRunAttempt({
                commandId,
                mode,
                team: requestedStart.team,
                runeIds: requestedRuneIds,
                difficulty,
              });
              if (attemptResult.error || !attemptResult.data) {
                const error = attemptResult.error?.message ?? 'Unable to start a verified run.';
                set({ saveError: error });
                return startFailure('start_failed', error, true);
              }
              if (useAuthStore.getState().user?.id !== authUser.id) {
                const error = 'The authenticated account changed while starting the run.';
                set({ saveError: error });
                return startFailure('account_changed', error, true);
              }

              const attempt = attemptResult.data;
              canonicalMode = attempt.mode;
              runId = attempt.runUuid;
              seed = attempt.seed;
              startedAt = attempt.startedAt;
              canonicalTeam = attempt.initialTeam.map((championId) => ({ championId }));
              canonicalRuneIds = attempt.runeIds;
              authorityAttempt = {
                attemptId: attempt.attemptId,
                runUuid: attempt.runUuid,
                ownerUserId: authUser.id,
                seed: attempt.seed,
                rulesetVersion: attempt.rulesetVersion,
                engineVersion: attempt.engineVersion,
                difficulty: attempt.difficulty,
                mode: attempt.mode,
                dailyDate: attempt.dailyDate,
                dailyRulesetVersion: attempt.dailyRulesetVersion,
                dailyScoreVersion: attempt.dailyScoreVersion,
                initialTeam: [...attempt.initialTeam],
                runeIds: [...attempt.runeIds],
                enhancementSnapshot: attempt.enhancementSnapshot,
                masterySnapshot: attempt.masterySnapshot,
                startedAt: attempt.startedAt,
                expiresAt: attempt.expiresAt,
                status: attempt.status,
                commands: [],
                nextSequence: attempt.lastSequence + 1,
                lastAcknowledgedSequence: attempt.lastSequence,
                journalHash: attempt.journalHash,
                finishCommandId: null,
              };
            } else {
              runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
              seed = options.seed ?? Date.now();
              startedAt = new Date().toISOString();
            }

            // Authenticated content is generated only after the server has frozen
            // the seed/ruleset; guest mode keeps its local deterministic seed.
            const biomeMaps = generateBiomeMaps(seed);
            const startBiome = biomeMaps[0]?.biome ?? null;
            const frontierNodeIds = biomeMaps[0]?.startNodeId ? [biomeMaps[0].startNodeId] : [];
            synchronizeMapFrontier(biomeMaps, 0, frontierNodeIds);

            set({
              isActive: true,
              mode: canonicalMode,
              runId,
              seed,
              startedAt,
              authorityAttempt,
              pendingAuthorityStart: null,
              isEnding: false,
              saveStatus: 'idle',
              saveError: null,
              saveFailureKind: null,
              completedRunSnapshot: null,
              serverProgression: null,
              rewardsApplied: false,
              ledger: createRunLedger(canonicalTeam.map((member) => member.championId)),
              nextItemInstanceId: 1,
              team: canonicalTeam,
              runLevel: 1,
              biomesVisited: startBiome ? [startBiome] : [],
              currentBiome: startBiome,
              inventory: [],
              runeIds: canonicalRuneIds,
              runeStacks: {},
              augmentIds: [],
              pendingAugmentIds: [],
              lastCombatRewards: null,
              pendingSpellUpgradeChampionIds: [],
              gold: 0,
              currentWave: 1,
              totalWavesCompleted: 0,
              biomeMaps,
              currentBiomeIndex: 0,
              currentNodeId: null,
              frontierNodeIds,
              chosenPathNodeIds: [],
              completedNodeIds: [],
              claimedEncounterNodeIds: [],
              shopNodeStates: {},
              pendingEncounter: null,
              currentEncounter: null,
            });
            return { success: true, runId, mode: canonicalMode };
          });
        } finally {
          isRunStartInFlight = false;
        }
      },

      recordRunCommand: (command, explicitDedupeKey) => {
        const state = get();
        const appended = appendAuthorityCommand(state, command, explicitDedupeKey);
        if (!appended.success) return false;
        if (appended.authorityAttempt !== state.authorityAttempt) {
          set({ authorityAttempt: appended.authorityAttempt });
        }
        return true;
      },

      endRun: async (won = false, expectedRunId?: string, displayedSummary?: RunSummary) => {
        const requestedRunId = expectedRunId ?? get().runId;
        if (expectedRunId !== undefined && get().runId !== expectedRunId) {
          return endFailure(
            requestedRunId,
            'stale_run',
            'The requested run is no longer the active run.',
          );
        }
        if (!get().isActive) {
          return {
            success: true,
            runId: requestedRunId,
            outcome: 'already_finalized',
          };
        }
        if (inFlightFinalization) {
          if (inFlightFinalization.runId !== requestedRunId) {
            return endFailure(
              requestedRunId,
              'finalization_in_progress',
              'Another run finalization is already in progress.',
              true,
            );
          }
          const succeeded = await inFlightFinalization.promise;
          const state = get();
          return succeeded
            ? {
                success: true,
                runId: requestedRunId,
                outcome: state.saveFailureKind === 'terminal' ? 'terminal' : 'saved',
              }
            : endFailure(
                requestedRunId,
                'finalization_failed',
                state.saveError ?? 'The run could not be finalized.',
                state.saveFailureKind !== 'terminal',
              );
        }

        const operation = (async (): Promise<boolean> => {
          let state = get();

          // Guard: Don't end a run that's already ended
          if (!state.isActive) {
            return true;
          }

          // This prevents stale callbacks from a previous run ending a new one.
          if (expectedRunId !== undefined && state.runId !== expectedRunId) {
            return false;
          }

          const authorityCommands = state.authorityAttempt?.commands ?? [];
          const lastCommand = authorityCommands[authorityCommands.length - 1];
          const abandonDedupeKey = `abandon_run:${state.runId}`;
          const hasRecordedAbandonment = authorityCommands.some(
            (command) => command.dedupeKey === abandonDedupeKey,
          );
          const pendingNodeType = state.pendingEncounter?.nodeType;
          const isImmediateCombatLoss =
            (pendingNodeType === 'combat' ||
              pendingNodeType === 'elite' ||
              pendingNodeType === 'boss') &&
            lastCommand?.kind === 'resolve_combat' &&
            lastCommand.payload.node_id === state.pendingEncounter?.nodeId;
          const isExplicitAbandonment =
            !won && displayedSummary === undefined && !isImmediateCombatLoss;
          if (
            !won &&
            state.authorityAttempt &&
            !isImmediateCombatLoss &&
            !hasRecordedAbandonment &&
            !get().recordRunCommand({ kind: 'abandon_run' }, abandonDedupeKey)
          ) {
            set({
              saveStatus: 'failed',
              saveError: 'The run abandonment could not be recorded.',
              saveFailureKind: 'retryable',
            });
            return false;
          }
          state = get();

          set({
            isEnding: true,
            saveStatus: state.completedRunSnapshot?.runId === state.runId ? 'retrying' : 'saving',
            saveError: null,
            saveFailureKind: null,
          });

          let snapshot =
            state.completedRunSnapshot?.runId === state.runId ? state.completedRunSnapshot : null;

          if (!snapshot) {
            let summary = displayedSummary;
            if (!summary) {
              summary = buildRunSummaryFromLedger({
                ledger: state.ledger,
                team: state.team,
                won,
                wavesCompleted: state.totalWavesCompleted,
                biomesVisited: state.biomesVisited,
                goldBalance: state.gold,
                runLevel: state.runLevel,
              });
            }

            const teamMembers = state.team.map((member) => {
              const champ = championDB.getById(member.championId);
              const enhancementState = state.authorityAttempt
                ? {
                    unlockedNodes:
                      state.authorityAttempt.enhancementSnapshot[member.championId] ??
                      state.authorityAttempt.enhancementSnapshot[member.championId.toLowerCase()] ??
                      {},
                  }
                : useEnhancementStore.getState().getEnhancementState(member.championId);
              const enhancementBonuses = champ
                ? enhancementService.calculateStatBonuses(
                    enhancementTreeProvider.getTreeForChampion(champ),
                    enhancementState.unlockedNodes,
                  )
                : undefined;
              const maxHp = champ
                ? calculateMaxHP(
                    champ,
                    member.level ?? 1,
                    enhancementBonuses,
                    state.inventory,
                    member.championId,
                    member.statBoosts,
                    member.statMultiplier,
                    state.authorityAttempt
                      ? (state.authorityAttempt.masterySnapshot?.[member.championId] ?? 0)
                      : useMasteryStore.getState().getChampionMastery(member.championId).level,
                  )
                : 100;
              return {
                championId: member.championId,
                level: member.level ?? 1,
                currentHp: member.currentHp ?? maxHp,
                currentMp: member.currentMp ?? champ?.stats.mp ?? 0,
              };
            });

            const dailyState = useDailyRunStore.getState();
            snapshot = {
              mode: state.mode,
              runId: state.runId,
              won,
              runLevel: state.runLevel,
              wavesCompleted: state.totalWavesCompleted,
              biomesVisited: [...state.biomesVisited],
              goldEarned: summary.goldEarned,
              goldSpent: summary.goldSpent,
              goldBalance: summary.goldBalance,
              summary: cloneRunSummary(summary),
              teamMembers,
              startedAt: state.startedAt,
              seed: state.seed,
              runeIds: [...state.runeIds],
              augmentIds: [...state.augmentIds],
              ledger: cloneRunLedger(state.ledger),
              daily:
                state.mode === 'daily'
                  ? {
                      dateKey: dailyState.dateKey,
                      dailySeed: state.seed ?? dailyState.seed,
                      abandoned: isExplicitAbandonment,
                      itemCount: state.inventory.length,
                      currentBiome: state.currentBiome,
                      currentWave: state.currentWave,
                      inventory: [...state.inventory],
                      score: calculateDailyScore({
                        totalWavesCompleted: state.totalWavesCompleted,
                        runLevel: state.runLevel,
                        gold: state.gold,
                        inventory: state.inventory,
                      }),
                    }
                  : null,
            } satisfies CompletedRunSnapshot;
            set({ completedRunSnapshot: snapshot, serverProgression: null });
          }

          const { user, player } = useAuthStore.getState();
          const authorityAttempt = state.authorityAttempt;
          const hasAuthenticatedAccount = user !== null;
          const isVerifiedRun = authorityAttempt !== null;
          const championIds = snapshot.teamMembers.map((member) => member.championId);

          // Only a run that was started without an authenticated account may use
          // local progression. A legacy/authenticated run cannot be promoted into
          // a verified attempt at completion time.
          if (
            !hasAuthenticatedAccount &&
            !isVerifiedRun &&
            shouldApplyRunRewards(state.rewardsApplied, championIds.length, snapshot.wavesCompleted)
          ) {
            const masteryStore = useMasteryStore.getState();
            masteryStore.awardCandies(
              championIds,
              snapshot.wavesCompleted,
              snapshot.biomesVisited.length,
              snapshot.won,
            );
            set({ rewardsApplied: true });
          }

          // Save run to database (if user is authenticated)
          logger.debug('[runStore.endRun] Checking save conditions:', {
            hasUser: !!user,
            hasPlayer: !!player,
            hasAuthorityAttempt: isVerifiedRun,
            hasRunStartTime: !!snapshot.startedAt,
            totalWavesCompleted: snapshot.wavesCompleted,
            runId: snapshot.runId,
            won: snapshot.won,
          });

          if (hasAuthenticatedAccount && !snapshot.startedAt) {
            set({
              ...RUN_INITIAL_STATE,
              completedRunSnapshot: snapshot,
              saveStatus: 'failed',
              saveError: 'Authenticated run is missing required save data',
              saveFailureKind: 'terminal',
            });
            return true;
          }

          let serverProgression = state.serverProgression;
          if (hasAuthenticatedAccount && !authorityAttempt) {
            set({
              ...RUN_INITIAL_STATE,
              completedRunSnapshot: snapshot,
              saveStatus: 'failed',
              saveError:
                'This run has no server attempt and cannot grant authenticated progression.',
              saveFailureKind: 'terminal',
            });
            return true;
          }

          if (authorityAttempt) {
            if (!user || user.id !== authorityAttempt.ownerUserId) {
              set({
                isEnding: false,
                saveStatus: 'failed',
                saveError: 'This run attempt belongs to another authenticated account.',
                saveFailureKind: 'retryable',
              });
              return false;
            }

            let syncedAttempt = authorityAttempt;
            let finishCommandId = syncedAttempt.finishCommandId;
            if (!finishCommandId) {
              finishCommandId = createCommandId();
              if (!finishCommandId) {
                set({
                  ...RUN_INITIAL_STATE,
                  completedRunSnapshot: snapshot,
                  saveStatus: 'failed',
                  saveError: 'This browser cannot create a secure finish command.',
                  saveFailureKind: 'terminal',
                });
                return true;
              }
              syncedAttempt = { ...syncedAttempt, finishCommandId };
              set({ authorityAttempt: syncedAttempt });
            }

            const pendingCommands = syncedAttempt.commands.filter(
              (command) => command.sequence > syncedAttempt.lastAcknowledgedSequence,
            );
            for (let offset = 0; offset < pendingCommands.length; offset += 50) {
              const batch = pendingCommands.slice(offset, offset + 50);
              const appendResult = await appendRunAttemptCommands(syncedAttempt.attemptId, batch);
              if (
                appendResult.data?.status === 'expired' ||
                appendResult.data?.status === 'rejected'
              ) {
                set({
                  ...RUN_INITIAL_STATE,
                  completedRunSnapshot: snapshot,
                  saveStatus: 'failed',
                  saveError:
                    appendResult.data.status === 'expired'
                      ? 'This verified run attempt has expired.'
                      : 'The run trace was rejected.',
                  saveFailureKind: 'terminal',
                });
                return true;
              }
              if (appendResult.error || !appendResult.data) {
                set({
                  isEnding: false,
                  saveStatus: 'failed',
                  saveError:
                    appendResult.error?.message ??
                    'The run command journal could not be synchronized.',
                  saveFailureKind: 'retryable',
                });
                return false;
              }
              syncedAttempt = {
                ...syncedAttempt,
                status: appendResult.data.status,
                lastAcknowledgedSequence: appendResult.data.lastSequence,
                journalHash: appendResult.data.journalHash,
              };
              set({ authorityAttempt: syncedAttempt });
            }

            const expectedSequence = syncedAttempt.nextSequence - 1;
            const sealResult = await sealRunAttempt(
              syncedAttempt.attemptId,
              finishCommandId,
              expectedSequence,
            );
            if (sealResult.data?.status === 'expired' || sealResult.data?.status === 'rejected') {
              set({
                ...RUN_INITIAL_STATE,
                completedRunSnapshot: snapshot,
                saveStatus: 'failed',
                saveError:
                  sealResult.data.status === 'expired'
                    ? 'This verified run attempt has expired.'
                    : 'The run trace was rejected.',
                saveFailureKind: 'terminal',
              });
              return true;
            }
            if (sealResult.error || !sealResult.data) {
              set({
                isEnding: false,
                saveStatus: 'failed',
                saveError: sealResult.error?.message ?? 'The run attempt could not be sealed.',
                saveFailureKind: 'retryable',
                authorityAttempt: syncedAttempt,
              });
              return false;
            }

            syncedAttempt = {
              ...syncedAttempt,
              status: sealResult.data.status === 'verified' ? 'verified' : 'verifying',
              lastAcknowledgedSequence: sealResult.data.lastSequence,
              journalHash: sealResult.data.journalHash,
            };
            set({ authorityAttempt: syncedAttempt });

            const verification =
              sealResult.data.status === 'verified'
                ? await recoverVerifiedRunAttempt(syncedAttempt.attemptId)
                : await verifyRunAttempt(syncedAttempt.attemptId);
            if (verification.error || !verification.data) {
              if (verification.error instanceof RunVerificationRejectedError) {
                set({
                  ...RUN_INITIAL_STATE,
                  completedRunSnapshot: snapshot,
                  saveStatus: 'failed',
                  saveError: verification.error.message,
                  saveFailureKind: 'terminal',
                });
                return true;
              }
              set({
                isEnding: false,
                saveStatus: 'failed',
                saveError: verification.error?.message ?? 'The run could not be verified.',
                saveFailureKind: 'retryable',
                authorityAttempt: syncedAttempt,
              });
              return false;
            }

            serverProgression = verification.data.progression;
            if (verification.data.summary) {
              const canonicalSummary = cloneRunSummary(verification.data.summary);
              snapshot = {
                ...snapshot,
                won: canonicalSummary.won,
                runLevel: canonicalSummary.runLevel,
                wavesCompleted: canonicalSummary.wavesCompleted,
                biomesVisited: [...canonicalSummary.biomesVisited],
                goldEarned: canonicalSummary.goldEarned,
                goldSpent: canonicalSummary.goldSpent,
                goldBalance: canonicalSummary.goldBalance,
                summary: canonicalSummary,
              };
              set({ completedRunSnapshot: snapshot });
            }
            set({
              serverProgression,
              authorityAttempt: { ...syncedAttempt, status: 'verified' },
            });
            // The durable server result is the completion boundary. Profile and
            // mastery hydration are best-effort and must never block Game Over.
            void refreshVerifiedProgression(user.id);
          }

          if (snapshot.mode === 'daily' && snapshot.daily) {
            useDailyRunStore.setState({
              runLevel: snapshot.runLevel,
              biomesVisited: snapshot.biomesVisited,
              currentBiome: snapshot.daily.currentBiome,
              inventory: snapshot.daily.inventory,
              gold: snapshot.goldBalance,
              currentWave: snapshot.daily.currentWave,
              totalWavesCompleted: snapshot.wavesCompleted,
              score: snapshot.daily.score,
            });
            if (!isVerifiedRun && snapshot.daily.abandoned) {
              useDailyRunStore.getState().endDailyRun();
            } else {
              const refreshedPlayer = useAuthStore.getState().player;
              useDailyRunStore
                .getState()
                .completeDailyRun(
                  refreshedPlayer?.display_name ||
                    refreshedPlayer?.username ||
                    user?.email?.split('@')[0] ||
                    'Guest',
                  !isVerifiedRun,
                );
            }
          }

          set({
            ...RUN_INITIAL_STATE,
            completedRunSnapshot: snapshot,
            serverProgression,
            saveStatus: 'saved',
          });
          return true;
        })();

        inFlightFinalization = { runId: requestedRunId, promise: operation };
        try {
          const succeeded = await operation;
          const state = get();
          return succeeded
            ? {
                success: true,
                runId: requestedRunId,
                outcome: state.saveFailureKind === 'terminal' ? 'terminal' : 'saved',
              }
            : endFailure(
                requestedRunId,
                'finalization_failed',
                state.saveError ?? 'The run could not be finalized.',
                state.saveFailureKind !== 'terminal',
              );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('[runStore.endRun] Unexpected finalization failure:', error);
          set({
            isEnding: false,
            saveStatus: 'failed',
            saveError: message || 'The run could not be finalized.',
            saveFailureKind: 'retryable',
          });
          return endFailure(
            requestedRunId,
            'finalization_failed',
            message || 'The run could not be finalized.',
            true,
          );
        } finally {
          if (inFlightFinalization?.promise === operation) inFlightFinalization = null;
        }
      },

      // ── Team Management ─────────────────────────────────────────────────

      addChampion: (championId, statMultiplier = 1) => {
        const { team, ledger } = get();
        if (!Number.isFinite(statMultiplier) || statMultiplier < 0.1 || statMultiplier > 10) {
          return mutationFailure(
            'invalid_stat_multiplier',
            'Champion stat multiplier must be between 0.1 and 10.',
          );
        }
        const validation = validateTeamAddition(team, championId);
        if (!validation.valid) return mutationFailure(validation.code, validation.message);
        const canonicalChampionId = validation.value;

        const nextLedger = cloneRunLedger(ledger);
        ensureLedgerChampion(nextLedger, canonicalChampionId);
        set({
          team: [...team, { championId: canonicalChampionId, statMultiplier }],
          ledger: nextLedger,
        });
        return { success: true, value: { championId: canonicalChampionId } };
      },

      removeChampion: (championId) => {
        const { inventory, team, isActive } = get();
        const member = team.find((candidate) => candidate.championId === championId);
        if (!member) {
          return mutationFailure('champion_not_in_team', 'This champion is not on the team.');
        }
        if (isActive && team.length <= 1) {
          return mutationFailure(
            'invalid_team_size',
            'An active run must keep at least one champion.',
          );
        }
        // Unequip all items from this champion
        const updatedInventory = inventory.map((entry) =>
          entry.equippedToChampionId === championId
            ? { ...entry, equippedToChampionId: null }
            : entry,
        );

        set({
          team: team.filter((m) => m.championId !== championId),
          inventory: updatedInventory,
          pendingSpellUpgradeChampionIds: get().pendingSpellUpgradeChampionIds.filter(
            (candidate) => candidate !== championId,
          ),
        });
        return { success: true, value: { championId } };
      },

      setTeam: (championIds) => {
        const validation = validateTeamChampionIds(championIds, {
          minimumSize: get().isActive ? 1 : 0,
          maximumSize: MAX_TEAM_SIZE,
        });
        if (!validation.valid) return mutationFailure(validation.code, validation.message);
        const team: TeamMember[] = validation.value.map((championId) => ({ championId }));
        const ledger = cloneRunLedger(get().ledger);
        for (const member of team) ensureLedgerChampion(ledger, member.championId);
        const inventory = get().inventory.map((entry) =>
          entry.equippedToChampionId &&
          !team.some((member) => member.championId === entry.equippedToChampionId)
            ? { ...entry, equippedToChampionId: null }
            : entry,
        );
        set({
          team,
          inventory,
          ledger,
          pendingSpellUpgradeChampionIds: queueSpellUpgradeChoices(
            team,
            [],
            get().pendingSpellUpgradeChampionIds,
          ),
        });
        return { success: true, value: { championIds: validation.value } };
      },

      // ── Inventory ───────────────────────────────────────────────────────

      addItem: (item, context = { source: 'inventory' }) => {
        const addition = validateItemAddition(get().inventory, item);
        if (!addition.valid) return mutationFailure(addition.code, addition.message);
        const canonicalItem = getCanonicalRunItem(item.id);
        if (!canonicalItem) {
          return mutationFailure('unknown_item', `Unknown item: ${item.id}.`);
        }
        const { runId, nextItemInstanceId } = get();
        const instanceId = `item_${runId}_${nextItemInstanceId}`;
        const entry: InventoryEntry = {
          instanceId,
          item: canonicalItem,
          equippedToChampionId: null,
        };
        set((state) => ({
          inventory: [...state.inventory, entry],
          nextItemInstanceId: state.nextItemInstanceId + 1,
          ledger: recordItemLedgerEvent(state.ledger, {
            action: context.source === 'shop' ? 'bought' : 'found',
            itemId: canonicalItem.id,
            instanceId,
            context: {
              ...context,
              nodeId: context.nodeId ?? state.currentNodeId,
              wave: context.wave ?? state.currentWave,
            },
          }),
        }));
        return { success: true, value: { instanceId } };
      },

      removeItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.filter((entry) => entry.instanceId !== instanceId),
        }));
      },

      consumeItems: (instanceIds, context = { source: 'combat' }) => {
        const consumed = new Set(instanceIds);
        if (consumed.size === 0) return;
        set((state) => {
          let ledger = state.ledger;
          for (const entry of state.inventory) {
            if (!consumed.has(entry.instanceId)) continue;
            ledger = recordItemLedgerEvent(ledger, {
              action: 'consumed',
              itemId: entry.item.id,
              instanceId: entry.instanceId,
              championId: entry.equippedToChampionId,
              context: {
                ...context,
                nodeId: context.nodeId ?? state.currentNodeId,
                wave: context.wave ?? state.currentWave,
              },
            });
          }
          return {
            inventory: state.inventory.filter((entry) => !consumed.has(entry.instanceId)),
            ledger,
          };
        });
      },

      setRuneStacks: (runeStacks) => set({ runeStacks }),

      equipItem: (instanceId, championId) => {
        const { inventory, team } = get();

        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item) return false;
        const equipment = validateItemEquipment(
          inventory,
          team.map((member) => member.championId),
          instanceId,
          championId,
        );
        if (!equipment.valid) return false;

        const updatedInventory = inventory.map((entry) =>
          entry.instanceId === instanceId ? { ...entry, equippedToChampionId: championId } : entry,
        );
        set({ inventory: updatedInventory });
        if (!get().recordRunCommand({ kind: 'equip_item', instanceId, championId })) {
          set({ inventory });
          return false;
        }
        set((state) => ({
          ledger: (() => {
            const context = {
              source: 'inventory' as const,
              nodeId: state.currentNodeId,
              wave: state.currentWave,
            };
            const afterUnequip = item.equippedToChampionId
              ? recordItemLedgerEvent(state.ledger, {
                  action: 'unequipped',
                  itemId: item.item.id,
                  instanceId,
                  championId: item.equippedToChampionId,
                  context,
                })
              : state.ledger;
            return recordItemLedgerEvent(afterUnequip, {
              action: 'equipped',
              itemId: item.item.id,
              instanceId,
              championId,
              context,
            });
          })(),
        }));
        return true;
      },

      unequipItem: (instanceId) => {
        const { inventory } = get();
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item || item.equippedToChampionId === null) return false;

        const updatedInventory = inventory.map((entry) =>
          entry.instanceId === instanceId ? { ...entry, equippedToChampionId: null } : entry,
        );
        set({ inventory: updatedInventory });
        if (!get().recordRunCommand({ kind: 'unequip_item', instanceId })) {
          set({ inventory });
          return false;
        }
        set((state) => ({
          ledger: recordItemLedgerEvent(state.ledger, {
            action: 'unequipped',
            itemId: item.item.id,
            instanceId,
            championId: item.equippedToChampionId,
            context: {
              source: 'inventory',
              nodeId: state.currentNodeId,
              wave: state.currentWave,
            },
          }),
        }));
        return true;
      },

      sellItem: (instanceId) => {
        const previousState = get();
        const entry = previousState.inventory.find((item) => item.instanceId === instanceId);
        if (!entry) return false;
        const saleGold = getItemSaleGold(entry.item.goldValue);
        set({
          inventory: previousState.inventory.filter((item) => item.instanceId !== instanceId),
          gold: previousState.gold + saleGold,
        });
        if (!get().recordRunCommand({ kind: 'sell_item', instanceId })) {
          set({ inventory: previousState.inventory, gold: previousState.gold });
          return false;
        }
        set((state) => ({
          ledger: recordItemLedgerEvent(recordGoldGain(state.ledger, saleGold), {
            action: 'sold',
            itemId: entry.item.id,
            instanceId,
            championId: entry.equippedToChampionId,
            goldAmount: saleGold,
            context: {
              source: 'inventory',
              nodeId: state.currentNodeId,
              wave: state.currentWave,
            },
          }),
        }));
        return true;
      },

      sortInventory: () => {
        set((state) => ({
          inventory: [...state.inventory].sort(
            (left, right) =>
              Number(Boolean(right.equippedToChampionId)) -
                Number(Boolean(left.equippedToChampionId)) ||
              right.item.goldValue - left.item.goldValue ||
              left.item.name.localeCompare(right.item.name),
          ),
        }));
      },

      chooseAugment: (augmentId) => {
        const state = get();
        const validation = validateAugmentSelection(
          state.pendingAugmentIds,
          state.augmentIds,
          augmentId,
        );
        if (!validation.valid) return false;
        set({
          augmentIds: [...state.augmentIds, augmentId],
          pendingAugmentIds: [],
        });
        if (!get().recordRunCommand({ kind: 'choose_augment', augmentId })) {
          set({ augmentIds: state.augmentIds, pendingAugmentIds: state.pendingAugmentIds });
          return false;
        }
        return true;
      },

      setLastCombatRewards: (lastCombatRewards) => set({ lastCombatRewards }),

      queueSpellUpgrades: (championIds) => {
        const state = get();
        const pendingSpellUpgradeChampionIds = queueSpellUpgradeChoices(
          state.team,
          state.pendingSpellUpgradeChampionIds,
          championIds,
        );
        const queued =
          pendingSpellUpgradeChampionIds.length - state.pendingSpellUpgradeChampionIds.length;
        if (queued > 0) set({ pendingSpellUpgradeChampionIds });
        return queued;
      },

      upgradeSpell: (championId, slot) => {
        const state = get();
        const pendingIndex = state.pendingSpellUpgradeChampionIds.indexOf(championId);
        const member = state.team.find((candidate) => candidate.championId === championId);
        const currentRank = member?.spellRanks?.[slot] ?? 1;
        if (pendingIndex < 0 || !member || !canUpgradeSpell(member, slot)) return false;
        const remainingPendingUpgrades = [...state.pendingSpellUpgradeChampionIds];
        remainingPendingUpgrades.splice(pendingIndex, 1);
        set({
          team: state.team.map((member) =>
            member.championId === championId
              ? {
                  ...member,
                  spellRanks: {
                    ...member.spellRanks,
                    [slot]: currentRank + 1,
                  },
                }
              : member,
          ),
          pendingSpellUpgradeChampionIds: remainingPendingUpgrades,
        });
        if (!get().recordRunCommand({ kind: 'upgrade_spell', championId, slot })) {
          set({
            team: state.team,
            pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
          });
          return false;
        }
        return true;
      },

      // ── Gold ────────────────────────────────────────────────────────────

      addGold: (amount, _context = { source: 'legacy' }) => {
        const normalizedAmount = Math.round(amount);
        if (!Number.isFinite(amount) || normalizedAmount <= 0) {
          return mutationFailure('invalid_amount', 'Gold gains must be a positive amount.');
        }
        const balance = get().gold + normalizedAmount;
        set((state) => ({
          gold: balance,
          ledger: recordGoldGain(state.ledger, normalizedAmount),
        }));
        return { success: true, value: { balance } };
      },

      spendGold: (amount, _context = { source: 'legacy' }) => {
        const normalizedAmount = Math.round(amount);
        if (!Number.isFinite(amount) || normalizedAmount <= 0) {
          return mutationFailure('invalid_amount', 'Gold costs must be a positive amount.');
        }
        const { gold } = get();
        if (gold < normalizedAmount) {
          return mutationFailure('insufficient_gold', 'There is not enough gold.');
        }
        const balance = gold - normalizedAmount;
        set((state) => ({
          gold: balance,
          ledger: recordGoldSpend(state.ledger, normalizedAmount),
        }));
        return { success: true, value: { balance } };
      },

      commitCombatEvents: (events) => {
        set((state) => ({
          ledger: commitCombatEventsToLedger(
            state.ledger,
            events,
            state.team.map((member) => member.championId),
          ),
        }));
      },

      completeCombatProgression: () => {
        set((state) =>
          !usesCanonicalProgression(state.authorityAttempt)
            ? {
                currentWave: state.currentWave + 1,
                totalWavesCompleted: state.totalWavesCompleted + 1,
              }
            : completeCombatProgression(state),
        );
      },

      // ── Run Map (using MapGenerator-core + mapUtils) ────────────────────

      generateRunMap: (seed?: number) => {
        const biomeMaps = generateBiomeMaps(get().authorityAttempt?.seed ?? seed);
        const startBiome = biomeMaps[0]?.biome ?? null;
        const frontierNodeIds = biomeMaps[0]?.startNodeId ? [biomeMaps[0].startNodeId] : [];
        synchronizeMapFrontier(biomeMaps, 0, frontierNodeIds);
        set({
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: null,
          frontierNodeIds,
          chosenPathNodeIds: [],
          completedNodeIds: [],
          claimedEncounterNodeIds: [],
          shopNodeStates: {},
          currentBiome: startBiome,
          biomesVisited: startBiome ? [startBiome] : [],
          pendingEncounter: null,
          currentEncounter: null,
        });
      },

      moveToNode: (nodeId) => {
        const {
          biomeMaps,
          currentBiomeIndex,
          completedNodeIds,
          currentNodeId,
          frontierNodeIds,
          chosenPathNodeIds,
          pendingEncounter,
          pendingAugmentIds,
          pendingSpellUpgradeChampionIds,
        } = get();
        if (
          pendingEncounter ||
          pendingAugmentIds.length > 0 ||
          pendingSpellUpgradeChampionIds.length > 0
        ) {
          return false;
        }
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;

        const targetNode = findNode(currentMap, nodeId);
        if (
          !targetNode ||
          !isFrontierMoveAllowed({
            map: currentMap,
            currentNodeId,
            completedNodeIds,
            frontierNodeIds,
            targetNodeId: nodeId,
          })
        ) {
          return false;
        }
        if (
          !get().recordRunCommand(
            { kind: 'move_node', nodeId },
            `move_node:${currentBiomeIndex}:${nodeId}`,
          )
        ) {
          return false;
        }

        synchronizeMapFrontier(biomeMaps, currentBiomeIndex, []);
        set({
          biomeMaps: [...biomeMaps],
          currentNodeId: nodeId,
          frontierNodeIds: [],
          chosenPathNodeIds: chosenPathNodeIds.includes(nodeId)
            ? chosenPathNodeIds
            : [...chosenPathNodeIds, nodeId],
          currentBiome: targetNode.biome,
        });
        return true;
      },

      completeCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, chosenPathNodeIds, completedNodeIds } =
          get();
        if (!currentNodeId) return false;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;
        const currentNode = findNode(currentMap, currentNodeId);
        if (
          !currentNode ||
          currentNode.completed ||
          completedNodeIds.includes(currentNodeId) ||
          !chosenPathNodeIds.includes(currentNodeId) ||
          get().pendingEncounter ||
          currentNode.type !== 'start'
        ) {
          return false;
        }
        if (
          !get().recordRunCommand(
            { kind: 'resolve_node', nodeId: currentNodeId },
            `resolve_node:${currentBiomeIndex}:${currentNodeId}`,
          )
        ) {
          return false;
        }

        const frontierNodeIds = completeNodeUtil(currentMap, currentNodeId).map((node) => node.id);
        synchronizeMapFrontier(biomeMaps, currentBiomeIndex, frontierNodeIds);

        set({
          biomeMaps: [...biomeMaps],
          frontierNodeIds,
          completedNodeIds: [...completedNodeIds, currentNodeId],
        });
        return true;
      },

      startEncounter: (nodeId, nodeType) => {
        const state = get();
        const map = state.biomeMaps[state.currentBiomeIndex];
        const node = map ? findNode(map, nodeId) : undefined;
        const canonicalType = node ? toEncounterNodeType(node) : null;
        if (
          !state.isActive ||
          state.pendingEncounter !== null ||
          state.currentNodeId !== nodeId ||
          state.frontierNodeIds.length !== 0 ||
          !node ||
          node.completed ||
          state.completedNodeIds.includes(nodeId) ||
          !state.chosenPathNodeIds.includes(nodeId) ||
          canonicalType !== nodeType ||
          !node.encounter
        ) {
          return false;
        }
        const shopNodeStates =
          canonicalType === 'shop'
            ? {
                ...state.shopNodeStates,
                [nodeId]: {
                  visited: true,
                  purchasedItemIds: [...(state.shopNodeStates[nodeId]?.purchasedItemIds ?? [])],
                  recruitedChampionIds: [
                    ...(state.shopNodeStates[nodeId]?.recruitedChampionIds ?? []),
                  ],
                },
              }
            : state.shopNodeStates;
        set({
          pendingEncounter: { nodeId, nodeType: canonicalType },
          currentEncounter:
            canonicalType === 'combat' || canonicalType === 'elite' || canonicalType === 'boss'
              ? (node.encounter as import('@/game/map/types').CombatEncounter)
              : null,
          shopNodeStates,
        });
        return true;
      },

      resolveEncounter: () => {
        const {
          pendingEncounter,
          biomeMaps,
          currentBiomeIndex,
          currentNodeId,
          chosenPathNodeIds,
          completedNodeIds,
        } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (
          pendingEncounter &&
          currentNodeId &&
          chosenPathNodeIds.includes(currentNodeId) &&
          isCurrentEncounterValid({
            map: currentMap,
            currentNodeId,
            pendingEncounter,
            completedNodeIds,
          })
        ) {
          const authorityAttempt = get().authorityAttempt;
          const isCombatEncounter =
            pendingEncounter.nodeType === 'combat' ||
            pendingEncounter.nodeType === 'elite' ||
            pendingEncounter.nodeType === 'boss';
          if (isCombatEncounter && !get().claimedEncounterNodeIds.includes(currentNodeId)) {
            return false;
          }
          if (
            authorityAttempt &&
            isCombatEncounter &&
            !authorityAttempt.commands.some(
              (command) =>
                command.kind === 'resolve_combat' && command.payload.node_id === currentNodeId,
            )
          ) {
            return false;
          }
          if (
            !get().recordRunCommand(
              { kind: 'resolve_node', nodeId: currentNodeId },
              `resolve_node:${currentBiomeIndex}:${currentNodeId}`,
            )
          ) {
            return false;
          }
          // Complete the current node
          const frontierNodeIds = completeNodeUtil(currentMap, currentNodeId).map(
            (node) => node.id,
          );
          synchronizeMapFrontier(biomeMaps, currentBiomeIndex, frontierNodeIds);

          // Update completedNodeIds (filter out nulls)
          const newCompletedNodeIds = [...completedNodeIds, currentNodeId].filter(
            (id): id is string => id !== null,
          );

          set({
            biomeMaps: [...biomeMaps],
            frontierNodeIds,
            completedNodeIds: newCompletedNodeIds,
            pendingEncounter: null,
            currentEncounter: null,
          });
          return true;
        }
        return false;
      },

      claimCurrentEncounter: () => {
        const {
          biomeMaps,
          currentBiomeIndex,
          currentNodeId,
          pendingEncounter,
          claimedEncounterNodeIds,
          chosenPathNodeIds,
          completedNodeIds,
        } = get();
        const claimed = claimedEncounterNodeIds ?? [];
        if (
          !canClaimEncounterReward(currentNodeId, pendingEncounter?.nodeId ?? null, claimed) ||
          !currentNodeId ||
          !chosenPathNodeIds.includes(currentNodeId) ||
          !isCurrentEncounterValid({
            map: biomeMaps[currentBiomeIndex],
            currentNodeId,
            pendingEncounter,
            completedNodeIds,
          })
        ) {
          return false;
        }
        set({ claimedEncounterNodeIds: [...claimed, currentNodeId!] });
        return true;
      },

      purchaseCurrentShopItem: (offerId) => {
        const state = get();
        const map = state.biomeMaps[state.currentBiomeIndex];
        const node = map && state.currentNodeId ? findNode(map, state.currentNodeId) : undefined;
        if (
          !node ||
          node.encounter?.type !== 'shop' ||
          !state.currentNodeId ||
          !state.chosenPathNodeIds.includes(node.id) ||
          !isCurrentEncounterValid({
            map,
            currentNodeId: state.currentNodeId,
            pendingEncounter: state.pendingEncounter,
            completedNodeIds: state.completedNodeIds,
          })
        ) {
          return mutationFailure('invalid_encounter', 'There is no active shop encounter.');
        }
        const offer = node.encounter.items.find((item) => item.itemId === offerId);
        if (!offer) return mutationFailure('invalid_offer', 'This item is not sold here.');
        const shopState = state.shopNodeStates[node.id] ?? {
          visited: true,
          purchasedItemIds: [],
          recruitedChampionIds: [],
        };
        if (shopState.purchasedItemIds.includes(offerId)) {
          return mutationFailure('offer_consumed', 'This item has already been purchased.');
        }
        if (state.inventory.length >= MAX_INVENTORY_ITEMS) {
          return mutationFailure('inventory_full', 'The inventory is full; no gold was spent.');
        }
        const addition = validateItemAddition(state.inventory, { id: offer.itemId });
        if (!addition.valid) return mutationFailure(addition.code, addition.message);
        const augmentManager = createRunAugmentManager(state.augmentIds, state.currentBiomeIndex);
        const price = getShopItemCost(
          node.encounter,
          offer.price,
          augmentManager.getShopDiscountPercent(),
        );
        if (state.gold < price) {
          return mutationFailure('insufficient_gold', 'There is not enough gold.');
        }
        const appended = appendAuthorityCommand(
          state,
          { kind: 'shop_buy_item', nodeId: node.id, itemId: offerId },
          `shop_buy_item:${node.id}:${offerId}`,
        );
        if (!appended.success) {
          return mutationFailure('command_rejected', 'The purchase could not be recorded.', true);
        }

        const instanceId = `item_${state.runId}_${state.nextItemInstanceId}`;
        const canonicalItem = getCanonicalRunItem(offer.itemId);
        if (!canonicalItem) {
          return mutationFailure('unknown_item', `Unknown item: ${offer.itemId}.`);
        }
        const entry: InventoryEntry = {
          instanceId,
          item: canonicalItem,
          equippedToChampionId: null,
        };
        const ledgerAfterSpend = recordGoldSpend(state.ledger, price);
        const ledger = recordItemLedgerEvent(ledgerAfterSpend, {
          action: 'bought',
          itemId: entry.item.id,
          instanceId,
          goldAmount: price,
          context: {
            source: 'shop',
            nodeId: node.id,
            wave: state.currentWave,
          },
        });
        set({
          authorityAttempt: appended.authorityAttempt,
          gold: state.gold - price,
          inventory: [...state.inventory, entry],
          ledger,
          nextItemInstanceId: state.nextItemInstanceId + 1,
          shopNodeStates: {
            ...state.shopNodeStates,
            [node.id]: {
              ...shopState,
              visited: true,
              purchasedItemIds: [...shopState.purchasedItemIds, offerId],
            },
          },
        });
        return { success: true, value: { instanceId } };
      },

      purchaseCurrentShopChampion: (championId) => {
        const state = get();
        const map = state.biomeMaps[state.currentBiomeIndex];
        const node = map && state.currentNodeId ? findNode(map, state.currentNodeId) : undefined;
        if (
          !node ||
          node.encounter?.type !== 'shop' ||
          !state.currentNodeId ||
          !state.chosenPathNodeIds.includes(node.id) ||
          !isCurrentEncounterValid({
            map,
            currentNodeId: state.currentNodeId,
            pendingEncounter: state.pendingEncounter,
            completedNodeIds: state.completedNodeIds,
          })
        ) {
          return mutationFailure('invalid_encounter', 'There is no active shop encounter.');
        }
        const offer = node.encounter.recruitableChampions.find(
          (champion) => champion.championId === championId,
        );
        if (!offer) return mutationFailure('invalid_offer', 'This champion cannot be recruited.');
        const shopState = state.shopNodeStates[node.id] ?? {
          visited: true,
          purchasedItemIds: [],
          recruitedChampionIds: [],
        };
        if (shopState.recruitedChampionIds.includes(championId)) {
          return mutationFailure('offer_consumed', 'This champion was already recruited.');
        }
        const teamAddition = validateTeamAddition(state.team, championId);
        if (!teamAddition.valid) {
          return mutationFailure(teamAddition.code, `${teamAddition.message} No gold was spent.`);
        }
        const price = getShopRecruitCost(node.encounter, offer.cost);
        if (state.gold < price) {
          return mutationFailure('insufficient_gold', 'There is not enough gold.');
        }
        const appended = appendAuthorityCommand(
          state,
          { kind: 'shop_recruit', nodeId: node.id, championId },
          `shop_recruit:${node.id}:${championId}`,
        );
        if (!appended.success) {
          return mutationFailure(
            'command_rejected',
            'The recruitment could not be recorded.',
            true,
          );
        }
        set({
          authorityAttempt: appended.authorityAttempt,
          gold: state.gold - price,
          ledger: recordGoldSpend(state.ledger, price),
          team: [...state.team, { championId: teamAddition.value, statMultiplier: 1 }],
          shopNodeStates: {
            ...state.shopNodeStates,
            [node.id]: {
              ...shopState,
              visited: true,
              recruitedChampionIds: [...shopState.recruitedChampionIds, championId],
            },
          },
        });
        const nextLedger = cloneRunLedger(get().ledger);
        ensureLedgerChampion(nextLedger, championId);
        set({ ledger: nextLedger });
        return { success: true, value: { championId } };
      },

      advanceToNextBiome: () => {
        const state = get();
        const currentMap = state.biomeMaps[state.currentBiomeIndex];
        const currentNode =
          currentMap && state.currentNodeId ? findNode(currentMap, state.currentNodeId) : undefined;
        const exitAlreadyCompleted = Boolean(
          currentNode && (currentNode.completed || state.completedNodeIds.includes(currentNode.id)),
        );
        if (
          !currentMap ||
          !currentNode ||
          currentNode.type !== 'exit' ||
          !state.chosenPathNodeIds.includes(currentNode.id) ||
          state.pendingEncounter ||
          state.pendingAugmentIds.length > 0 ||
          state.pendingSpellUpgradeChampionIds.length > 0
        ) {
          return false;
        }

        const seed = state.authorityAttempt?.seed ?? state.seed;
        if (typeof seed !== 'number' || !Number.isSafeInteger(seed)) return false;
        const progression = !usesCanonicalProgression(state.authorityAttempt)
          ? {
              currentBiomeIndex: state.currentBiomeIndex + 1,
              runLevel: state.runLevel,
              currentWave: 1,
              totalWavesCompleted: state.totalWavesCompleted,
              pendingAugmentIds: state.pendingAugmentIds,
            }
          : transitionToNextBiome({
              seed,
              currentBiomeIndex: state.currentBiomeIndex,
              biomeCount: state.biomeMaps.length,
              counters: state,
              ownedAugmentIds: state.augmentIds,
            });
        if (!progression) return false;
        const nextMap = state.biomeMaps[progression.currentBiomeIndex];
        if (!nextMap) return false;
        const nextStartNode = findNode(nextMap, nextMap.startNodeId);
        if (!nextStartNode) return false;

        const recordedExitResolution = state.authorityAttempt?.commands.some(
          (command) =>
            command.kind === 'resolve_node' && command.payload.node_id === currentNode.id,
        );
        if (exitAlreadyCompleted && state.authorityAttempt && !recordedExitResolution) return false;
        const appended = exitAlreadyCompleted
          ? { success: true as const, authorityAttempt: state.authorityAttempt }
          : appendAuthorityCommand(
              state,
              { kind: 'resolve_node', nodeId: currentNode.id },
              `resolve_node:${state.currentBiomeIndex}:${currentNode.id}`,
            );
        if (!appended.success) return false;

        if (!exitAlreadyCompleted) completeNodeUtil(currentMap, currentNode.id);
        const frontierNodeIds = [nextMap.startNodeId];
        synchronizeMapFrontier(state.biomeMaps, progression.currentBiomeIndex, frontierNodeIds);
        set({
          authorityAttempt: appended.authorityAttempt,
          biomeMaps: [...state.biomeMaps],
          currentBiomeIndex: progression.currentBiomeIndex,
          currentNodeId: null,
          frontierNodeIds,
          currentBiome: nextMap.biome,
          biomesVisited: [...state.biomesVisited, nextMap.biome],
          completedNodeIds: [...new Set([...state.completedNodeIds, currentNode.id])],
          runLevel: progression.runLevel,
          currentWave: progression.currentWave,
          totalWavesCompleted: progression.totalWavesCompleted,
          pendingAugmentIds: progression.pendingAugmentIds,
          pendingEncounter: null,
          currentEncounter: null,
        });
        return true;
      },

      getCurrentMap: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        return biomeMaps[currentBiomeIndex] ?? null;
      },

      getCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId } = get();
        if (!currentNodeId) return null;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return null;
        return findNode(currentMap, currentNodeId) ?? null;
      },

      updateTeamAfterCombat: (updates) => {
        set((state) => {
          const team = state.team.map((m) => {
            const update = updates.find((u) => u.championId === m.championId);
            if (update) {
              const { currentHp, currentMp, ...rest } = update;
              const nextMember = {
                ...m,
                ...rest,
                ...(currentHp === undefined ? {} : { currentHp }),
                ...(currentMp === undefined ? {} : { currentMp }),
              };
              return {
                ...nextMember,
                spellRanks: normalizeSpellRanks(
                  nextMember.championId,
                  nextMember.level ?? 1,
                  nextMember.spellRanks,
                ),
              };
            }
            return m;
          });
          return normalizeRunDomainState({
            team,
            inventory: state.inventory,
            pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
          });
        });
      },
    }),
    {
      name: 'lolrogue-run-storage',
      version: 6,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted, version) => migratePersistedRunState(persisted, version),
      // Only persist the serializable state, not functions
      partialize: (state) => ({
        isActive: state.isActive,
        mode: state.mode,
        runId: state.runId,
        seed: state.seed,
        startedAt: state.startedAt,
        authorityAttempt: state.authorityAttempt,
        pendingAuthorityStart: state.pendingAuthorityStart,
        // A page reload interrupts any in-flight promise. Persist it as a
        // retryable error instead of leaving Game Over stuck on "saving".
        saveStatus:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'failed'
            : state.saveStatus,
        saveError:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'Run save was interrupted. Retry to continue.'
            : state.saveError,
        saveFailureKind:
          state.saveStatus === 'saving' || state.saveStatus === 'retrying'
            ? 'retryable'
            : state.saveFailureKind,
        completedRunSnapshot: state.completedRunSnapshot,
        serverProgression: state.serverProgression,
        rewardsApplied: state.rewardsApplied,
        ledger: state.ledger,
        nextItemInstanceId: state.nextItemInstanceId,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        runeIds: state.runeIds,
        runeStacks: state.runeStacks,
        augmentIds: state.augmentIds,
        pendingAugmentIds: state.pendingAugmentIds,
        lastCombatRewards: state.lastCombatRewards,
        pendingSpellUpgradeChampionIds: state.pendingSpellUpgradeChampionIds,
        gold: state.gold,
        currentWave: state.currentWave,
        totalWavesCompleted: state.totalWavesCompleted,
        biomeMaps: state.biomeMaps,
        currentBiomeIndex: state.currentBiomeIndex,
        currentNodeId: state.currentNodeId,
        frontierNodeIds: state.frontierNodeIds,
        chosenPathNodeIds: state.chosenPathNodeIds,
        completedNodeIds: state.completedNodeIds,
        claimedEncounterNodeIds: state.claimedEncounterNodeIds,
        shopNodeStates: state.shopNodeStates,
        pendingEncounter: state.pendingEncounter,
        currentEncounter: state.currentEncounter,
      }),
    },
  ),
);
