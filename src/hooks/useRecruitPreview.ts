import { useMemo } from 'react';
import { getRecruitPreview } from '@/game/recruitment/recruitPreview';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';

export function useRecruitPreview(championId: string, statMultiplier = 1) {
  const runLevel = useRunStore((state) => state.runLevel);
  const team = useRunStore((state) => state.team);
  const inventory = useRunStore((state) => state.inventory);
  const augmentIds = useRunStore((state) => state.augmentIds);
  const currentBiomeIndex = useRunStore((state) => state.currentBiomeIndex);
  const authorityAttempt = useRunStore((state) => state.authorityAttempt);
  const enhancements = useEnhancementStore((state) => state.enhancements);
  const masteries = useMasteryStore((state) => state.champions);

  return useMemo(
    () =>
      getRecruitPreview(
        championId,
        runLevel,
        team,
        {
          inventory,
          augmentIds,
          currentBiomeIndex,
          getUnlockedEnhancements: (id) =>
            authorityAttempt
              ? (authorityAttempt.enhancementSnapshot[id] ??
                authorityAttempt.enhancementSnapshot[id.toLowerCase()] ??
                {})
              : (enhancements[id]?.unlockedNodes ?? {}),
          getMasteryLevel: (id) =>
            authorityAttempt
              ? (authorityAttempt.masterySnapshot?.[id] ??
                authorityAttempt.masterySnapshot?.[id.toLowerCase()] ??
                0)
              : (masteries[id]?.level ?? 0),
        },
        statMultiplier,
      ),
    [
      championId,
      runLevel,
      team,
      inventory,
      augmentIds,
      currentBiomeIndex,
      authorityAttempt,
      enhancements,
      masteries,
      statMultiplier,
    ],
  );
}
