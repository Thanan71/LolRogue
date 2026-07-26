import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { championDB, implementedChampions } from '@/data';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import {
  completeNode as completeNodeUtil,
  findNode,
  getAccessibleNodes,
  isMapComplete,
} from '@/game/map/mapUtils';
import {
  canClaimEncounterReward,
  getSurvivingChampionIds,
  shouldApplyRunRewards,
} from '@/game/run/runState';
import { RepositoryContainerFactory } from '@/services/container';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { runStatsTracker } from '@/services/RunStatsTracker';
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
  MAX_ITEMS_PER_CHAMPION,
  MAX_TEAM_SIZE,
  type RunStore,
  type RunSummary,
  type TeamMember,
} from '@/types/run';
import type {
  PendingRunAttemptStart,
  RunAuthorityAttempt,
  RunCommandInput,
} from '@/types/runAttempt';
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

function cloneRunSummary(summary: RunSummary): RunSummary {
  return {
    ...summary,
    biomesVisited: [...summary.biomesVisited],
    championStats: summary.championStats.map((stats) => ({ ...stats })),
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
    case 'resolve_combat':
    case 'rest':
    case 'recruit':
    case 'event':
    case 'treasure':
    case 'resolve_node':
      return { node_id: command.nodeId };
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
  const payload = commandPayload(command);
  return Object.values(payload).every(
    (value) => typeof value === 'string' && value.length > 0 && value.length <= 160,
  );
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

// ─── Store ──────────────────────────────────────────────────────────────────

export const useRunStore = create<RunStore>()(
  persist(
    (set, get) => ({
      ...RUN_INITIAL_STATE,

      // ── Run Lifecycle ───────────────────────────────────────────────────

      startRun: async (championIds, options = {}) => {
        // If there's an active run, end it first (this will save it if conditions are met)
        const currentState = get();
        if (currentState.isActive) {
          logger.debug('[runStore.startRun] Active run detected, ending current run first');
          // End the current run (loss, since user is abandoning it to start new)
          const saved = await get().endRun(false, currentState.runId);
          if (!saved) {
            logger.warn(
              '[runStore.startRun] The active run could not be saved; keeping it retryable',
            );
            return { success: false, error: 'The active run could not be finalized.' };
          }
        }

        const authUser = useAuthStore.getState().user;
        const resumableStart =
          authUser && get().pendingAuthorityStart?.ownerUserId === authUser.id
            ? get().pendingAuthorityStart
            : null;
        const requestedChampionIds = resumableStart?.team ?? championIds;

        // Validate champion IDs - filter out any invalid IDs
        const supportedChampionIds = new Set(implementedChampions.map((champion) => champion.id));
        const validChampionIds = requestedChampionIds.filter((id) => {
          if (!id || typeof id !== 'string') return false;
          const champ = championDB.getById(id);
          if (!champ) {
            logger.warn(
              `[runStore.startRun] Invalid champion ID "${id}" - champion not found in database`,
            );
            return false;
          }
          if (!supportedChampionIds.has(champ.id)) {
            logger.warn(
              `[runStore.startRun] Unsupported champion ID "${id}" - not in implemented champion list`,
            );
            return false;
          }
          return true;
        });

        const team: TeamMember[] = validChampionIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));
        if (team.length === 0) {
          return { success: false, error: 'Select at least one valid champion.' };
        }

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
            return { success: false, error };
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
            return { success: false, error };
          }
          if (useAuthStore.getState().user?.id !== authUser.id) {
            const error = 'The authenticated account changed while starting the run.';
            set({ saveError: error });
            return { success: false, error };
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
        const startNodeId = biomeMaps[0]?.startNodeId ?? null;
        const startBiome = biomeMaps[0]?.biome ?? null;

        // Reset stats tracker for new run
        runStatsTracker.reset();

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
          completedCombatStats: [],
          nextItemInstanceId: 1,
          team: canonicalTeam,
          runLevel: 1,
          biomesVisited: startBiome ? [startBiome] : [],
          currentBiome: startBiome,
          inventory: [],
          runeIds: canonicalRuneIds,
          augmentIds: [],
          pendingAugmentIds: [],
          lastCombatRewards: null,
          pendingSpellUpgradeChampionIds: [],
          gold: 0,
          currentWave: 1,
          totalWavesCompleted: 0,
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          claimedEncounterNodeIds: [],
          pendingEncounter: null,
          currentEncounter: null,
        });
        return { success: true };
      },

      recordRunCommand: (command, explicitDedupeKey) => {
        const state = get();
        const attempt = state.authorityAttempt;
        // Guest gameplay stays local and does not need an authority journal.
        if (!attempt) return true;
        if (
          !state.isActive ||
          state.isEnding ||
          state.completedRunSnapshot !== null ||
          !['started', 'active'].includes(attempt.status) ||
          useAuthStore.getState().user?.id !== attempt.ownerUserId ||
          !isValidCommand(command)
        ) {
          return false;
        }

        const payload = commandPayload(command);
        if (explicitDedupeKey) {
          const existing = attempt.commands.find(
            (candidate) => candidate.dedupeKey === explicitDedupeKey,
          );
          if (existing) {
            return (
              existing.kind === command.kind &&
              JSON.stringify(existing.payload) === JSON.stringify(payload)
            );
          }
        }
        const commandId = createCommandId();
        if (!commandId) return false;
        const dedupeKey = explicitDedupeKey ?? commandId;

        set({
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
        });
        return true;
      },

      endRun: async (won = false, expectedRunId?: string, displayedSummary?: RunSummary) => {
        const requestedRunId = expectedRunId ?? get().runId;
        if (inFlightFinalization) {
          return inFlightFinalization.runId === requestedRunId
            ? inFlightFinalization.promise
            : false;
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
              // A completion triggered outside CombatPage (for example, an
              // abandonment after reload) starts from the persisted encounters.
              runStatsTracker.restore(state.completedCombatStats);
              runStatsTracker.markSurvived(getSurvivingChampionIds(state.team));
              summary = runStatsTracker.buildSummary({
                won,
                wavesCompleted: state.totalWavesCompleted,
                biomesVisited: state.biomesVisited,
                goldEarned: state.gold,
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
              goldEarned: state.gold,
              summary: cloneRunSummary(summary),
              teamMembers,
              startedAt: state.startedAt,
              seed: state.seed,
              runeIds: [...state.runeIds],
              augmentIds: [...state.augmentIds],
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
              gold: snapshot.goldEarned,
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
          return await operation;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          logger.error('[runStore.endRun] Unexpected finalization failure:', error);
          set({
            isEnding: false,
            saveStatus: 'failed',
            saveError: message || 'The run could not be finalized.',
            saveFailureKind: 'retryable',
          });
          return false;
        } finally {
          if (inFlightFinalization?.promise === operation) inFlightFinalization = null;
        }
      },

      // ── Team Management ─────────────────────────────────────────────────

      addChampion: (championId, statMultiplier = 1) => {
        const { team } = get();
        if (team.length >= MAX_TEAM_SIZE) return false;
        if (team.some((m) => m.championId === championId)) return false;

        set({ team: [...team, { championId, statMultiplier }] });
        return true;
      },

      removeChampion: (championId) => {
        const { inventory } = get();
        // Unequip all items from this champion
        const updatedInventory = inventory.map((entry) =>
          entry.equippedToChampionId === championId
            ? { ...entry, equippedToChampionId: null }
            : entry,
        );

        set({
          team: get().team.filter((m) => m.championId !== championId),
          inventory: updatedInventory,
        });
      },

      setTeam: (championIds) => {
        const team: TeamMember[] = championIds
          .slice(0, MAX_TEAM_SIZE)
          .map((id) => ({ championId: id }));
        set({ team });
      },

      // ── Biome Progression ───────────────────────────────────────────────

      advanceBiome: (nextBiome) => {
        set((state) => ({
          biomesVisited: [...state.biomesVisited, nextBiome],
          currentBiome: nextBiome,
          currentWave: 1,
        }));
      },

      // ── Inventory ───────────────────────────────────────────────────────

      addItem: (item) => {
        if (get().inventory.length >= MAX_INVENTORY_ITEMS) return '';
        const { runId, nextItemInstanceId } = get();
        const instanceId = `item_${runId}_${nextItemInstanceId}`;
        const entry: InventoryEntry = {
          instanceId,
          item,
          equippedToChampionId: null,
        };
        set((state) => ({
          inventory: [...state.inventory, entry],
          nextItemInstanceId: state.nextItemInstanceId + 1,
        }));
        return instanceId;
      },

      removeItem: (instanceId) => {
        set((state) => ({
          inventory: state.inventory.filter((entry) => entry.instanceId !== instanceId),
        }));
      },

      equipItem: (instanceId, championId) => {
        const { inventory } = get();

        // Check if item exists
        const item = inventory.find((entry) => entry.instanceId === instanceId);
        if (!item) return false;

        // Already equipped to this champion
        if (item.equippedToChampionId === championId) return false;

        // Count items already equipped to this champion
        const equippedCount = inventory.filter(
          (entry) => entry.equippedToChampionId === championId,
        ).length;

        // Respect max items per champion
        if (equippedCount >= MAX_ITEMS_PER_CHAMPION) return false;

        const updatedInventory = inventory.map((entry) =>
          entry.instanceId === instanceId ? { ...entry, equippedToChampionId: championId } : entry,
        );
        set({ inventory: updatedInventory });
        if (!get().recordRunCommand({ kind: 'equip_item', instanceId, championId })) {
          set({ inventory });
          return false;
        }
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
        return true;
      },

      sellItem: (instanceId) => {
        const previousState = get();
        const entry = previousState.inventory.find((item) => item.instanceId === instanceId);
        if (!entry) return false;
        set({
          inventory: previousState.inventory.filter((item) => item.instanceId !== instanceId),
          gold: previousState.gold + Math.max(1, Math.floor(entry.item.goldValue / 2)),
        });
        if (!get().recordRunCommand({ kind: 'sell_item', instanceId })) {
          set({ inventory: previousState.inventory, gold: previousState.gold });
          return false;
        }
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
        if (!state.pendingAugmentIds.includes(augmentId) || !AUGMENT_DATABASE[augmentId]) {
          return false;
        }
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

      queueSpellUpgrades: (championIds) =>
        set((state) => ({
          pendingSpellUpgradeChampionIds: [...state.pendingSpellUpgradeChampionIds, ...championIds],
        })),

      upgradeSpell: (championId, slot) => {
        const state = get();
        const pendingIndex = state.pendingSpellUpgradeChampionIds.indexOf(championId);
        const member = state.team.find((candidate) => candidate.championId === championId);
        const maximumRank = slot === 'R' ? 3 : 5;
        const currentRank = member?.spellRanks?.[slot] ?? 1;
        if (pendingIndex < 0 || !member || currentRank >= maximumRank) return false;
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

      addGold: (amount) => {
        set((state) => ({ gold: Math.max(0, state.gold + amount) }));
      },

      spendGold: (amount) => {
        const { gold } = get();
        if (gold < amount) return false;
        set({ gold: gold - amount });
        return true;
      },

      // ── Wave Progression ────────────────────────────────────────────────

      nextWave: () => {
        set((state) => ({
          currentWave: state.currentWave + 1,
          totalWavesCompleted: state.totalWavesCompleted + 1,
        }));
      },

      // ── Run Level ───────────────────────────────────────────────────────

      incrementRunLevel: () => {
        set((state) => {
          const choices = Object.keys(AUGMENT_DATABASE)
            .filter((id) => !state.augmentIds.includes(id))
            .sort()
            .slice((state.runLevel * 3) % Math.max(1, Object.keys(AUGMENT_DATABASE).length - 3), 3);
          return { runLevel: state.runLevel + 1, pendingAugmentIds: choices };
        });
      },

      // ── Run Map (using MapGenerator-core + mapUtils) ────────────────────

      generateRunMap: (seed?: number) => {
        const biomeMaps = generateBiomeMaps(get().authorityAttempt?.seed ?? seed);
        const startNodeId = biomeMaps[0]?.startNodeId ?? null;
        const startBiome = biomeMaps[0]?.biome ?? null;
        set({
          biomeMaps,
          currentBiomeIndex: 0,
          currentNodeId: startNodeId,
          completedNodeIds: [],
          currentBiome: startBiome,
          biomesVisited: startBiome ? [startBiome] : [],
        });
      },

      moveToNode: (nodeId) => {
        const {
          biomeMaps,
          currentBiomeIndex,
          completedNodeIds,
          currentNodeId,
          pendingAugmentIds,
          pendingSpellUpgradeChampionIds,
        } = get();
        if (pendingAugmentIds.length > 0 || pendingSpellUpgradeChampionIds.length > 0) return false;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return false;

        const targetNode = findNode(currentMap, nodeId);
        const currentNode = currentNodeId ? findNode(currentMap, currentNodeId) : undefined;
        if (!targetNode) return false;

        // A branch can only continue from the node that was just completed.
        // getAccessibleNodes alone is too broad because it also includes nodes
        // unlocked by an older predecessor on an abandoned branch.
        const accessible = getAccessibleNodes(currentMap, completedNodeIds);
        const isImmediatelyAccessible = accessible.some((node) => node.id === nodeId);
        const isCurrentStart =
          nodeId === currentNodeId &&
          nodeId === currentMap.startNodeId &&
          !completedNodeIds.includes(nodeId);
        const followsCurrentCompletedNode =
          currentNode !== undefined &&
          (currentNode.completed || completedNodeIds.includes(currentNode.id)) &&
          currentNode.nextNodeIds.includes(nodeId) &&
          isImmediatelyAccessible;
        if (!isCurrentStart && !followsCurrentCompletedNode) return false;
        if (
          !get().recordRunCommand(
            { kind: 'move_node', nodeId },
            `move_node:${currentBiomeIndex}:${nodeId}`,
          )
        ) {
          return false;
        }

        set({
          currentNodeId: nodeId,
          currentBiome: targetNode.biome,
        });
        return true;
      },

      completeCurrentNode: () => {
        const { biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } = get();
        if (!currentNodeId) return;
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap) return;
        if (
          !get().recordRunCommand(
            { kind: 'resolve_node', nodeId: currentNodeId },
            `resolve_node:${currentBiomeIndex}:${currentNodeId}`,
          )
        ) {
          return;
        }

        // Mark node as completed and update accessibility
        completeNodeUtil(currentMap, currentNodeId);

        set({
          biomeMaps: [...biomeMaps],
          completedNodeIds: [...completedNodeIds, currentNodeId],
        });
      },

      startEncounter: (nodeId, nodeType, encounterData?) => {
        set({ pendingEncounter: { nodeId, nodeType }, currentEncounter: encounterData ?? null });
      },

      resolveEncounter: () => {
        const { pendingEncounter, biomeMaps, currentBiomeIndex, currentNodeId, completedNodeIds } =
          get();
        if (pendingEncounter && currentNodeId) {
          const authorityAttempt = get().authorityAttempt;
          const isCombatEncounter =
            pendingEncounter.nodeType === 'combat' ||
            pendingEncounter.nodeType === 'elite' ||
            pendingEncounter.nodeType === 'boss';
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
          completeNodeUtil(biomeMaps[currentBiomeIndex], currentNodeId);

          // Update completedNodeIds (filter out nulls)
          const newCompletedNodeIds = [...completedNodeIds, currentNodeId].filter(
            (id): id is string => id !== null,
          );

          set({
            biomeMaps: [...biomeMaps],
            completedNodeIds: newCompletedNodeIds,
            pendingEncounter: null,
            currentEncounter: null,
          });
          return true;
        }
        return false;
      },

      claimCurrentEncounter: () => {
        const { currentNodeId, pendingEncounter, claimedEncounterNodeIds } = get();
        const claimed = claimedEncounterNodeIds ?? [];
        if (!canClaimEncounterReward(currentNodeId, pendingEncounter?.nodeId ?? null, claimed)) {
          return false;
        }
        set({ claimedEncounterNodeIds: [...claimed, currentNodeId!] });
        return true;
      },

      advanceToNextBiome: () => {
        const { biomeMaps, currentBiomeIndex } = get();
        const currentMap = biomeMaps[currentBiomeIndex];
        if (!currentMap || !isMapComplete(currentMap)) return false;

        const nextIndex = currentBiomeIndex + 1;
        if (nextIndex >= biomeMaps.length) return false;

        const nextMap = biomeMaps[nextIndex];
        const nextStartNode = findNode(nextMap, nextMap.startNodeId);
        if (!nextStartNode) return false;
        nextStartNode.accessible = true;
        set({
          biomeMaps: [...biomeMaps],
          currentBiomeIndex: nextIndex,
          currentNodeId: nextMap.startNodeId,
          currentBiome: nextMap.biome,
          biomesVisited: [...get().biomesVisited, nextMap.biome],
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
        set((state) => ({
          team: state.team.map((m) => {
            const update = updates.find((u) => u.championId === m.championId);
            if (update) {
              const { currentHp, currentMp, ...rest } = update;
              return {
                ...m,
                ...rest,
                ...(currentHp === undefined ? {} : { currentHp }),
                ...(currentMp === undefined ? {} : { currentMp }),
              };
            }
            return m;
          }),
        }));
      },
    }),
    {
      name: 'lolrogue-run-storage',
      version: 2,
      storage: createJSONStorage(() => safeLocalStorage),
      migrate: (persisted) => recoverPersistedState(persisted, RUN_INITIAL_STATE),
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
        completedCombatStats: state.completedCombatStats,
        nextItemInstanceId: state.nextItemInstanceId,
        team: state.team,
        runLevel: state.runLevel,
        biomesVisited: state.biomesVisited,
        currentBiome: state.currentBiome,
        inventory: state.inventory,
        runeIds: state.runeIds,
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
        completedNodeIds: state.completedNodeIds,
        claimedEncounterNodeIds: state.claimedEncounterNodeIds,
        pendingEncounter: state.pendingEncounter,
        currentEncounter: state.currentEncounter,
      }),
    },
  ),
);
