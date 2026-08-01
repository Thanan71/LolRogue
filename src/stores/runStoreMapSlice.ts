import type { StoreApi } from 'zustand';
import { getCanonicalRunItem, validateItemAddition } from '@/game/inventory/inventoryRules';
import { generateRunMap as generateBiomeMaps } from '@/game/map/MapGenerator-core';
import {
  isCurrentEncounterValid,
  isFrontierMoveAllowed,
  synchronizeMapFrontier,
  toEncounterNodeType,
} from '@/game/map/mapProgression';
import { completeNode as completeNodeUtil, findNode } from '@/game/map/mapUtils';
import {
  appendRunAuthorityCommand,
  usesCanonicalProgression,
} from '@/game/run/runAuthorityJournal';
import { createRunAugmentManager } from '@/game/run/runCombatant';
import { normalizeRunDomainState } from '@/game/run/runDomainInvariants';
import { getShopItemCost, getShopRecruitCost } from '@/game/run/runEncounterRules';
import {
  cloneRunLedger,
  ensureLedgerChampion,
  recordGoldSpend,
  recordItemLedgerEvent,
} from '@/game/run/runLedger';
import { transitionToNextBiome } from '@/game/run/runProgression';
import { canClaimEncounterReward } from '@/game/run/runState';
import { normalizeSpellRanks } from '@/game/run/spellUpgradeRules';
import { validateTeamAddition } from '@/game/run/teamRules';
import { useAuthStore } from '@/stores/authStore';
import {
  type InventoryEntry,
  MAX_INVENTORY_ITEMS,
  type RunMutationErrorCode,
  type RunMutationResult,
  type RunStore,
} from '@/types/run';

function mutationFailure(
  code: RunMutationErrorCode,
  error: string,
  retryable = false,
): RunMutationResult<never> {
  return { success: false, code, error, retryable };
}

const appendAuthorityCommand = (
  state: RunStore,
  command: Parameters<typeof appendRunAuthorityCommand>[2],
  explicitDedupeKey?: string,
) =>
  appendRunAuthorityCommand(
    state,
    useAuthStore.getState().user?.id ?? null,
    command,
    explicitDedupeKey,
  );

type RunMapActions = Pick<
  RunStore,
  | 'generateRunMap'
  | 'moveToNode'
  | 'completeCurrentNode'
  | 'startEncounter'
  | 'resolveEncounter'
  | 'claimCurrentEncounter'
  | 'purchaseCurrentShopItem'
  | 'purchaseCurrentShopChampion'
  | 'advanceToNextBiome'
  | 'getCurrentMap'
  | 'getCurrentNode'
  | 'updateTeamAfterCombat'
>;

export function createRunMapSlice(
  set: StoreApi<RunStore>['setState'],
  get: StoreApi<RunStore>['getState'],
): RunMapActions {
  return {
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
        const frontierNodeIds = completeNodeUtil(currentMap, currentNodeId).map((node) => node.id);
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
      set({
        claimedEncounterNodeIds: [...claimed, currentNodeId!],
        combatCheckpointNodeId: null,
        combatRecoveryRequired: false,
      });
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
        return mutationFailure('command_rejected', 'The recruitment could not be recorded.', true);
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
        (command) => command.kind === 'resolve_node' && command.payload.node_id === currentNode.id,
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
  };
}
