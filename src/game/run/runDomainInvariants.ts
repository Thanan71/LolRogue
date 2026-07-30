import { normalizeInventory, validateItemAddition } from '@/game/inventory/inventoryRules';
import {
  getSpellRankCap,
  normalizeSpellRanks,
  normalizeSpellUpgradeQueue,
  SPELL_SLOTS,
} from '@/game/run/spellUpgradeRules';
import { normalizeTeamMembers } from '@/game/run/teamRules';
import {
  MAX_INVENTORY_ITEMS,
  MAX_ITEMS_PER_CHAMPION,
  MAX_TEAM_SIZE,
  type InventoryEntry,
  type TeamMember,
} from '@/types/run';

export interface RunDomainState {
  team: TeamMember[];
  inventory: InventoryEntry[];
  pendingSpellUpgradeChampionIds: string[];
}

export function normalizeRunDomainState(input: {
  team: unknown;
  inventory: unknown;
  pendingSpellUpgradeChampionIds: unknown;
}): RunDomainState {
  const team = normalizeTeamMembers(input.team).map((member) => ({
    ...member,
    spellRanks: normalizeSpellRanks(member.championId, member.level ?? 1, member.spellRanks),
  }));
  const inventory = normalizeInventory(
    input.inventory,
    team.map((member) => member.championId),
  );
  const pendingSpellUpgradeChampionIds = normalizeSpellUpgradeQueue(
    team,
    Array.isArray(input.pendingSpellUpgradeChampionIds) ? input.pendingSpellUpgradeChampionIds : [],
  );
  return { team, inventory, pendingSpellUpgradeChampionIds };
}

export function getRunDomainInvariantViolations(state: RunDomainState): string[] {
  const violations: string[] = [];
  const championIds = state.team.map((member) => member.championId);
  if (state.team.length > MAX_TEAM_SIZE) violations.push('team_size');
  if (new Set(championIds).size !== championIds.length) violations.push('duplicate_champion');

  for (const member of state.team) {
    if (
      member.level !== undefined &&
      (!Number.isSafeInteger(member.level) || member.level < 1 || member.level > 18)
    ) {
      violations.push(`champion_level:${member.championId}`);
    }
    if (
      member.statMultiplier !== undefined &&
      (!Number.isFinite(member.statMultiplier) ||
        member.statMultiplier < 0.1 ||
        member.statMultiplier > 10)
    ) {
      violations.push(`stat_multiplier:${member.championId}`);
    }
    for (const slot of SPELL_SLOTS) {
      const rank = member.spellRanks?.[slot] ?? 1;
      if (
        !Number.isSafeInteger(rank) ||
        rank < 1 ||
        rank > getSpellRankCap(member.championId, slot, member.level ?? 1)
      ) {
        violations.push(`spell_rank:${member.championId}:${slot}`);
      }
    }
  }

  if (state.inventory.length > MAX_INVENTORY_ITEMS) violations.push('inventory_capacity');
  if (new Set(state.inventory.map((entry) => entry.instanceId)).size !== state.inventory.length) {
    violations.push('duplicate_item_instance');
  }
  const accepted: InventoryEntry[] = [];
  for (const entry of state.inventory) {
    if (!validateItemAddition(accepted, entry.item).valid) {
      violations.push(`item_contract:${entry.instanceId}`);
    } else {
      accepted.push(entry);
    }
    if (entry.equippedToChampionId && !championIds.includes(entry.equippedToChampionId)) {
      violations.push(`equipment_owner:${entry.instanceId}`);
    }
  }
  for (const championId of championIds) {
    if (
      state.inventory.filter((entry) => entry.equippedToChampionId === championId).length >
      MAX_ITEMS_PER_CHAMPION
    ) {
      violations.push(`equipment_capacity:${championId}`);
    }
  }
  const normalizedQueue = normalizeSpellUpgradeQueue(
    state.team,
    state.pendingSpellUpgradeChampionIds,
  );
  if (
    normalizedQueue.length !== state.pendingSpellUpgradeChampionIds.length ||
    normalizedQueue.some(
      (championId, index) => championId !== state.pendingSpellUpgradeChampionIds[index],
    )
  ) {
    violations.push('spell_upgrade_queue');
  }
  return violations;
}
