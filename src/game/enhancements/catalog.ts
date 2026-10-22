import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import { getEnhancementTreeForRole } from '@/data/enhancementTrees';
import type { Champion } from '@/types/champion';
import type { ChampionEnhancementTree, EnhancementTreeContract } from '@/types/enhancementTree';
import { adaptLegacyEnhancementTree, validateEnhancementContract } from './contract';

/** Shared role data is retained once; only four authored champion extensions add nodes. */
export function extendEnhancementTreeForChampion(
  base: ChampionEnhancementTree,
  championId: string,
): ChampionEnhancementTree {
  const extension = CHAMPION_ENHANCEMENT_SPECIALIZATIONS[championId];
  if (!extension || extension.primaryRole !== base.primaryRole) return base;
  return {
    championId,
    primaryRole: base.primaryRole,
    coreNodes: base.coreNodes,
    branches: [...base.branches, ...extension.branches],
  };
}

export function getEnhancementTreeForChampion(
  champion: Pick<Champion, 'id' | 'tags'>,
): ChampionEnhancementTree {
  return extendEnhancementTreeForChampion(
    getEnhancementTreeForRole(champion.tags[0] ?? 'Fighter'),
    champion.id,
  );
}

export function getEnhancementContractForChampion(
  champion: Pick<Champion, 'id' | 'tags'>,
): EnhancementTreeContract {
  const contract = adaptLegacyEnhancementTree(getEnhancementTreeForChampion(champion));
  const validation = validateEnhancementContract(contract);
  if (!validation.valid)
    throw new Error(`Invalid enhancement contract: ${JSON.stringify(validation.issues)}`);
  return contract;
}
