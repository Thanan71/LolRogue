import type { RunMutationErrorCode } from '@/types/run';
import { fr } from './fr';

type ShopMutationCopyKey =
  | 'alreadyOnTeam'
  | 'commandFailed'
  | 'notEnoughGold'
  | 'offerUnavailable'
  | 'shopInventoryFull'
  | 'teamFull';

const SHOP_MUTATION_COPY_KEYS = {
  invalid_amount: 'commandFailed',
  invalid_stat_multiplier: 'commandFailed',
  insufficient_gold: 'notEnoughGold',
  inventory_full: 'shopInventoryFull',
  unknown_item: 'commandFailed',
  unique_item: 'offerUnavailable',
  max_stacks: 'offerUnavailable',
  team_full: 'teamFull',
  invalid_team_size: 'teamFull',
  duplicate_champion: 'alreadyOnTeam',
  unknown_champion: 'commandFailed',
  unsupported_champion: 'commandFailed',
  champion_not_in_team: 'commandFailed',
  item_not_found: 'offerUnavailable',
  item_already_equipped: 'offerUnavailable',
  equipment_full: 'shopInventoryFull',
  invalid_encounter: 'commandFailed',
  invalid_offer: 'offerUnavailable',
  offer_consumed: 'offerUnavailable',
  command_rejected: 'commandFailed',
} as const satisfies Record<RunMutationErrorCode, ShopMutationCopyKey>;

export function localizeShopMutationError(code: RunMutationErrorCode): string {
  return fr.encounter[SHOP_MUTATION_COPY_KEYS[code]];
}
