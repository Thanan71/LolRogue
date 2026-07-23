import { useEffect, useMemo } from 'react';
import { championDB } from '@/data';
import { useRunStore } from '@/stores/runStore';

export function useRunImagePreload(): void {
  const team = useRunStore((state) => state.team);
  const encounter = useRunStore((state) => state.currentEncounter);
  const championIds = useMemo(
    () => [
      ...new Set([
        ...team.map((member) => member.championId),
        ...(encounter?.enemies.map((enemy) => enemy.championId) ?? []),
      ]),
    ],
    [team, encounter],
  );

  useEffect(() => {
    const pendingImages = championIds
      .map((id) => championDB.getById(id)?.iconUrl)
      .filter((url): url is string => Boolean(url))
      .map((url) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        return image;
      });

    return () => {
      for (const image of pendingImages) {
        image.onload = null;
        image.onerror = null;
      }
    };
  }, [championIds]);
}
