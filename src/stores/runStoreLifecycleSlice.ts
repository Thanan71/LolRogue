import type { StoreApi } from 'zustand';
import { championDB } from '@/data';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import { synchronizeMapFrontier } from '@/game/map/mapProgression';
import {
  appendRunAuthorityCommand,
  createRunCommandId as createCommandId,
  isSamePendingRunStart as samePendingStart,
} from '@/game/run/runAuthorityJournal';
import { buildRunSummaryFromLedger, cloneRunLedger, createRunLedger } from '@/game/run/runLedger';
import { getPersistedActiveRun, withExclusiveRunStart } from '@/game/run/runStartCoordinator';
import { getUnlockedStarterSlotCount, validateRunStartTeam } from '@/game/run/runStartValidation';
import { shouldApplyRunRewards } from '@/game/run/runState';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { RunVerificationRejectedError } from '@/services/runAttemptService';
import { runAuthorityService } from '@/services/runAuthorityService';
import {
  runEndFailure as endFailure,
  runLifecycleService,
  runStartFailure as startFailure,
} from '@/services/runLifecycleService';
import type { CompletedRunSnapshot, RunState, RunStore, RunSummary, TeamMember } from '@/types/run';
import type { PendingRunAttemptStart, RunAuthorityAttempt } from '@/types/runAttempt';
import { logger } from '@/utils/logger';
import {
  measureTransition,
  recordTechnicalEvent,
  setTechnicalCorrelation,
} from '@/utils/observability';
import { calculateMaxHP } from '@/utils/statCalculator';
import { useAuthStore } from './authStore';
import { calculateDailyScore, useDailyRunStore } from './dailyRunStore';
import { useEnhancementStore } from './enhancementStore';
import { useMasteryStore } from './masteryStore';
import { RUN_INITIAL_STATE } from './runInitialState';
import { useSettingsStore } from './settingsStore';

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

const appendAuthorityCommand = (
  state: RunState,
  command: Parameters<typeof appendRunAuthorityCommand>[2],
  explicitDedupeKey?: string,
) =>
  appendRunAuthorityCommand(
    state,
    useAuthStore.getState().user?.id ?? null,
    command,
    explicitDedupeKey,
  );

type RunLifecycleActions = Pick<
  RunStore,
  'startRun' | 'recordRunCommand' | 'markCombatStarted' | 'endRun'
>;

export function createRunLifecycleSlice(
  set: StoreApi<RunStore>['setState'],
  get: StoreApi<RunStore>['getState'],
): RunLifecycleActions {
  return {
    // ── Run Lifecycle ───────────────────────────────────────────────────

    startRun: async (championIds, options = {}) => {
      const finishTransition = measureTransition('run_start');
      if (!runLifecycleService.beginStart()) {
        finishTransition('error');
        return startFailure('start_in_progress', 'A run start is already being verified.', true);
      }
      let transitionOutcome: 'ok' | 'error' = 'error';
      try {
        const result = await withExclusiveRunStart(async () => {
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

          const authState = useAuthStore.getState();
          if (
            authState.user &&
            (authState.authStatus !== 'ready' || !authState.player || !authState.isAuthenticated)
          ) {
            return startFailure(
              'auth_not_ready',
              'Your authenticated profile is not ready. Retry profile loading before starting.',
              true,
            );
          }
          const authUser = authState.authStatus === 'ready' ? authState.user : null;
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
            const attemptResult = await runAuthorityService.startAttempt({
              commandId,
              mode,
              team: requestedStart.team,
              runeIds: requestedRuneIds,
              difficulty,
            });
            if (attemptResult.error || !attemptResult.data) {
              const error = attemptResult.error?.message ?? 'Unable to start a verified run.';
              const staleDailyOffer =
                mode === 'daily' && error.includes('daily_starter_not_offered');
              set({
                saveError: error,
                ...(staleDailyOffer ? { pendingAuthorityStart: null } : {}),
              });
              return startFailure('start_failed', error, !staleDailyOffer);
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
            saveDiagnostic: null,
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
            combatCheckpointNodeId: null,
            combatRecoveryRequired: false,
          });
          setTechnicalCorrelation({ runId });
          return { success: true as const, runId, mode: canonicalMode };
        });
        transitionOutcome = result.success ? 'ok' : 'error';
        return result;
      } finally {
        runLifecycleService.finishStart();
        finishTransition(transitionOutcome);
      }
    },

    recordRunCommand: (command, explicitDedupeKey) => {
      const state = get();
      const appended = appendAuthorityCommand(state, command, explicitDedupeKey);
      if (!appended.success) return false;
      if (appended.authorityAttempt !== state.authorityAttempt) {
        set({ authorityAttempt: appended.authorityAttempt });
        setTechnicalCorrelation({
          runId: state.runId,
          commandId:
            appended.authorityAttempt?.commands[appended.authorityAttempt.commands.length - 1]
              ?.commandId,
        });
      }
      return true;
    },

    markCombatStarted: (nodeId) => {
      const state = get();
      if (
        state.pendingEncounter?.nodeId === nodeId &&
        ['combat', 'elite', 'boss'].includes(state.pendingEncounter.nodeType)
      ) {
        set({ combatCheckpointNodeId: nodeId });
      }
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
      const inFlightFinalization = runLifecycleService.getFinalization();
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

        if (state.completedRunSnapshot?.runId === state.runId) {
          recordTechnicalEvent(
            { type: 'retry', operation: 'run_finalization', attempt: 1 },
            { runId: state.runId, commandId: state.authorityAttempt?.finishCommandId },
          );
        }

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
            saveError: 'This run has no server attempt and cannot grant authenticated progression.',
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
            const appendResult = await runAuthorityService.appendCommands(
              syncedAttempt.attemptId,
              batch,
            );
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
                saveDiagnostic: {
                  attemptId: syncedAttempt.attemptId,
                  engineVersion: syncedAttempt.engineVersion,
                  rejectionCode:
                    appendResult.data.status === 'expired'
                      ? 'run_attempt_expired'
                      : 'trace_rejected',
                },
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
          const sealResult = await runAuthorityService.sealAttempt(
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
              saveDiagnostic: {
                attemptId: syncedAttempt.attemptId,
                engineVersion: syncedAttempt.engineVersion,
                rejectionCode:
                  sealResult.data.status === 'expired' ? 'run_attempt_expired' : 'trace_rejected',
              },
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
              ? await runAuthorityService.recoverAttempt(syncedAttempt.attemptId)
              : await runAuthorityService.verifyAttempt(syncedAttempt.attemptId);
          if (verification.error || !verification.data) {
            if (verification.error instanceof RunVerificationRejectedError) {
              set({
                ...RUN_INITIAL_STATE,
                completedRunSnapshot: snapshot,
                saveStatus: 'failed',
                saveError: verification.error.message,
                saveFailureKind: 'terminal',
                saveDiagnostic: {
                  attemptId: syncedAttempt.attemptId,
                  engineVersion: syncedAttempt.engineVersion,
                  rejectionCode: verification.error.code,
                },
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
          void runLifecycleService.refreshVerifiedProgression(user.id);
        }

        if (snapshot.mode === 'daily' && snapshot.daily) {
          if (!snapshot.daily.abandoned) {
            const refreshedPlayer = useAuthStore.getState().player;
            useDailyRunStore.getState().recordDailyCompletion({
              playerName:
                refreshedPlayer?.display_name ||
                refreshedPlayer?.username ||
                user?.email?.split('@')[0] ||
                'Guest',
              score: snapshot.daily.score,
              wavesCompleted: snapshot.wavesCompleted,
              runLevel: snapshot.runLevel,
              persistInLocalLeaderboard: !isVerifiedRun,
            });
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

      runLifecycleService.trackFinalization(requestedRunId, operation);
      const finishTransition = measureTransition('run_finalization', { runId: requestedRunId });
      try {
        const succeeded = await operation;
        finishTransition(succeeded ? 'ok' : 'error');
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
        finishTransition('error');
        recordTechnicalEvent(
          { type: 'save_failure', reason: message, retryable: true },
          { runId: requestedRunId, commandId: get().authorityAttempt?.finishCommandId },
        );
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
        runLifecycleService.clearFinalization(operation);
      }
    },
  };
}
