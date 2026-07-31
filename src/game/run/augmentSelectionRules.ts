import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { DEFAULT_MAX_AUGMENTS } from '@/types/inventory';

export type AugmentSelectionResult =
  | { valid: true }
  | {
      valid: false;
      code: 'no_pending_augment' | 'invalid_augment';
      message: string;
    };

export function validateAugmentSelection(
  pendingAugmentIds: readonly string[],
  ownedAugmentIds: readonly string[],
  augmentId: string,
): AugmentSelectionResult {
  if (pendingAugmentIds.length === 0) {
    return {
      valid: false,
      code: 'no_pending_augment',
      message: 'No augment choice is pending.',
    };
  }
  const definition = AUGMENT_DATABASE[augmentId];
  const stacks = ownedAugmentIds.filter((id) => id === augmentId).length;
  const distinctAugments = new Set(ownedAugmentIds).size;
  if (
    !pendingAugmentIds.includes(augmentId) ||
    !definition ||
    (stacks === 0 && distinctAugments >= DEFAULT_MAX_AUGMENTS) ||
    (!definition.stackable && stacks > 0) ||
    stacks >= definition.maxStacks
  ) {
    return {
      valid: false,
      code: 'invalid_augment',
      message: `Augment "${augmentId}" is not offered.`,
    };
  }
  return { valid: true };
}
