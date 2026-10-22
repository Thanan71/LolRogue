import { normalizeGameplayStatKey } from '@/game/stats/statContract';
import type { EnhancementNode, EnhancementStatBonuses } from '@/types/enhancementTree';

/** Arithmetic shared by legal combat projections and explicitly hypothetical UI examples. */
export function aggregateEnhancementBonuses(
  nodes: readonly EnhancementNode[],
  ranks: Readonly<Record<string, number>>,
): EnhancementStatBonuses {
  const result: EnhancementStatBonuses = { flat: {}, percent: {}, effects: [] };
  for (const node of nodes) {
    const rank = ranks[node.id] ?? 0;
    if (!Number.isSafeInteger(rank) || rank < 1 || rank > (node.maxRanks ?? 1)) continue;
    for (const kind of ['flat', 'percent'] as const) {
      const authored = kind === 'flat' ? node.statBonuses : node.percentBonuses;
      for (const [name, value] of Object.entries(authored ?? {})) {
        const key = normalizeGameplayStatKey(name);
        if (key && Number.isFinite(value))
          result[kind][key] = (result[kind][key] ?? 0) + value * rank;
      }
    }
    for (const effect of node.effects ?? []) result.effects.push({ ...effect });
  }
  return result;
}
