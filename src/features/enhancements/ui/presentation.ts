import type { EnhancementPurchaseReason } from '@/game/enhancements/eligibility';
import {
  type EnhancementContentLocale,
  enhancementContent,
  getEnhancementBranchContent,
  getEnhancementNodeContent,
} from '@/i18n/enhancementContent';
import {
  getSpecializationBranchContent,
  getSpecializationNodeContent,
} from '@/i18n/enhancementSpecializations';
import type { EnhancementUiCopy } from './copy';

export const nodeContent = (locale: EnhancementContentLocale, id: string) =>
  getSpecializationNodeContent(locale, id) ?? getEnhancementNodeContent(locale, id);
export const branchContent = (locale: EnhancementContentLocale, id: string) =>
  getSpecializationBranchContent(locale, id) ?? getEnhancementBranchContent(locale, id);

export function reasonLabel(
  reason: EnhancementPurchaseReason | null,
  locale: EnhancementContentLocale,
  copy: EnhancementUiCopy,
): string {
  if (!reason) return copy.available;
  const reasons = enhancementContent[locale].ui.lockReasons;
  switch (reason.code) {
    case 'unavailable':
      return reasons.unavailable.message;
    case 'maxed':
      return reasons.maxed.message;
    case 'mastery_level':
      return reasons.masteryLevel.message;
    case 'candies':
      return reasons.candies.message;
    case 'prerequisite':
      return reasons.prerequisite.message;
    case 'exclusive':
      return copy.exclusive;
    case 'budget':
      return copy.budget;
    case 'gated':
      return copy.gated;
    default:
      return copy.invalid;
  }
}

export function historicalNodeName(locale: EnhancementContentLocale, id: string): string {
  const specialized = getSpecializationNodeContent(locale, id);
  const base = enhancementContent[locale].coreNodes[id] ?? enhancementContent[locale].nodes[id];
  return (
    specialized?.name ??
    base?.name ??
    `${locale === 'fr-FR' ? 'Nœud historique' : 'Historical node'} (${id})`
  );
}
