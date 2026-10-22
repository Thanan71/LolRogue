import type { AuthorityReplayResult } from '@/game/authority/types';
import { synchronizeMapFrontier } from '@/game/map/mapProgression';
import { cloneRunLedger } from '@/game/run/runLedger';
import type { RunState } from '@/types/run';
import type { RunAuthorityAttempt } from '@/types/runAttempt';

/** Copy authoritative facts; do not recompute rewards, stats or progression. */
export function projectHistoricalCombat(
  state: RunState,
  authorityAttempt: RunAuthorityAttempt,
  result: AuthorityReplayResult,
): Partial<RunState> {
  const snapshot = result.snapshot;
  const maps = structuredClone(state.biomeMaps);
  const completed = new Set(snapshot.completedNodeIds);
  for (const map of maps) {
    for (const node of map.nodes) node.completed = completed.has(node.id);
  }
  synchronizeMapFrontier(maps, snapshot.currentBiomeIndex, snapshot.expectedNodeIds);
  const pending = snapshot.pendingEncounter;
  const pendingEncounter =
    pending && pending.nodeType !== 'start' && pending.nodeType !== 'exit'
      ? { nodeId: pending.nodeId, nodeType: pending.nodeType }
      : null;
  const node = maps[snapshot.currentBiomeIndex]?.nodes.find(
    (entry) => entry.id === snapshot.currentNodeId,
  );
  const summary = result.combatSummaries[result.combatSummaries.length - 1];
  const reward = summary?.reward;
  const itemIds = [
    ...snapshot.inventory.map((entry) => entry.instanceId),
    ...snapshot.ledger.items.map((entry) => entry.instanceId),
  ];
  const itemPrefix = `item_${snapshot.runUuid}_`;
  const nextItemInstanceId = itemIds.reduce((next, id) => {
    const counter = id.startsWith(itemPrefix) ? Number(id.slice(itemPrefix.length)) : NaN;
    return Number.isSafeInteger(counter) ? Math.max(next, counter + 1) : next;
  }, state.nextItemInstanceId);

  return {
    authorityAttempt,
    team: snapshot.team.map((member) => {
      const { statBoosts, ...rest } = structuredClone(member);
      return {
        ...rest,
        ...(Object.keys(statBoosts).length > 0 ? { statBoosts } : {}),
        currentHp: member.currentHp ?? undefined,
        currentMp: member.currentMp ?? undefined,
      };
    }),
    inventory: structuredClone(snapshot.inventory),
    ledger: cloneRunLedger(snapshot.ledger),
    runeIds: [...snapshot.runeIds],
    augmentIds: [...snapshot.augmentIds],
    pendingAugmentIds: [...snapshot.pendingAugmentIds],
    pendingSpellUpgradeChampionIds: [...snapshot.pendingSpellUpgradeChampionIds],
    gold: snapshot.gold,
    runLevel: snapshot.runLevel,
    currentBiome: snapshot.currentBiome,
    currentBiomeIndex: snapshot.currentBiomeIndex,
    biomesVisited: [...snapshot.biomesVisited],
    currentWave: snapshot.currentWave,
    totalWavesCompleted: snapshot.totalWavesCompleted,
    nextItemInstanceId,
    biomeMaps: maps,
    currentNodeId: snapshot.currentNodeId,
    frontierNodeIds: [...snapshot.expectedNodeIds],
    chosenPathNodeIds: authorityAttempt.commands
      .filter((command) => command.kind === 'move_node')
      .map((command) => command.payload.node_id),
    completedNodeIds: [...snapshot.completedNodeIds],
    claimedEncounterNodeIds: [
      ...new Set([
        ...state.claimedEncounterNodeIds,
        ...result.combatSummaries.map((entry) => entry.nodeId),
      ]),
    ],
    pendingEncounter,
    currentEncounter:
      pendingEncounter && node?.encounter?.type === 'combat' ? node.encounter : null,
    combatCheckpointNodeId: null,
    combatRecoveryRequired: false,
    lastCombatRewards: reward
      ? {
          xp: reward.xpPerChampion,
          gold: reward.gold,
          itemId: reward.droppedItemId,
          itemName: null,
          itemBlockedByCapacity: reward.dropBlockedByCapacity,
          levelsGained: Math.max(
            0,
            ...snapshot.team.map(
              (member) =>
                member.level -
                (state.team.find((entry) => entry.championId === member.championId)?.level ?? 1),
            ),
          ),
        }
      : null,
  };
}
