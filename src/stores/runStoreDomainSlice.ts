import type { StoreApi } from 'zustand';
import {
  getCanonicalRunItem,
  validateItemAddition,
  validateItemEquipment,
} from '@/game/inventory/inventoryRules';
import { validateAugmentSelection } from '@/game/run/augmentSelectionRules';
import { usesCanonicalProgression } from '@/game/run/runAuthorityJournal';
import { getRecruitStartingLevel } from '@/game/recruitment/recruitmentRules';
import { getItemSaleGold } from '@/game/run/runEncounterRules';
import {
  cloneRunLedger,
  commitCombatEvents as commitCombatEventsToLedger,
  ensureLedgerChampion,
  recordGoldGain,
  recordGoldSpend,
  recordItemLedgerEvent,
} from '@/game/run/runLedger';
import { completeCombatProgression } from '@/game/run/runProgression';
import { canUpgradeSpell, queueSpellUpgradeChoices } from '@/game/run/spellUpgradeRules';
import { validateTeamAddition, validateTeamChampionIds } from '@/game/run/teamRules';
import {
  type InventoryEntry,
  MAX_TEAM_SIZE,
  type RunMutationErrorCode,
  type RunMutationResult,
  type RunStore,
  type TeamMember,
} from '@/types/run';

function mutationFailure(
  code: RunMutationErrorCode,
  error: string,
  retryable = false,
): RunMutationResult<never> {
  return { success: false, code, error, retryable };
}

type RunDomainActions = Pick<
  RunStore,
  | 'addChampion'
  | 'removeChampion'
  | 'setTeam'
  | 'addItem'
  | 'removeItem'
  | 'consumeItems'
  | 'setRuneStacks'
  | 'equipItem'
  | 'unequipItem'
  | 'sellItem'
  | 'sortInventory'
  | 'chooseAugment'
  | 'setLastCombatRewards'
  | 'queueSpellUpgrades'
  | 'upgradeSpell'
  | 'addGold'
  | 'spendGold'
  | 'commitCombatEvents'
  | 'completeCombatProgression'
>;

export function createRunDomainSlice(
  set: StoreApi<RunStore>['setState'],
  get: StoreApi<RunStore>['getState'],
): RunDomainActions {
  return {
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
      const level = getRecruitStartingLevel(get().runLevel, team);
      set({
        team: [...team, { championId: canonicalChampionId, level, currentXp: 0, statMultiplier }],
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
  };
}
