import type { NodeMap } from '@/game/map/types';
import type { RunState } from '@/types/run';

type RunMapViewState = Pick<
  RunState,
  | 'biomeMaps'
  | 'currentBiomeIndex'
  | 'pendingAugmentIds'
  | 'pendingSpellUpgradeChampionIds'
  | 'team'
>;

export interface RunMapViewModel {
  currentMap: NodeMap | null;
  hasPendingChoice: boolean;
  pendingUpgradeChampionId: string | undefined;
  pendingUpgradeMember: RunState['team'][number] | undefined;
}

export function buildRunMapViewModel(state: RunMapViewState): RunMapViewModel {
  const pendingUpgradeChampionId = state.pendingSpellUpgradeChampionIds[0];
  return {
    currentMap: state.biomeMaps[state.currentBiomeIndex] ?? null,
    hasPendingChoice:
      state.pendingAugmentIds.length > 0 || state.pendingSpellUpgradeChampionIds.length > 0,
    pendingUpgradeChampionId,
    pendingUpgradeMember: state.team.find(
      (member) => member.championId === pendingUpgradeChampionId,
    ),
  };
}
