import { championDB } from '@/data';
import { buildRunSummaryFromLedger, cloneRunLedger } from '@/game/run/runLedger';
import { cloneRunProgressSnapshot } from '@/game/runProgression';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import type { CompletedRunSnapshot, RunState, RunSummary } from '@/types/run';
import { calculateMaxHP } from '@/utils/statCalculator';
import type { RunLifecycleDependencies } from './contracts';

export function cloneRunSummary(summary: RunSummary): RunSummary {
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

export function createCompletedRunSnapshot(
  state: RunState,
  won: boolean,
  displayedSummary: RunSummary | undefined,
  isExplicitAbandonment: boolean,
  dependencies: RunLifecycleDependencies,
): CompletedRunSnapshot {
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
      : dependencies.readEnhancements(member.championId);
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
            : dependencies.readMasteryLevel(member.championId),
        )
      : 100;
    const runProgress = cloneRunProgressSnapshot(member.runProgress);
    return {
      championId: member.championId,
      level: member.level ?? 1,
      currentHp: member.currentHp ?? maxHp,
      currentMp: member.currentMp ?? champ?.stats.mp ?? 0,
      ...(Object.keys(runProgress).length === 0 ? {} : { runProgress }),
    };
  });

  const dailyState = dependencies.readDailyContext();
  return {
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
            score: dependencies.calculateDailyScore({
              totalWavesCompleted: state.totalWavesCompleted,
              runLevel: state.runLevel,
              gold: state.gold,
              inventory: state.inventory,
            }),
          }
        : null,
  } satisfies CompletedRunSnapshot;
}
